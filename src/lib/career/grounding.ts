/**
 * 근거 검증
 *
 * AI 가 만든 카드 항목은 반드시 "사용자가 실제로 말한 문장"에 붙어 있어야 한다.
 * 이 파일을 통과하지 못한 항목은 버린다. 화면에도, 문서에도 들어가지 않는다.
 *
 * 검증 단계
 *  1. 인용 검증  : evidence.quote 가 해당 사용자 메시지에 글자 그대로 있는가
 *  2. 수치 검증  : 항목에 쓰인 숫자 토큰이 인용에 "정확히 같은 토큰"으로 있는가
 *  3. 표현 검증  : 성과·평가를 뜻하는 단어가 인용에 없는데 쓰였는가
 */

import type { AiCardItem, AiExtraction, AiInterpretation, ChatMessage, Evidence } from "./types";
import { ALL_FIELDS } from "./types";

/** 공백 차이만 무시한다. 단어를 바꾸는 정규화는 하지 않는다. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* 1. 인용 검증                                                         */
/* ------------------------------------------------------------------ */

export function validateEvidence(evidence: Evidence[], messages: ChatMessage[]): Evidence[] {
  const userMessages = new Map(
    messages.filter((m) => m.role === "user").map((m) => [m.id, normalize(m.text)]),
  );

  return evidence.filter((e) => {
    if (!e || typeof e.messageId !== "string" || typeof e.quote !== "string") return false;
    const quote = normalize(e.quote);
    if (quote.length < 4) return false;

    // 사용자가 직접 수정한 항목은 사용자 본인이 출처다.
    if (e.messageId.startsWith("edit:")) return true;

    const source = userMessages.get(e.messageId);
    if (!source) return false;
    return source.includes(quote);
  });
}

/* ------------------------------------------------------------------ */
/* 2. 수치 검증                                                         */
/* ------------------------------------------------------------------ */

const NUMBER_TOKEN = /\d+(?:\.\d+)?/g;

function numberTokens(text: string): string[] {
  return Array.from(text.matchAll(NUMBER_TOKEN), (m) => m[0]);
}

/**
 * 항목에 쓰인 숫자가 근거 인용에 "정확히 같은 토큰"으로 존재하는지 확인한다.
 * 부분 문자열 비교를 쓰면 "1.5배"가 "5배"를 통과시키므로 토큰 단위로 비교한다.
 */
export function hasUnsupportedNumber(text: string, evidence: Evidence[]): boolean {
  const claimed = numberTokens(text);
  if (claimed.length === 0) return false;

  const supported = new Set(evidence.flatMap((e) => numberTokens(e.quote)));
  return claimed.some((token) => !supported.has(token));
}

/* ------------------------------------------------------------------ */
/* 3. 표현 검증                                                         */
/* ------------------------------------------------------------------ */

/**
 * 사용자가 직접 말하지 않았다면 쓸 수 없는 표현.
 * 성과 평가, 서열, 민간 직급 환산처럼 검증할 수 없는 주장들이다.
 */
const CLAIM_WORDS = [
  // 성과·평가
  "무사고",
  "최우수",
  "우수",
  "표창",
  "수상",
  "최초",
  "최고",
  "대폭",
  "향상",
  "절감",
  "단축",
  "개선",
  "달성",
  "성공",
  "완벽",
  "탁월",
  "뛰어난",
  "효율",
  "성과",
  "기여",
  // 역할 과장
  "리더십",
  "통솔",
  "총괄",
  "전담",
  "주도",
  "책임자",
  "관리자",
  // 민간 직급 환산
  "과장급",
  "차장급",
  "팀장급",
  "부장급",
  "상응",
  "동등",
];

export function unsupportedClaimWords(text: string, evidence: Evidence[]): string[] {
  const supported = evidence.map((e) => e.quote).join(" ");
  return CLAIM_WORDS.filter((w) => text.includes(w) && !supported.includes(w));
}

/* ------------------------------------------------------------------ */
/* 항목 검증                                                            */
/* ------------------------------------------------------------------ */

export type ValidatedItem = AiCardItem & { evidence: Evidence[] };

export function validateCardItem(
  item: AiCardItem,
  messages: ChatMessage[],
): ValidatedItem | null {
  if (!item || typeof item.text !== "string") return null;
  const text = item.text.trim();
  if (text.length < 4) return null;
  if (!ALL_FIELDS.includes(item.field)) return null;

  const evidence = validateEvidence(item.evidence ?? [], messages);
  if (evidence.length === 0) return null;
  if (hasUnsupportedNumber(text, evidence)) return null;
  if (unsupportedClaimWords(text, evidence).length > 0) return null;

  return { field: item.field, text, evidence };
}

export function validateInterpretation(
  interp: AiInterpretation,
  messages: ChatMessage[],
): AiInterpretation | null {
  if (!interp || typeof interp.text !== "string") return null;
  const text = interp.text.trim();
  if (text.length < 4) return null;

  const allUserText = messages
    .filter((m) => m.role === "user")
    .map((m) => normalize(m.text))
    .join("\n");

  const quotes = (interp.sourceQuotes ?? [])
    .map((q) => normalize(String(q)))
    .filter((q) => q.length >= 4 && allUserText.includes(q));

  if (quotes.length === 0) return null;

  // 해석문에도 수치 기준을 적용한다.
  const asEvidence: Evidence[] = quotes.map((q) => ({ messageId: "interp", quote: q }));
  if (hasUnsupportedNumber(text, asEvidence)) return null;

  return { text, sourceQuotes: quotes };
}

/** AI 추출 결과 전체를 검증한다. */
export function groundExtraction(raw: AiExtraction, messages: ChatMessage[]): AiExtraction {
  const items = (raw.items ?? [])
    .map((i) => validateCardItem(i, messages))
    .filter((i): i is ValidatedItem => i !== null);

  const interpretations = (raw.interpretations ?? [])
    .map((i) => validateInterpretation(i, messages))
    .filter((i): i is AiInterpretation => i !== null);

  return {
    reflection: typeof raw.reflection === "string" ? raw.reflection.trim() : "",
    items,
    interpretations,
    skipped: raw.skipped === true,
    conflicts: (raw.conflicts ?? []).map((c) => String(c).trim()).filter(Boolean).slice(0, 3),
  };
}

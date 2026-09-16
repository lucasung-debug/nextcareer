/**
 * 답변 해석 (AI 없이 처리하는 부분)
 *
 * 군별·신분·이동사유·기간 같은 구조적 답변은 AI 를 부르지 않는다.
 * AI 호출을 아끼고, 결과를 예측 가능하게 만들기 위해서다.
 */

import type { Branch, ServiceType } from "./types.js";

/* ------------------------------------------------------------------ */
/* 건너뛰기 / 거절                                                      */
/* ------------------------------------------------------------------ */

// 한글은 어미가 바뀔 때 음절 자체가 바뀜다.
// 예: "넘어가다" -> "넘어갈게요" (가 ≠ 갈)
// 어간만 보고 판단하면 놓치므로 활용형을 함께 넣는다.
const SKIP_PATTERNS = [
  /기억(이)?\s*(잘)?\s*안\s*나/,
  /모르(겠|겠어|겠습니다|겠네)/,
  /넘어(가|갈|갑|갔)/,
  /넘기(겠|고|자)/,
  /건너(뛰|뛸|뛰어)/,
  /패스/,
  /해당\s*없/,
  /딱히\s*없/,
  /특별히\s*없/,
  /생각(이)?\s*안\s*나/,
  /질문(을)?\s*바꿔/,
  /^없(어요|습니다|음|다)?\.?$/,
  /^없다$/,
  /^스킵$/i,
];

export function isSkipAnswer(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return SKIP_PATTERNS.some((p) => p.test(t));
}

/** "없음" / "더 없음" 같은 종료 선택 */
export function isNoMoreAnswer(text: string): boolean {
  const t = text.trim();
  return /^(없음|더\s*없음|없어요|아니요|아니오|끝)$/.test(t);
}

/* ------------------------------------------------------------------ */
/* 경험을 지어내 달라는 요청                                             */
/* ------------------------------------------------------------------ */

const FABRICATION_PATTERNS = [
  /지어내/,
  /만들어\s*(줘|주세요|달라)/,
  /꾸며/,
  /부풀려/,
  /과장(해|되게)/,
  /그럴듯하게\s*(써|만들)/,
  /없는\s*(경험|성과).*(써|넣)/,
];

export function isFabricationRequest(text: string): boolean {
  return FABRICATION_PATTERNS.some((p) => p.test(text));
}

export const FABRICATION_REPLY =
  "없는 경험을 만들어 드리지는 못합니다. 실제로 하신 일만 정리해도 충분히 설명이 됩니다. 대신 지금 하신 일을 조금 더 구체적으로 여쭤볼게요.";

/* ------------------------------------------------------------------ */
/* 군별 / 신분                                                          */
/* ------------------------------------------------------------------ */

export function parseBranch(text: string): Branch | null {
  const t = text.replace(/\s/g, "");
  if (/해병/.test(t)) return "해병대";
  if (/육군/.test(t)) return "육군";
  if (/해군/.test(t)) return "해군";
  if (/공군/.test(t)) return "공군";
  if (/국방부|합참|기타/.test(t)) return "국방부·기타";
  return null;
}

export function parseServiceType(text: string): ServiceType | null {
  const t = text.replace(/\s/g, "");
  if (/준사관|준위/.test(t)) return "준사관";
  if (/부사관|하사|중사|상사|원사/.test(t)) return "부사관";
  if (/군무원/.test(t)) return "군무원";
  if (/장교|소위|중위|대위|소령|중령|대령/.test(t)) return "장교";
  return null;
}

/* ------------------------------------------------------------------ */
/* 경험 제목 정리                                                       */
/* ------------------------------------------------------------------ */

/**
 * "근무표 확인하고 일정 조정하는 일을 했어요" -> "근무표 확인하고 일정 조정"
 * 지어내지 않고, 사용자가 쓴 표현을 줄이기만 한다.
 */
export function toExperienceTitle(text: string): string {
  let t = (text.trim().split(/[.\n]/)[0] ?? text.trim()).trim();

  // 한글은 어미·부사가 뒤에 붙으므로 뒤에서부터 한 겹씩 떼어낸다.
  //   "보급품 수불 관리하는 일을 주로 했어요" -> "보급품 수불 관리"
  const strip = [
    // 1) 맺음말
    /\s*(했어요|했습니다|합니다|해요|했음|함|였어요|이었어요|이에요|예요|입니다)$/,
    // 2) 동사 어간
    /\s*(했|맡았|담당했|수행했|처리했)$/,
    // 2-1) "~을 담당" 처럼 조사 + 서술명사만 남은 경우
    /\s*(을|를)\s*(담당|수행|처리|진행|관리|맡아)$/,
    // 3) 부사
    /\s*(주로|자주|보통|많이|계속|늘|항상|거의|대부분)$/,
    // 4) "~하는 일을", "~하는 것도" 꼴리
    /\s*(하는|한|했던)?\s*(일|업무|것)(을|를|은|는|도|만)?$/,
    // 5) 마지막에 조사만 남은 경우 (제목이 조사로 끝나면 항상 어색하다)
    /\s*(을|를|은|는|이|가|도)$/,
  ];

  let previous = "";
  while (previous !== t) {
    previous = t;
    for (const re of strip) t = t.replace(re, "").trim();
  }

  if (t.length > 30) t = `${t.slice(0, 30)}…`;
  return t || text.trim().slice(0, 30);
}

/**
 * 확인한 사실을 원티드 직군·공고 검색으로 연결한다.
 *
 * 규칙
 *  - AI가 직무를 지어내지 않는다. 사전 토큰이 "확인(confirmed)" 문장에 글자 그대로 있을 때만 직군을 연다.
 *  - 보직명(role)·경험 제목(title)은 분류 근거로 쓰지 않는다.
 *  - 부정·한정 문장("재고 관리는 하지 않았습니다", "~에 전달만 했고 ...는 담당하지 않았습니다")은
 *    절(clause) 단위로 걸러서, 하지 않은 일을 할 줄 아는 것처럼 보이지 않게 한다.
 *  - 넓은 단어('안내','점검','청구','인사') 하나만으로는 직군을 열지 않는다. 명확한 복합 토큰만 쓴다.
 *  - 검색어는 통제된 민간 키워드('물류','인사','HR','총무' ...)만 사용한다.
 *    실측상 원티드 검색은 흔한 직무명 한 단어가 가장 잘 맞는다 (예: '인사' → 포지션 185+).
 *    넓은 검색어는 괜찮다 — 넓은 매칭 트리거와 달리 검색어에는 사용자 문장이 절대 섞이지 않는다.
 *    인용문·이름·부대·군 직무명은 URL에 절대 넣지 않는다.
 *  - 공고 본문을 가져오거나 크롤링하지 않고, 외부 API를 부르지 않는다. 원티드 검색/직군 URL만 만든다.
 *  - 직군 연결은 탐색용 제안이지 적합도 점수·연차·자격 판단이 아니다. (caveat 참고)
 *  - 과장급·총괄 같은 환산 표현을 붙이지 않는다.
 */

import { type FieldKey, type SessionState } from "./types.js";

export type JobFamilyId =
  | "logistics"
  | "hr"
  | "admin"
  | "customer"
  | "maintenance"
  | "security";

export type JobBridgeReason = {
  source: "item" | "role" | "title";
  /** 근거가 된 확인 항목 id (source === "item" 일 때 항상 채워짐) */
  itemId: string;
  /** 근거 항목의 슬롯 */
  field: FieldKey;
  /** 확인 문장에 글자 그대로 있었던 토큰 */
  token: string;
  /** 확인된 항목 원문 그대로 (URL에는 절대 들어가지 않는다) */
  quote: string;
};

export type JobFamilyMatch = {
  id: JobFamilyId;
  label: string;
  listUrl: string;
  searchUrl: string;
  keywords: string[];
  reasons: JobBridgeReason[];
  /** 탐색용 제안 설명 */
  description?: string;
  /** 과장 방지 주의 문구 (적합도·수준·자격 판단이 아님을 명시) */
  caveat?: string;
};

export type JobBridgeResult = {
  families: JobFamilyMatch[];
  catalogUrl: string;
};

export const WANTED_ORIGIN = "https://www.wanted.co.kr";
export const WANTED_CATALOG_URL = `${WANTED_ORIGIN}/wdlist`;

type FamilyDef = {
  id: JobFamilyId;
  label: string;
  /** 실측된 직군 목록 경로만 넣는다. 없으면 통제 키워드 검색 URL을 쓴다. */
  listPath: string | null;
  /**
   * 확인 문장에서 글자 그대로 찾을 토큰.
   * 넓은 단어('안내','점검','청구','인사')는 단독으로 넣지 않고, 의미가 명확한 복합형만 넣는다.
   */
  tokens: string[];
  /** 원티드 검색에 나가는 통제된 민간 키워드. 군 직무명·부대·인용문은 절대 없다. */
  searchKeywords: string[];
  description: string;
};

/** 모든 직군 제안에 공통으로 붙는 주의 문구 */
export const JOB_BRIDGE_CAVEAT =
  "확인된 문장과의 겹침을 보여주는 탐색용 제안입니다. 직무 적합도·수준·자격을 판단하지 않습니다.";

const FAMILIES: FamilyDef[] = [
  {
    id: "logistics",
    label: "물류·무역",
    listPath: "/wdlist/532",
    tokens: [
      "보급품",
      "보급관",
      "수불대장",
      "수불부",
      "수불",
      "재고",
      "재고관리",
      "창고",
      "불출",
      "입고",
      "출고",
      "자재",
      "군수",
      "물류",
      "물품",
      "보급",
    ],
    searchKeywords: ["물류", "재고관리"],
    description: "재고·창고·물자 수불 관련 확인 문장이 있어 물류 계열을 탐색해 볼 수 있습니다.",
  },
  {
    id: "hr",
    label: "인사",
    listPath: null,
    tokens: [
      "인사명령",
      "인사대장",
      "인사담당",
      "인사처",
      "인사과",
      "인사서류",
      "인사 업무",
      "인사 행정",
    ],
    searchKeywords: ["인사", "HR"],
    description: "인사 서류·인사 업무 관련 확인 문장이 있어 인사 계열을 탐색해 볼 수 있습니다.",
  },
  {
    id: "admin",
    label: "총무·사무",
    listPath: null,
    tokens: ["공문", "행정", "문서수발", "민원서류", "결재"],
    searchKeywords: ["총무", "사무"],
    description: "공문·행정 서류 관련 확인 문장이 있어 총무·사무 계열을 탐색해 볼 수 있습니다.",
  },
  {
    id: "customer",
    label: "고객서비스",
    listPath: null,
    tokens: ["민원", "민원 접수", "고객 안내", "안내 업무", "접수 업무"],
    searchKeywords: ["고객상담", "상담"],
    description: "민원·고객 안내·접수 관련 확인 문장이 있어 고객서비스 계열을 탐색해 볼 수 있습니다.",
  },
  {
    id: "maintenance",
    label: "생산·정비",
    listPath: null,
    tokens: ["정비", "정비반", "설비 점검", "장비 점검", "점검 업무", "품질"],
    searchKeywords: ["정비", "시설관리"],
    description: "정비·설비 점검 관련 확인 문장이 있어 생산·정비 계열을 탐색해 볼 수 있습니다.",
  },
  {
    id: "security",
    label: "보안",
    listPath: null,
    tokens: ["군사경찰", "수사관", "수사", "출입통제", "경비근무", "경비대", "경비 업무", "위병소"],
    searchKeywords: ["경비", "보안"],
    description: "경비·출입통제·수사 관련 확인 문장이 있어 보안 계열을 탐색해 볼 수 있습니다.",
  },
];

/* ------------------------------------------------------------------ */
/* 부정·한정 절 필터                                                    */
/* ------------------------------------------------------------------ */

/**
 * 문장을 절로 나누는 기준. "확인하고", "했고", "지만" 같은 접속 경계만 자른다.
 * 부정 절 안의 토큰은 겹침 근거로 인정하지 않기 위해 절 단위로 검사한다.
 */
const CLAUSE_SPLIT =
  /(?:했지만|했고|했으며|하였고|하였으며|하고|지만|하지만|그러나|그런데|며|,|\.|!|\?|;|·)/;

/** 이 절에서는 그 일을 하지 않았다는 표시 */
const DENIAL_MARKERS = [
  "않",
  "안 했",
  "안했",
  "못했",
  "못 하",
  "없었",
  "없습",
  "없어",
  "없다",
  "아니",
  "아닌",
];

/** 이 절은 실제 수행이 아니라 전달·참석 등에 그쳤다는 표시 */
const LIMITING_MARKERS = ["전달만", "보고만", "참석만"];

function isSuppressedClause(clause: string): boolean {
  const markers = [...DENIAL_MARKERS, ...LIMITING_MARKERS];
  return markers.some((m) => clause.includes(m));
}

/* ------------------------------------------------------------------ */
/* 토큰 매칭                                                            */
/* ------------------------------------------------------------------ */

export function wantedSearchUrl(query: string): string {
  return `${WANTED_ORIGIN}/search?query=${encodeURIComponent(query)}&tab=position`;
}

function findTokens(haystack: string, tokens: string[]): string[] {
  const matches = tokens.filter((token) => haystack.includes(token));
  // 짧은 일반 토큰은 더 구체적인 확인 문장 토큰과 중복되므로 제외한다.
  return matches
    .filter((token) => !matches.some((other) => other !== token && other.includes(token)))
    .sort((a, b) => haystack.indexOf(a) - haystack.indexOf(b) || b.length - a.length);
}

type Haystack = {
  source: JobBridgeReason["source"];
  itemId: string;
  field: FieldKey;
  text: string;
};

function haystacksFrom(state: SessionState): Haystack[] {
  const out: Haystack[] = [];
  for (const assignment of state.assignments) {
    for (const experience of assignment.experiences) {
      for (const item of experience.items) {
        // 보직명·경험 제목은 분류 힌트일 뿐, 확인된 사실로 취급하지 않는다.
        if (item.status !== "confirmed") continue;
        const text = item.text.trim();
        if (!text) continue;
        out.push({ source: "item", itemId: item.id, field: item.field, text });
      }
    }
  }
  return out;
}

function confirmedItemCount(state: SessionState): number {
  return state.assignments.reduce(
    (n, a) => n + a.experiences.reduce((m, e) => m + e.items.filter((i) => i.status === "confirmed").length, 0),
    0,
  );
}

function uniqueReasons(reasons: JobBridgeReason[]): JobBridgeReason[] {
  const seen = new Set<string>();
  const out: JobBridgeReason[] = [];
  for (const r of reasons) {
    // 같은 확인 문장(정확히 같은 구절)에서 같은 토큰은 한 번만 근거로 삼는다.
    const key = `${r.token}\u0000${r.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* 직군 연결                                                            */
/* ------------------------------------------------------------------ */

export function buildJobBridge(state: SessionState): JobBridgeResult {
  // 상태를 절대 바꾸지 않는다. 읽기 전용으로 순회한다.
  const haystacks = haystacksFrom(state);
  const families: JobFamilyMatch[] = [];

  for (const family of FAMILIES) {
    const reasons: JobBridgeReason[] = [];
    for (const h of haystacks) {
      for (const clause of h.text.split(CLAUSE_SPLIT)) {
        const trimmed = clause.trim();
        if (!trimmed) continue;
        // 부정·한정 절 안의 토큰은 하지 않은 일을 할 줄 아는 것처럼 보이므로 인정하지 않는다.
        if (isSuppressedClause(trimmed)) continue;
        for (const token of findTokens(trimmed, family.tokens)) {
          reasons.push({ source: h.source, itemId: h.itemId, field: h.field, token, quote: h.text });
        }
      }
    }
    const unique = uniqueReasons(reasons);
    if (unique.length === 0) continue;

    // 검색어는 통제된 민간 키워드만. 인용문·부대·군 직무명은 절대 URL에 넣지 않는다.
    const keywords = [...family.searchKeywords];
    const primary = keywords[0] ?? family.label;
    families.push({
      id: family.id,
      label: family.label,
      listUrl: family.listPath ? `${WANTED_ORIGIN}${family.listPath}` : wantedSearchUrl(primary),
      searchUrl: wantedSearchUrl(primary),
      keywords,
      reasons: unique,
      description: family.description,
      caveat: JOB_BRIDGE_CAVEAT,
    });
  }

  families.sort((a, b) => b.reasons.length - a.reasons.length || a.label.localeCompare(b.label, "ko"));

  return {
    families: families.slice(0, 3),
    catalogUrl: WANTED_CATALOG_URL,
  };
}

export function jobBridgeAvailable(state: SessionState): boolean {
  return confirmedItemCount(state) > 0;
}

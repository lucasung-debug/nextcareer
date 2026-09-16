/**
 * 다음경력 - 코어 데이터 모델
 *
 * 설계 원칙
 * 1. 사용자가 실제로 말한 문장만 사실로 저장한다. (evidence 없는 항목은 존재할 수 없다)
 * 2. 한 사람은 여러 보직(assignment)을 거치고, 보직마다 여러 경험(experience)이 있다.
 * 3. 확인(confirmed)되지 않은 내용은 최종 문서에 사실로 실리지 않는다.
 * 4. 결과가 없어도 경력이다. outcomes 는 비어 있거나 "미확인"일 수 있다.
 */

export type Role = "assistant" | "user";

export type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  /** 오프라인 가상 사례 픽스처 여부 */
  sample?: boolean;
};

/** 사용자 메시지에 글자 그대로 존재하는 인용 */
export type Evidence = {
  messageId: string;
  quote: string;
};

/* ------------------------------------------------------------------ */
/* 기본 정보 (복무 / 보직 이력)                                        */
/* ------------------------------------------------------------------ */

/** 군별 */
export type Branch = "육군" | "해군" | "공군" | "해병대" | "국방부·기타" | "미입력";

/** 신분 */
export type ServiceType = "장교" | "준사관" | "부사관" | "군무원" | "미입력";

/**
 * 부대명 표기 방식.
 * 실제 부대명을 문서에 그대로 쓰는 것은 사용자가 직접 선택해야 한다.
 * 기본값은 일반화 표기다.
 */
export type UnitDisplay =
  /** 사용자가 적은 그대로 사용 (사용자가 명시적으로 선택한 경우) */
  | "as-given"
  /** "○○부대" 처럼 일반화해서 표기 */
  | "generalized";

export type PeriodPoint = {
  year: number;
  month: number;
};

export type Period = {
  start: PeriodPoint;
  /** null 이면 재직 중 */
  end: PeriodPoint | null;
};

/** 보직을 떠난 사유 */
export type MoveReasonCode =
  | "정기인사"
  | "보직변경"
  | "부대이동"
  | "파견복귀"
  | "진급"
  | "전역"
  | "기타"
  | "미확인";

export type Assignment = {
  id: string;
  /** 사용자가 입력한 소속 표기 (예: "OO사단 헌병대", "수도권 소재 부대") */
  unitLabel: string;
  /** 문서에 어떻게 실을지 */
  unitDisplay: UnitDisplay;
  /** 일반화 표기를 선택했을 때 문서에 실제로 들어갈 문자열 */
  unitGeneralized: string;
  /** 보직명 (예: "군사경찰 수사관") */
  role: string;
  period: Period | null;
  /** 원문 그대로의 기간 입력 (파싱 실패 시 문서에 그대로 표기) */
  periodRaw: string;
  moveReason: MoveReasonCode;
  /** 사용자가 적은 이동 사유 원문 */
  moveReasonRaw: string;
  experiences: Experience[];
  /** "이 보직에서 다른 일도 있었나요?" 를 이미 물었는지 (반복 질문 방지) */
  moreExperiencesAsked: boolean;
};

/* ------------------------------------------------------------------ */
/* 경험 / 카드                                                          */
/* ------------------------------------------------------------------ */

/**
 * 경험 카드 필드.
 * 기존 4개(duties/scope/actions/outcomes)에 심층 면담용 4개를 추가했다.
 * 경력기술서의 "담당업무 / 수행내용 / 결과" 블록으로 묶인다.
 */
export type FieldKey =
  | "duties"
  | "scope"
  | "actions"
  | "judgment"
  | "collaboration"
  | "tools"
  | "difficulty"
  | "outcomes";

export const FIELD_LABELS: Record<FieldKey, string> = {
  duties: "수행 업무",
  scope: "책임 범위",
  actions: "직접 한 행동",
  judgment: "판단 기준",
  collaboration: "함께 일한 대상",
  tools: "사용한 도구·양식",
  difficulty: "어려웠던 점과 대처",
  outcomes: "결과 / 확인 사항",
};

/** 경력기술서에서 어느 블록에 들어가는지 */
export const FIELD_BLOCK: Record<FieldKey, "담당업무" | "수행내용" | "결과"> = {
  duties: "담당업무",
  scope: "담당업무",
  actions: "수행내용",
  judgment: "수행내용",
  collaboration: "수행내용",
  tools: "수행내용",
  difficulty: "결과",
  outcomes: "결과",
};

export const ALL_FIELDS: FieldKey[] = [
  "duties",
  "scope",
  "actions",
  "judgment",
  "collaboration",
  "tools",
  "difficulty",
  "outcomes",
];

export type ItemStatus = "draft" | "confirmed" | "unknown";

export type CardItem = {
  id: string;
  experienceId: string;
  field: FieldKey;
  text: string;
  evidence: Evidence[];
  status: ItemStatus;
  /** 사용자가 직접 입력·수정한 문장이면 true (AI 추출이 아님) */
  userAuthored: boolean;
};

export type Interpretation = {
  id: string;
  experienceId: string;
  text: string;
  /** 근거로 삼은 CardItem id */
  sourceItemIds: string[];
};

/** 사용자가 답변을 건너뛴 슬롯 기록 */
export type SkipRecord = {
  field: FieldKey;
  /** 건너뛴 이유 원문 */
  reason: string;
};

export type Experience = {
  id: string;
  assignmentId: string;
  /** 경험 이름 (예: "근무표 운영") */
  title: string;
  items: CardItem[];
  interpretations: Interpretation[];
  skipped: SkipRecord[];
  /** 슬롯별 질문 횟수 */
  asked: Partial<Record<FieldKey, number>>;
  /** 사용자가 이 경험에 대해 "정리 끝" 을 누른 상태 */
  closed: boolean;
};

/* ------------------------------------------------------------------ */
/* 세션                                                                 */
/* ------------------------------------------------------------------ */

export type Phase =
  /** 시작 화면 */
  | "idle"
  /** 군별·신분 등 복무 기본정보 */
  | "service"
  /** 보직 하나의 기본정보(소속/보직/기간/이동사유) */
  | "assignment"
  /** 이 보직에서 어떤 일들을 했는지 나열 */
  | "experience_pick"
  /** 경험 하나를 슬롯별로 캐묻기 */
  | "deep_dive"
  /** 사실 확인 / 충돌 정리 */
  | "review"
  /** 경력기술서 생성 */
  | "document";

export type Mode = "idle" | "sample" | "live";

export type ServiceProfile = {
  branch: Branch;
  serviceType: ServiceType;
  /** 전역(예정) 사유 원문 */
  separationReason: string;
  /** 이름 - 문서 상단에 넣을지 사용자가 선택. 비우면 빈칸으로 출력 */
  displayName: string;
};

export type FinalDocument = {
  /** 문서 미리보기 텍스트 */
  preview: string;
  /** 사용자가 "실제 경험과 일치" 를 확인했는지 */
  confirmed: boolean;
  /** preview 를 만든 시점의 사실 스냅샷 해시. 사실이 바뀌면 달라진다. */
  factsHash: string;
};

export type SessionState = {
  mode: Mode;
  phase: Phase;
  messages: ChatMessage[];
  service: ServiceProfile;
  assignments: Assignment[];
  /** 지금 다루고 있는 보직 */
  activeAssignmentId: string | null;
  /** 지금 캐묻고 있는 경험 */
  activeExperienceId: string | null;
  doc: FinalDocument;
  consentGiven: boolean;
  turns: number;
  /** "다음 보직이 있나요?" 를 이미 물었는지 (반복 질문 방지) */
  moreAssignmentsAsked: boolean;
  /** 초기화·모드전환 경합 방지용 세대 번호 */
  generation: number;
};

/* ------------------------------------------------------------------ */
/* AI 응답 (추출 전용)                                                  */
/* ------------------------------------------------------------------ */

export type AiCardItem = {
  field: FieldKey;
  text: string;
  evidence: Evidence[];
};

export type AiInterpretation = {
  text: string;
  sourceQuotes: string[];
};

/**
 * AI 는 "다음 질문"을 정하지 않는다.
 * 답변에서 사실을 뽑고, 직전 답변을 한 문장으로 반영하는 역할만 한다.
 * 질문 선택은 planner.ts 가 결정한다.
 */
export type AiExtraction = {
  /** 직전 답변에 대한 짧은 반영 한 문장 */
  reflection: string;
  items: AiCardItem[];
  interpretations: AiInterpretation[];
  /** 사용자가 답변을 거부/건너뛰었다고 판단되면 true */
  skipped: boolean;
  /** 이전에 말한 내용과 충돌하는 부분이 있으면 질문거리로 올린다 */
  conflicts: string[];
};

/**
 * 질문 플래너
 *
 * 이 파일이 "다음에 무엇을 물을지"를 결정한다. AI 는 질문을 고르지 않는다.
 * AI 역할은 (1) 직전 답변 반영 문장, (2) 답변에서 사실 추출 뿐이다.
 *
 * 원칙
 * - 한 번에 하나만 묻는다.
 * - 성과·수치를 먼저 묻지 않는다. 결과는 마지막에, 없어도 된다고 명시한다.
 * - 같은 슬롯은 최대 2번까지만 묻고 넘어간다. (사용자를 몰아붙이지 않는다)
 * - 건너뛴 슬롯은 사실로 기록하지 않는다.
 */

import {
  ALL_FIELDS,
  type Assignment,
  type Experience,
  type FieldKey,
  type Phase,
  type SessionState,
} from "./types";

export const MAX_ASK_PER_FIELD = 2;
export const MAX_QUESTIONS_PER_EXPERIENCE = 14;
/** 한 보직에서 다룰 경험 수 상한 */
export const MAX_EXPERIENCES = 4;

export type QuestionPlan = {
  phase: Phase;
  question: string;
  /** deep_dive 질문이 겨냥하는 슬롯 */
  field?: FieldKey;
  /** 버튼으로 보여줄 보기 */
  choices?: string[];
  /** 보기 외 자유 입력을 막을지 */
  choiceOnly?: boolean;
  /** 질문 아래 작은 안내문 */
  hint?: string;
  /** 사용자가 건너뛸 수 있는 질문인지 */
  skippable: boolean;
};

/* ------------------------------------------------------------------ */
/* 슬롯 순서와 질문 문안                                                */
/* ------------------------------------------------------------------ */

/** 캐묻는 순서. outcomes 를 마지막에 두어 성과 압박을 피한다. */
const FIELD_ORDER: FieldKey[] = [
  "duties",
  "scope",
  "actions",
  "judgment",
  "collaboration",
  "tools",
  "difficulty",
  "outcomes",
];

/** 1차 질문 / 2차(더 캐묻는) 질문 */
const FIELD_QUESTIONS: Record<FieldKey, { first: string; deeper: string; hint?: string }> = {
  duties: {
    first: "그 보직에서 평소에 맡아서 하신 일은 어떤 것이었나요? 잘 정리하지 않으셔도 괜찮습니다.",
    deeper: "방금 말씀하신 일 말고, 그 보직에서 정기적으로 반복해서 하신 일이 또 있을까요?",
    hint: "특별한 사건이 아니어도 됩니다. 매일·매주 하던 일이 곧 경력입니다.",
  },
  scope: {
    first: "그 일은 어디까지가 본인 담당이었나요? 누구를(무엇을) 대상으로 하셨는지 편하게 말씀해 주세요.",
    deeper: "그 일에서 본인이 직접 결정할 수 있었던 부분과, 위에 보고해야 했던 부분은 어떻게 나뉘었나요?",
    hint: "인원수나 수량은 기억나는 만큼만, 모르면 넘어가셔도 됩니다.",
  },
  actions: {
    first: "그 일을 하실 때 처음부터 끝까지 어떤 순서로 하셨나요?",
    deeper: "그 순서 중에서 본인이 직접 하신 부분은 어디였나요? 동료가 한 일과 나눠서 말씀해 주세요.",
    hint: "순서대로 말씀해 주시면 그대로 정리해 드립니다.",
  },
  judgment: {
    first: "그 일을 하다 보면 판단해야 하는 순간이 있었을 텐데, 어떤 기준으로 정하셨나요?",
    deeper: "기준이 애매한 경우에는 어떻게 하셨나요?",
    hint: "규정이나 지침을 따랐다면 그렇게 말씀하셔도 됩니다.",
  },
  collaboration: {
    first: "그 일은 주로 누구와 함께 하셨나요? 어떻게 주고받으셨는지도 알려주세요.",
    deeper: "의견이 다를 때는 어떻게 맞추셨나요?",
    hint: "부서나 직책으로 말씀해 주시면 됩니다. 실명은 적지 말아 주세요.",
  },
  tools: {
    first: "그 일을 할 때 사용하신 양식, 문서, 시스템 같은 게 있었나요?",
    deeper: "그 도구를 쓰면서 본인이 직접 만들거나 고친 부분이 있었나요?",
    hint: "이름을 정확히 몰라도, 어떤 용도였는지만 말씀해 주시면 됩니다.",
  },
  difficulty: {
    first: "그 일에서 번거롭거나 신경 쓰였던 부분이 있었나요?",
    deeper: "그럴 때 본인은 어떻게 대처하셨나요?",
    hint: "큰 사건이 아니어도 괜찮습니다.",
  },
  outcomes: {
    first: "그 일의 결과로 확인된 게 있으신가요? 확인된 게 없으면 '없다'고 하셔도 됩니다.",
    deeper: "숫자나 기록으로 남은 건 없더라도, 주변에서 들은 반응 같은 게 있었을까요?",
    hint: "확인되지 않은 내용은 '미확인'으로 표시하고 지어내지 않습니다.",
  },
};

/* ------------------------------------------------------------------ */
/* 깊이 판정                                                            */
/* ------------------------------------------------------------------ */

/** 절차가 드러나는 표현 */
const SEQUENCE_MARKERS = [
  "먼저",
  "그다음",
  "그 다음",
  "이후",
  "다음에",
  "마지막",
  "확인",
  "보고",
  "접수",
  "작성",
  "점검",
  "전달",
  "정리",
  "요청",
  "안내",
  "검토",
  "등록",
  "제출",
];

/**
 * 슬롯이 충분히 채워졌는지 판단한다.
 * actions 는 절차가 드러나야 하므로 기준이 더 엄격하다.
 */
export function isFieldSatisfied(exp: Experience, field: FieldKey): boolean {
  const items = exp.items.filter((i) => i.field === field && i.status !== "unknown");
  if (items.length === 0) return false;
  if (items.length >= 2) return true;

  const only = items[0];
  if (!only) return false;

  if (field === "actions") {
    const hasSequence = SEQUENCE_MARKERS.some((m) => only.text.includes(m));
    return hasSequence && only.text.length >= 18;
  }
  if (field === "duties") {
    return only.text.length >= 12;
  }
  return true;
}

/** 이 슬롯을 더 물어도 되는지 */
function canAsk(exp: Experience, field: FieldKey): boolean {
  if (exp.skipped.some((s) => s.field === field)) return false;
  const asked = exp.asked[field] ?? 0;
  return asked < MAX_ASK_PER_FIELD;
}

/** 경험에서 다음에 물을 슬롯 */
export function nextField(exp: Experience): FieldKey | null {
  const totalAsked = ALL_FIELDS.reduce((sum, f) => sum + (exp.asked[f] ?? 0), 0);
  if (totalAsked >= MAX_QUESTIONS_PER_EXPERIENCE) return null;

  for (const field of FIELD_ORDER) {
    if (!canAsk(exp, field)) continue;
    if (isFieldSatisfied(exp, field)) continue;
    return field;
  }
  return null;
}

/** 경험 정리가 끝났는지 */
export function isExperienceComplete(exp: Experience): boolean {
  return exp.closed || nextField(exp) === null;
}

/* ------------------------------------------------------------------ */
/* 기본정보 질문                                                        */
/* ------------------------------------------------------------------ */

const BRANCH_CHOICES = ["육군", "해군", "공군", "해병대", "국방부·기타"];
const SERVICE_TYPE_CHOICES = ["장교", "준사관", "부사관", "군무원"];
const SEPARATION_CHOICES = [
  "의무복무 만료",
  "장기복무 미선발",
  "개인 사정",
  "전직 준비",
  "기타",
];
const MOVE_REASON_CHOICES = [
  "정기인사",
  "보직변경",
  "부대이동",
  "파견복귀",
  "진급",
  "전역",
  "기타",
];

function serviceQuestion(state: SessionState): QuestionPlan | null {
  const { service } = state;
  if (service.branch === "미입력") {
    return {
      phase: "service",
      question: "어느 군에서 복무하셨나요?",
      choices: BRANCH_CHOICES,
      skippable: false,
      hint: "경력기술서 맨 위 복무 요약에 들어갑니다.",
    };
  }
  if (service.serviceType === "미입력") {
    return {
      phase: "service",
      question: "복무하신 신분을 선택해 주세요.",
      choices: SERVICE_TYPE_CHOICES,
      skippable: false,
    };
  }
  if (!service.separationReason) {
    return {
      phase: "service",
      question: "전역(예정) 사유는 어떻게 되시나요?",
      choices: SEPARATION_CHOICES,
      skippable: true,
      hint: "고르기 어려우면 직접 적으셔도 되고, 건너뛰셔도 됩니다.",
    };
  }
  return null;
}

function assignmentQuestion(a: Assignment): QuestionPlan | null {
  if (!a.unitLabel) {
    return {
      phase: "assignment",
      question: "어느 부대에서 근무하셨나요?",
      skippable: true,
      hint: "문서에 실제 부대명을 넣을지는 나중에 고르실 수 있습니다. 공개가 어려우면 '수도권 소재 부대'처럼 적어 주세요. 위치나 부대 규모는 적지 말아 주세요.",
    };
  }
  if (!a.role) {
    return {
      phase: "assignment",
      question: "그곳에서 맡으신 보직명은 무엇이었나요?",
      skippable: false,
      hint: "예: 군사경찰 수사관, 인사담당관, 정비반장",
    };
  }
  if (!a.periodRaw) {
    return {
      phase: "assignment",
      question: "그 보직은 언제부터 언제까지 하셨나요?",
      skippable: true,
      hint: "예: 2021년 3월 ~ 2023년 2월 / 2021.03~2023.02. 정확하지 않으면 대략만 적으셔도 됩니다.",
    };
  }
  if (!a.moveReasonRaw) {
    return {
      phase: "assignment",
      question: "그 보직에서 다른 곳으로 옮기신 사유는 무엇이었나요?",
      choices: MOVE_REASON_CHOICES,
      skippable: true,
      hint: "마지막 보직이었다면 '전역'을 골라 주세요.",
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 메인 플래너                                                          */
/* ------------------------------------------------------------------ */

export function findAssignment(state: SessionState, id: string | null): Assignment | null {
  if (!id) return null;
  return state.assignments.find((a) => a.id === id) ?? null;
}

export function findExperience(state: SessionState, id: string | null): Experience | null {
  if (!id) return null;
  for (const a of state.assignments) {
    const exp = a.experiences.find((e) => e.id === id);
    if (exp) return exp;
  }
  return null;
}

/**
 * 현재 상태에서 다음 질문을 결정한다.
 * null 을 반환하면 더 물을 것이 없다는 뜻(= 문서 생성 단계).
 */
export function planNextQuestion(state: SessionState): QuestionPlan | null {
  // 1. 복무 기본정보
  const sq = serviceQuestion(state);
  if (sq) return sq;

  // 2. 현재 보직의 기본정보
  const active = findAssignment(state, state.activeAssignmentId);
  if (!active) {
    return {
      phase: "assignment",
      question: "첫 보직부터 정리해 볼게요. 어느 부대에서 근무하셨나요?",
      skippable: true,
      hint: "보직이 여러 개면 하나씩 차례대로 여쭤보겠습니다.",
    };
  }
  const aq = assignmentQuestion(active);
  if (aq) return aq;

  // 3. 이 보직에서 다룰 경험 고르기
  if (active.experiences.length === 0) {
    return {
      phase: "experience_pick",
      question: `${active.role} 보직에서 하신 일 중에 하나만 먼저 골라 볼게요. 어떤 일을 가장 자주 하셨나요?`,
      skippable: false,
      hint: "나중에 다른 일도 추가할 수 있습니다.",
    };
  }

  // 4. 진행 중인 경험 캐묻기
  const activeExp =
    findExperience(state, state.activeExperienceId) ??
    active.experiences.find((e) => !isExperienceComplete(e)) ??
    null;

  if (activeExp && !isExperienceComplete(activeExp)) {
    const field = nextField(activeExp);
    if (field) {
      const asked = activeExp.asked[field] ?? 0;
      const bank = FIELD_QUESTIONS[field];
      return {
        phase: "deep_dive",
        field,
        question: asked === 0 ? bank.first : bank.deeper,
        hint: bank.hint,
        skippable: true,
      };
    }
  }

  // 5. 같은 보직에 다른 경험이 있는지
  const allDone = active.experiences.every((e) => isExperienceComplete(e));
  if (allDone && !active.moreExperiencesAsked && active.experiences.length < MAX_EXPERIENCES) {
    {
      return {
        phase: "experience_pick",
        question: `${active.role} 보직에서 다른 일도 있었나요? 있으면 알려주시고, 없으면 '없음'을 골라 주세요.`,
        choices: ["없음"],
        skippable: true,
      };
    }
  }

  // 6. 다른 보직이 있는지
  if (!state.moreAssignmentsAsked) {
    return {
      phase: "assignment",
      question: "그 다음에 옮기신 보직이 있으신가요? 있으면 부대명을 알려주세요.",
      choices: ["더 없음"],
      skippable: true,
      hint: "보직을 여러 개 넣으면 경력기술서에 이력으로 함께 정리됩니다.",
    };
  }

  return null;
}

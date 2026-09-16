/**
 * 면담 진행자
 *
 * 사용자의 답변 하나를 받아 상태를 다음으로 옮긴다.
 * 여기서 "AI를 부를지 말지"를 결정한다.
 *
 * AI를 부르지 않는 경우
 *  - 군별·신분·전역사유 같은 선택형 답변
 *  - 부대명·보직명·기간·이동사유 같은 기본정보
 *  - 건너뛰기, 없음, 지어내 달라는 요청
 * → 요금을 아끼고, 결과를 예측 가능하게 만든다.
 *
 * AI를 부르는 경우
 *  - 심층 질문(deep_dive) 답변에서 사실을 뽑을 때뿐이다.
 */

import {
  FABRICATION_REPLY,
  isFabricationRequest,
  isNoMoreAnswer,
  isSkipAnswer,
  parseBranch,
  parseServiceType,
  toExperienceTitle,
} from "./answers";
import type { ExtractionContext } from "./extraction";
import { detectSensitive, sensitiveMessage } from "./pii";
import { findAssignment, findExperience, planNextQuestion, type QuestionPlan } from "./planner";
import { parsePeriod } from "./period";
import {
  addAssignment,
  addExperience,
  addMessage,
  applyExtraction,
  markAsked,
  markMoreAssignmentsAsked,
  markMoreExperiencesAsked,
  markSkipped,
  setMoveReason,
  setService,
  updateAssignment,
} from "./session";
import type { AiExtraction, SessionState } from "./types";

export type ExtractFn = (
  messages: SessionState["messages"],
  ctx: ExtractionContext,
) => Promise<
  { ok: true; extraction: AiExtraction } | { ok: false; error: { message: string; retryable: boolean } }
>;

export type TurnResult = {
  state: SessionState;
  /** 사용자에게 보여줄 안내 (오류·거절 등) */
  notice?: string;
  /** 재시도 가능한 오류였는지 */
  retryable?: boolean;
};

/** 화면에 표시할 현재 질문 */
export function currentQuestion(state: SessionState): QuestionPlan | null {
  return planNextQuestion(state);
}

/**
 * 답변 하나를 처리한다.
 * extract 는 심층 질문일 때만 호출된다.
 */
export async function submitAnswer(
  state: SessionState,
  rawText: string,
  extract: ExtractFn,
): Promise<TurnResult> {
  const text = rawText.trim();
  if (!text) return { state };

  const plan = planNextQuestion(state);
  if (!plan) return { state };

  // 1. 민감정보는 AI로 보내기 전에 막는다. 메시지에도 남기지 않는다.
  const hits = detectSensitive(text);
  if (hits.length > 0) {
    return { state, notice: sensitiveMessage(hits) };
  }

  // 2. 지어내 달라는 요청은 부드럽게 거절한다.
  if (isFabricationRequest(text)) {
    let next = addMessage(state, "user", text);
    next = addMessage(next, "assistant", FABRICATION_REPLY);
    return { state: next, notice: FABRICATION_REPLY };
  }

  let next = addMessage(state, "user", text);

  /* ---------------- 복무 기본정보 ---------------- */
  if (plan.phase === "service") {
    if (state.service.branch === "미입력") {
      const branch = parseBranch(text);
      next = setService(next, { branch: branch ?? "국방부·기타" });
    } else if (state.service.serviceType === "미입력") {
      const st = parseServiceType(text);
      next = setService(next, { serviceType: st ?? "부사관" });
    } else {
      next = setService(next, { separationReason: isSkipAnswer(text) ? "미기재" : text });
    }
    return { state: withNextQuestion(next) };
  }

  /* ---------------- 보직 기본정보 ---------------- */
  if (plan.phase === "assignment") {
    const active = findAssignment(next, next.activeAssignmentId);

    // "다음 보직이 있나요?" 에 더 없다고 답한 경우
    if (active && active.role && active.periodRaw && active.moveReasonRaw) {
      if (isNoMoreAnswer(text) || isSkipAnswer(text)) {
        return { state: withNextQuestion(markMoreAssignmentsAsked(next)) };
      }
      return { state: withNextQuestion(addAssignment(next, text)) };
    }

    if (!active) {
      if (isNoMoreAnswer(text) || isSkipAnswer(text)) {
        return { state: withNextQuestion(addAssignment(next, "○○부대")) };
      }
      return { state: withNextQuestion(addAssignment(next, text)) };
    }

    if (!active.unitLabel) {
      next = updateAssignment(next, active.id, {
        unitLabel: isSkipAnswer(text) ? "○○부대" : text,
      });
    } else if (!active.role) {
      next = updateAssignment(next, active.id, { role: text });
    } else if (!active.periodRaw) {
      const raw = isSkipAnswer(text) ? "미기재" : text;
      next = updateAssignment(next, active.id, { periodRaw: raw, period: parsePeriod(raw) });
    } else {
      next = setMoveReason(next, active.id, isSkipAnswer(text) ? "미확인" : text);
    }
    return { state: withNextQuestion(next) };
  }

  /* ---------------- 다룰 경험 고르기 ---------------- */
  if (plan.phase === "experience_pick") {
    const active = findAssignment(next, next.activeAssignmentId);
    if (!active) return { state: next };

    if (isNoMoreAnswer(text) || isSkipAnswer(text)) {
      return { state: withNextQuestion(markMoreExperiencesAsked(next, active.id)) };
    }
    next = addExperience(next, active.id, toExperienceTitle(text));
    return { state: withNextQuestion(next) };
  }

  /* ---------------- 심층 질문: 여기서만 AI를 부른다 ---------------- */
  const exp = findExperience(next, next.activeExperienceId);
  const field = plan.field;
  if (!exp || !field) return { state: next };

  // 질문했다는 사실부터 기록한다. (AI가 실패해도 같은 질문을 무한 반복하지 않도록)
  next = markAsked(next, exp.id, field);

  if (isSkipAnswer(text)) {
    next = markSkipped(next, exp.id, field, text);
    return { state: withNextQuestion(next) };
  }

  const assignment = findAssignment(next, next.activeAssignmentId);
  const result = await extract(next.messages, {
    field,
    experienceTitle: exp.title,
    role: assignment?.role ?? "",
  });

  if (!result.ok) {
    return { state: next, notice: result.error.message, retryable: result.error.retryable };
  }

  const extraction = result.extraction;
  if (extraction.skipped) {
    next = markSkipped(next, exp.id, field, text);
    return { state: withNextQuestion(next) };
  }

  next = applyExtraction(next, exp.id, extraction);
  if (extraction.reflection) {
    next = addMessage(next, "assistant", extraction.reflection);
  }

  return { state: withNextQuestion(next), notice: conflictNotice(extraction) };
}

function conflictNotice(extraction: AiExtraction): string | undefined {
  if (extraction.conflicts.length === 0) return undefined;
  return `앞서 말씀하신 내용과 다른 부분이 있습니다: ${extraction.conflicts.join(" / ")} 어느 쪽이 맞는지 알려주시면 그대로 고치겠습니다.`;
}

/** 다음 질문을 대화에 덧붙인다. */
function withNextQuestion(state: SessionState): SessionState {
  const plan = planNextQuestion(state);
  if (!plan) {
    return { ...state, phase: "document" };
  }
  const last = state.messages[state.messages.length - 1];
  if (last?.role === "assistant" && last.text === plan.question) return { ...state, phase: plan.phase };
  return { ...addMessage(state, "assistant", plan.question), phase: plan.phase };
}

/** 대화를 시작한다. 첫 질문을 넣어 준다. */
export function startInterview(state: SessionState): SessionState {
  const plan = planNextQuestion(state);
  if (!plan) return state;
  return { ...addMessage({ ...state, mode: "live" }, "assistant", plan.question), phase: plan.phase };
}

/**
 * 세션 상태 관리 (순수 함수)
 *
 * 검수에서 확인된 두 가지 문제를 여기서 막는다.
 *  A. 사실을 고치면 이전에 만든 문서는 무효가 되어야 한다.
 *     -> factsHash 로 사실 스냅샷을 비교한다. 체크박스만 풀리는 방식은 쓰지 않는다.
 *  B. 초기화·모드전환 후 이전 요청 결과가 되살아나면 안 된다.
 *     -> generation 을 올리고, 응답 반영 시 세대를 검사한다.
 */

import {
  type Assignment,
  type CardItem,
  type ChatMessage,
  type Evidence,
  type Experience,
  type FieldKey,
  type ItemStatus,
  type MoveReasonCode,
  type SessionState,
  type AiExtraction,
} from "./types.js";
import { generalizeUnitLabel } from "./pii.js";

/* ------------------------------------------------------------------ */
/* id / hash                                                           */
/* ------------------------------------------------------------------ */

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/** 테스트에서 id 를 예측 가능하게 만들기 위한 리셋 */
export function __resetIdCounter(): void {
  counter = 0;
}

function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * 문서에 실릴 "사실"만 모아 해시한다.
 * 확인된 항목의 내용, 기본정보, 보직 이력이 바뀌면 값이 달라진다.
 */
export function computeFactsHash(state: SessionState): string {
  const parts: string[] = [
    state.service.branch,
    state.service.serviceType,
    state.service.separationReason,
    state.service.displayName,
  ];

  for (const a of state.assignments) {
    parts.push(
      [
        a.id,
        a.unitDisplay === "as-given" ? a.unitLabel : a.unitGeneralized,
        a.role,
        a.periodRaw,
        a.moveReasonRaw,
      ].join("|"),
    );
    for (const e of a.experiences) {
      parts.push(`E:${e.id}:${e.title}`);
      for (const item of e.items) {
        // 확인 상태와 본문이 모두 해시에 들어간다.
        parts.push(`I:${item.id}:${item.field}:${item.status}:${item.text}`);
      }
    }
  }
  return hashString(parts.join("\n"));
}

/* ------------------------------------------------------------------ */
/* 초기 상태                                                            */
/* ------------------------------------------------------------------ */

export function emptySession(generation = 0): SessionState {
  return {
    mode: "idle",
    phase: "idle",
    messages: [],
    service: {
      branch: "미입력",
      serviceType: "미입력",
      separationReason: "",
      displayName: "",
    },
    assignments: [],
    activeAssignmentId: null,
    activeExperienceId: null,
    doc: { preview: "", confirmed: false, factsHash: "" },
    consentGiven: false,
    turns: 0,
    moreAssignmentsAsked: false,
    generation,
  };
}

/** 초기화. 세대를 올려 진행 중이던 응답이 되살아나지 못하게 한다. */
export function resetSession(state: SessionState): SessionState {
  return emptySession(state.generation + 1);
}

/* ------------------------------------------------------------------ */
/* 메시지                                                              */
/* ------------------------------------------------------------------ */

export function addMessage(
  state: SessionState,
  role: "user" | "assistant",
  text: string,
  sample = false,
): SessionState {
  const message: ChatMessage = { id: nextId(role === "user" ? "u" : "a"), role, text, sample };
  return {
    ...state,
    messages: [...state.messages, message],
    turns: role === "user" ? state.turns + 1 : state.turns,
  };
}

/* ------------------------------------------------------------------ */
/* 기본정보                                                             */
/* ------------------------------------------------------------------ */

export function setService(
  state: SessionState,
  patch: Partial<SessionState["service"]>,
): SessionState {
  return { ...state, service: { ...state.service, ...patch }, doc: staleDoc(state.doc) };
}

export function addAssignment(state: SessionState, unitLabel: string): SessionState {
  const assignment: Assignment = {
    id: nextId("asg"),
    unitLabel: unitLabel.trim(),
    unitDisplay: "generalized",
    unitGeneralized: generalizeUnitLabel(unitLabel),
    role: "",
    period: null,
    periodRaw: "",
    moveReason: "미확인",
    moveReasonRaw: "",
    experiences: [],
    moreExperiencesAsked: false,
  };
  return {
    ...state,
    assignments: [...state.assignments, assignment],
    activeAssignmentId: assignment.id,
    moreAssignmentsAsked: false,
    activeExperienceId: null,
    phase: "assignment",
    doc: staleDoc(state.doc),
  };
}

export function updateAssignment(
  state: SessionState,
  id: string,
  patch: Partial<Omit<Assignment, "id" | "experiences">>,
): SessionState {
  return {
    ...state,
    assignments: state.assignments.map((a) => {
      if (a.id !== id) return a;
      const next = { ...a, ...patch };
      if (patch.unitLabel !== undefined) {
        next.unitGeneralized = generalizeUnitLabel(patch.unitLabel);
      }
      return next;
    }),
    doc: staleDoc(state.doc),
  };
}

export function setMoveReason(
  state: SessionState,
  id: string,
  raw: string,
): SessionState {
  const known: MoveReasonCode[] = [
    "정기인사",
    "보직변경",
    "부대이동",
    "파견복귀",
    "진급",
    "전역",
  ];
  const matched = known.find((k) => raw.includes(k)) ?? "기타";
  return updateAssignment(state, id, { moveReason: matched, moveReasonRaw: raw.trim() });
}

/* ------------------------------------------------------------------ */
/* 경험                                                                 */
/* ------------------------------------------------------------------ */

export function addExperience(
  state: SessionState,
  assignmentId: string,
  title: string,
): SessionState {
  const exp: Experience = {
    id: nextId("exp"),
    assignmentId,
    title: title.trim(),
    items: [],
    interpretations: [],
    skipped: [],
    asked: {},
    closed: false,
  };
  return {
    ...state,
    assignments: state.assignments.map((a) =>
      a.id === assignmentId ? { ...a, experiences: [...a.experiences, exp] } : a,
    ),
    activeExperienceId: exp.id,
    phase: "deep_dive",
    doc: staleDoc(state.doc),
  };
}

function mapExperience(
  state: SessionState,
  experienceId: string,
  fn: (exp: Experience) => Experience,
): SessionState {
  return {
    ...state,
    assignments: state.assignments.map((a) => ({
      ...a,
      experiences: a.experiences.map((e) => (e.id === experienceId ? fn(e) : e)),
    })),
  };
}

/** 질문을 던졌다고 기록한다. */
export function markAsked(
  state: SessionState,
  experienceId: string,
  field: FieldKey,
): SessionState {
  return mapExperience(state, experienceId, (e) => ({
    ...e,
    asked: { ...e.asked, [field]: (e.asked[field] ?? 0) + 1 },
  }));
}

/** 사용자가 건너뛴 슬롯을 기록한다. 사실로는 저장하지 않는다. */
export function markSkipped(
  state: SessionState,
  experienceId: string,
  field: FieldKey,
  reason: string,
): SessionState {
  return mapExperience(state, experienceId, (e) =>
    e.skipped.some((s) => s.field === field)
      ? e
      : { ...e, skipped: [...e.skipped, { field, reason: reason.trim() }] },
  );
}

export function closeExperience(state: SessionState, experienceId: string): SessionState {
  return mapExperience(state, experienceId, (e) => ({ ...e, closed: true }));
}

/** "이 보직에 다른 일도 있었나요?" 를 물었다고 기록한다. */
export function markMoreExperiencesAsked(state: SessionState, assignmentId: string): SessionState {
  return {
    ...state,
    assignments: state.assignments.map((a) =>
      a.id === assignmentId ? { ...a, moreExperiencesAsked: true } : a,
    ),
  };
}

/** "다음 보직이 있나요?" 를 물었다고 기록한다. */
export function markMoreAssignmentsAsked(state: SessionState): SessionState {
  return { ...state, moreAssignmentsAsked: true };
}

/* ------------------------------------------------------------------ */
/* AI 추출 결과 반영                                                     */
/* ------------------------------------------------------------------ */

/**
 * 검증을 통과한 항목만 경험에 병합한다.
 * 사용자가 이미 확인/미확인으로 처리한 항목은 AI 가 덮어쓰지 못한다.
 */
export function applyExtraction(
  state: SessionState,
  experienceId: string,
  extraction: AiExtraction,
): SessionState {
  const next = mapExperience(state, experienceId, (exp) => {
    const resolved = new Set(
      exp.items.filter((i) => i.status !== "draft").map((i) => i.text.trim()),
    );
    const existing = new Set(exp.items.map((i) => i.text.trim()));

    const added: CardItem[] = extraction.items
      .filter((i) => !existing.has(i.text.trim()) && !resolved.has(i.text.trim()))
      .map((i) => ({
        id: nextId("item"),
        experienceId,
        field: i.field,
        text: i.text,
        evidence: i.evidence,
        status: "draft" as ItemStatus,
        userAuthored: false,
      }));

    // 해석은 "근거 인용"을 기준으로 항목과 연결한다.
    // 문장끼리 비교하면 AI 가 다듬은 문장과 원문 인용이 달라 연결이 끊긴다.
    const pool = [...exp.items, ...added];
    const interpretations = extraction.interpretations
      .map((i) => {
        const sourceItemIds = pool
          .filter((item) =>
            item.evidence.some((ev) =>
              i.sourceQuotes.some((q) => ev.quote.includes(q) || q.includes(ev.quote)),
            ),
          )
          .map((item) => item.id);
        return { id: nextId("interp"), experienceId, text: i.text, sourceItemIds };
      })
      .filter((i) => i.sourceItemIds.length > 0);

    return {
      ...exp,
      items: [...exp.items, ...added],
      interpretations: [...exp.interpretations, ...interpretations],
    };
  });

  return { ...next, doc: staleDoc(next.doc) };
}

/* ------------------------------------------------------------------ */
/* 항목 편집                                                            */
/* ------------------------------------------------------------------ */

function staleDoc(doc: SessionState["doc"]): SessionState["doc"] {
  // 내용은 남기되 확인 상태를 풀고, factsHash 를 비워 "다시 만들어야 함"을 표시한다.
  return { ...doc, confirmed: false, factsHash: "" };
}

export function editItem(state: SessionState, itemId: string, text: string): SessionState {
  const trimmed = text.trim();
  if (!trimmed) return state;

  const evidence: Evidence[] = [{ messageId: `edit:${itemId}`, quote: trimmed }];
  const next = {
    ...state,
    assignments: state.assignments.map((a) => ({
      ...a,
      experiences: a.experiences.map((e) => ({
        ...e,
        items: e.items.map((i) =>
          i.id === itemId ? { ...i, text: trimmed, evidence, userAuthored: true } : i,
        ),
      })),
    })),
  };
  return { ...next, doc: staleDoc(next.doc) };
}

export function setItemStatus(
  state: SessionState,
  itemId: string,
  status: ItemStatus,
): SessionState {
  const next = {
    ...state,
    assignments: state.assignments.map((a) => ({
      ...a,
      experiences: a.experiences.map((e) => ({
        ...e,
        items: e.items.map((i) => (i.id === itemId ? { ...i, status } : i)),
      })),
    })),
  };
  return { ...next, doc: staleDoc(next.doc) };
}

export function removeItem(state: SessionState, itemId: string): SessionState {
  const next = {
    ...state,
    assignments: state.assignments.map((a) => ({
      ...a,
      experiences: a.experiences.map((e) => ({
        ...e,
        items: e.items.filter((i) => i.id !== itemId),
        interpretations: e.interpretations.filter((p) => !p.sourceItemIds.includes(itemId)),
      })),
    })),
  };
  return { ...next, doc: staleDoc(next.doc) };
}

/* ------------------------------------------------------------------ */
/* 문서 상태                                                            */
/* ------------------------------------------------------------------ */

export function setDocPreview(state: SessionState, preview: string): SessionState {
  return {
    ...state,
    doc: { preview, confirmed: false, factsHash: computeFactsHash(state) },
  };
}

export function confirmDoc(state: SessionState, confirmed: boolean): SessionState {
  // 사실이 바뀐 뒤라면 확인 자체를 받지 않는다.
  if (confirmed && isDocStale(state)) return state;
  return { ...state, doc: { ...state.doc, confirmed } };
}

/** 문서가 현재 사실과 어긋나 있는지 */
export function isDocStale(state: SessionState): boolean {
  if (!state.doc.preview) return true;
  if (!state.doc.factsHash) return true;
  return state.doc.factsHash !== computeFactsHash(state);
}

/** 내려받기 가능 여부 */
export function canExport(state: SessionState): boolean {
  return Boolean(state.doc.preview) && state.doc.confirmed && !isDocStale(state);
}

/** 확인된 사실만 모은다. 문서 생성은 이 결과만 사용한다. */
export function confirmedItems(exp: Experience): CardItem[] {
  return exp.items.filter((i) => i.status === "confirmed");
}

export function unknownItems(exp: Experience): CardItem[] {
  return exp.items.filter((i) => i.status === "unknown");
}

/** 응답 반영 전 세대 검사 */
export function isSameGeneration(state: SessionState, generation: number): boolean {
  return state.generation === generation;
}

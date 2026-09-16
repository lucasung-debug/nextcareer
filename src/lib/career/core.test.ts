import { describe, expect, it, beforeEach } from "vitest";

import {
  groundExtraction,
  hasUnsupportedNumber,
  unsupportedClaimWords,
  validateCardItem,
  validateEvidence,
} from "./grounding.js";
import { detectSensitive, generalizeUnitLabel } from "./pii.js";
import {
  MAX_ASK_PER_FIELD,
  isFieldSatisfied,
  nextField,
  planNextQuestion,
} from "./planner.js";
import {
  __resetIdCounter,
  addAssignment,
  addExperience,
  addMessage,
  applyExtraction,
  canExport,
  computeFactsHash,
  confirmDoc,
  editItem,
  emptySession,
  isDocStale,
  isSameGeneration,
  markAsked,
  markMoreAssignmentsAsked,
  markMoreExperiencesAsked,
  markSkipped,
  removeItem,
  resetSession,
  setDocPreview,
  setItemStatus,
  setMoveReason,
  setService,
  updateAssignment,
} from "./session.js";
import { formatDuration, formatPeriod, parsePeriod, totalServicePeriod } from "./period.js";
import { buildCareerDocument, renderPreview } from "./careerDocument.js";
import { buildDocxBuffer, docxFileName } from "./docxBuilder.js";
import type { ChatMessage, SessionState } from "./types.js";

beforeEach(() => __resetIdCounter());

/* ------------------------------------------------------------------ */
/* 근거 검증                                                            */
/* ------------------------------------------------------------------ */

const messages: ChatMessage[] = [
  { id: "u1", role: "user", text: "근무표를 확인하고 변경 요청이 있으면 담당자와 일정을 조정했어요." },
  { id: "a1", role: "assistant", text: "어떤 순서로 처리하셨나요?" },
  { id: "u2", role: "user", text: "요청 내용을 확인하고 담당자와 가능한 시간을 맞춘 뒤 변경 내용을 안내했어요." },
];

describe("근거 검증", () => {
  it("사용자 메시지에 없는 인용은 버린다", () => {
    const kept = validateEvidence(
      [
        { messageId: "u1", quote: "근무표를 확인하고" },
        { messageId: "u1", quote: "부대 전체를 통솔했고" },
        { messageId: "u9", quote: "근무표를 확인하고" },
      ],
      messages,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.quote).toBe("근무표를 확인하고");
  });

  it("도우미 메시지는 근거가 될 수 없다", () => {
    const kept = validateEvidence([{ messageId: "a1", quote: "어떤 순서로 처리하셨나요?" }], messages);
    expect(kept).toHaveLength(0);
  });

  it("숫자는 토큰이 정확히 같아야 한다 (1.5배가 5배를 통과시키면 안 됨)", () => {
    const evidence = [{ messageId: "u1", quote: "처리 속도가 1.5배 빨라졌어요" }];
    expect(hasUnsupportedNumber("처리 속도를 5배 높였습니다", evidence)).toBe(true);
    expect(hasUnsupportedNumber("처리 속도가 1.5배 빨라졌습니다", evidence)).toBe(false);
  });

  it("15명 근거로 5명을 주장할 수 없다", () => {
    const evidence = [{ messageId: "u1", quote: "15명 정도를 맡았어요" }];
    expect(hasUnsupportedNumber("5명을 관리했습니다", evidence)).toBe(true);
  });

  it("사용자가 말하지 않은 성과 표현은 걸러낸다", () => {
    const evidence = [{ messageId: "u1", quote: "근무표를 확인하고" }];
    expect(unsupportedClaimWords("업무를 무사고로 총괄했습니다", evidence)).toEqual(
      expect.arrayContaining(["무사고", "총괄"]),
    );
    expect(unsupportedClaimWords("근무표를 확인했습니다", evidence)).toEqual([]);
  });

  it("민간 직급 환산 표현을 막는다", () => {
    const evidence = [{ messageId: "u1", quote: "근무표를 확인하고" }];
    expect(unsupportedClaimWords("대기업 과장급에 상응하는 역할", evidence).length).toBeGreaterThan(0);
  });

  it("검증을 통과하지 못한 항목은 버려진다", () => {
    expect(
      validateCardItem(
        { field: "duties", text: "근무표를 확인했습니다.", evidence: [{ messageId: "u1", quote: "근무표를 확인하고" }] },
        messages,
      ),
    ).not.toBeNull();

    expect(
      validateCardItem(
        { field: "duties", text: "300명 규모 부대를 지휘했습니다.", evidence: [{ messageId: "u1", quote: "근무표를 확인하고" }] },
        messages,
      ),
    ).toBeNull();
  });

  it("추출 결과 전체를 검증한다", () => {
    const grounded = groundExtraction(
      {
        reflection: "근무표 업무를 맡으셨군요.",
        items: [
          { field: "duties", text: "근무표를 확인했습니다.", evidence: [{ messageId: "u1", quote: "근무표를 확인하고" }] },
          { field: "outcomes", text: "사고율을 30% 줄였습니다.", evidence: [{ messageId: "u1", quote: "근무표를 확인하고" }] },
        ],
        interpretations: [
          { text: "일정 조율 경험", sourceQuotes: ["담당자와 일정을 조정했어요"] },
          { text: "지어낸 해석", sourceQuotes: ["존재하지 않는 문장"] },
        ],
        skipped: false,
        conflicts: [],
      },
      messages,
    );
    expect(grounded.items).toHaveLength(1);
    expect(grounded.interpretations).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* 민감정보 / 부대명                                                     */
/* ------------------------------------------------------------------ */

describe("민감정보", () => {
  it("부대명 자체는 차단하지 않는다", () => {
    expect(detectSensitive("제1사단 군사경찰대에서 근무했습니다")).toEqual([]);
  });

  it("주민번호·전화번호·좌표는 차단한다", () => {
    expect(detectSensitive("900101-1234567").length).toBe(1);
    expect(detectSensitive("010-1234-5678").length).toBe(1);
    expect(detectSensitive("37.5665, 126.9780").length).toBe(1);
  });

  it("총기·탄약 수량은 차단한다", () => {
    expect(detectSensitive("소총 50정을 관리했습니다")[0]?.kind).toBe("weapon_count");
    expect(detectSensitive("총기 관리 업무를 했습니다")).toEqual([]);
  });

  it("보안 절차는 차단한다", () => {
    expect(detectSensitive("암구호를 매일 갱신했습니다")[0]?.kind).toBe("security_procedure");
  });

  it("부대명을 일반 표기로 바꾼다", () => {
    expect(generalizeUnitLabel("제1사단 군사경찰대")).toBe("○○사단 군사경찰대");
    expect(generalizeUnitLabel("수도권 소재 부대")).toBe("수도권 소재 부대");
    expect(generalizeUnitLabel("1234 알수없음")).toBe("○○부대");
  });
});

/* ------------------------------------------------------------------ */
/* 기간 파서                                                            */
/* ------------------------------------------------------------------ */

describe("기간 파서", () => {
  it("여러 형식을 읽는다", () => {
    expect(parsePeriod("2021년 3월 ~ 2023년 2월")).toEqual({
      start: { year: 2021, month: 3 },
      end: { year: 2023, month: 2 },
    });
    expect(parsePeriod("2021.03~2023.02")?.end).toEqual({ year: 2023, month: 2 });
    expect(parsePeriod("2021.03 ~ 현재")?.end).toBeNull();
  });

  it("읽지 못하면 null 을 주고 원문을 쓴다", () => {
    expect(parsePeriod("잘 기억이 안 남")).toBeNull();
    expect(formatPeriod(null, "잘 기억이 안 남")).toBe("잘 기억이 안 남");
  });

  it("전체 복무기간을 합산한다", () => {
    const total = totalServicePeriod([
      parsePeriod("2019.03~2021.02"),
      parsePeriod("2021.03~2023.02"),
    ]);
    expect(total).toContain("2019.03 ~ 2023.02");
    expect(total).toContain("4년");
  });

  it("개월을 사람이 읽는 표기로 바꾼다", () => {
    expect(formatDuration(25)).toBe("2년 1개월");
    expect(formatDuration(12)).toBe("1년");
    expect(formatDuration(7)).toBe("7개월");
  });
});

/* ------------------------------------------------------------------ */
/* 질문 플래너                                                          */
/* ------------------------------------------------------------------ */

function baseState(): SessionState {
  let s = emptySession();
  s = setService(s, { branch: "육군", serviceType: "장교", separationReason: "의무복무 만료" });
  s = addAssignment(s, "제1사단 군사경찰대");
  const asgId = s.assignments[0]!.id;
  s = updateAssignment(s, asgId, { role: "군사경찰 수사관", periodRaw: "2021.03~2023.02" });
  s = setMoveReason(s, asgId, "전역");
  return s;
}

describe("질문 플래너", () => {
  it("기본정보를 먼저 묻는다", () => {
    const s = emptySession();
    expect(planNextQuestion(s)?.phase).toBe("service");
    expect(planNextQuestion(s)?.question).toContain("어느 군");
  });

  it("군별 다음에 신분, 그다음 전역 사유를 묻는다", () => {
    let s = setService(emptySession(), { branch: "육군" });
    expect(planNextQuestion(s)?.question).toContain("신분");
    s = setService(s, { serviceType: "장교" });
    expect(planNextQuestion(s)?.question).toContain("전역");
  });

  it("보직 기본정보를 부대-보직-기간-이동사유 순으로 묻는다", () => {
    let s = setService(emptySession(), {
      branch: "육군",
      serviceType: "장교",
      separationReason: "의무복무 만료",
    });
    expect(planNextQuestion(s)?.question).toContain("부대");

    s = addAssignment(s, "제1사단 군사경찰대");
    const id = s.assignments[0]!.id;
    expect(planNextQuestion(s)?.question).toContain("보직명");

    s = updateAssignment(s, id, { role: "군사경찰 수사관" });
    expect(planNextQuestion(s)?.question).toContain("언제부터");

    s = updateAssignment(s, id, { periodRaw: "2021.03~2023.02" });
    expect(planNextQuestion(s)?.question).toContain("사유");
  });

  it("기본정보가 끝나면 경험을 고르게 한다", () => {
    const s = baseState();
    const plan = planNextQuestion(s);
    expect(plan?.phase).toBe("experience_pick");
    expect(plan?.question).toContain("군사경찰 수사관");
  });

  it("경험이 생기면 수행 업무부터 캐묻는다", () => {
    const start = baseState();
    const s = addExperience(start, start.assignments[0]!.id, "근무표 운영");
    const plan = planNextQuestion(s);
    expect(plan?.phase).toBe("deep_dive");
    expect(plan?.field).toBe("duties");
  });

  it("같은 슬롯은 정해진 횟수까지만 묻는다", () => {
    let s = baseState();
    s = addExperience(s, s.assignments[0]!.id, "근무표 운영");
    const expId = s.activeExperienceId!;
    for (let i = 0; i < MAX_ASK_PER_FIELD; i += 1) {
      s = markAsked(s, expId, "duties");
    }
    expect(planNextQuestion(s)?.field).not.toBe("duties");
  });

  it("건너뛴 슬롯은 다시 묻지 않는다", () => {
    let s = baseState();
    s = addExperience(s, s.assignments[0]!.id, "근무표 운영");
    const expId = s.activeExperienceId!;
    s = markSkipped(s, expId, "duties", "기억이 안 나요");
    expect(planNextQuestion(s)?.field).toBe("scope");
  });

  it("행동은 절차가 드러나야 채워진 것으로 본다", () => {
    let s = baseState();
    s = addExperience(s, s.assignments[0]!.id, "근무표 운영");
    const expId = s.activeExperienceId!;
    s = applyExtraction(s, expId, {
      reflection: "",
      items: [{ field: "actions", text: "일을 했습니다.", evidence: [{ messageId: "edit:x", quote: "일을 했습니다." }] }],
      interpretations: [],
      skipped: false,
      conflicts: [],
    });
    const exp = s.assignments[0]!.experiences[0]!;
    expect(isFieldSatisfied(exp, "actions")).toBe(false);

    const s2 = applyExtraction(s, expId, {
      reflection: "",
      items: [
        {
          field: "actions",
          text: "요청을 접수하고 담당자와 시간을 맞춘 뒤 변경 내용을 안내했습니다.",
          evidence: [{ messageId: "edit:y", quote: "요청을 접수하고" }],
        },
      ],
      interpretations: [],
      skipped: false,
      conflicts: [],
    });
    expect(isFieldSatisfied(s2.assignments[0]!.experiences[0]!, "actions")).toBe(true);
  });

  it("결과는 마지막에 묻고 없어도 된다고 안내한다", () => {
    let s = baseState();
    s = addExperience(s, s.assignments[0]!.id, "근무표 운영");
    const expId = s.activeExperienceId!;
    for (const f of ["duties", "scope", "actions", "judgment", "collaboration", "tools", "difficulty"] as const) {
      s = markSkipped(s, expId, f, "넘어갈게요");
    }
    const plan = planNextQuestion(s);
    expect(plan?.field).toBe("outcomes");
    expect(plan?.question).toContain("없으면");
  });

  it("보직 정리가 끝나면 다음 보직을 묻는다", () => {
    let s = baseState();
    s = setMoveReason(s, s.assignments[0]!.id, "정기인사");
    s = addExperience(s, s.assignments[0]!.id, "근무표 운영");
    const expId = s.activeExperienceId!;
    for (const f of [
      "duties", "scope", "actions", "judgment", "collaboration", "tools", "difficulty", "outcomes",
    ] as const) {
      s = markSkipped(s, expId, f, "넘어갈게요");
    }
    expect(nextField(s.assignments[0]!.experiences[0]!)).toBeNull();

    // 먼저 같은 보직의 다른 업무를 묻는다
    expect(planNextQuestion(s)?.question).toContain("다른 일도");

    // 그 질문을 한 번 했으면 다음 보직으로 넘어간다
    s = markMoreExperiencesAsked(s, s.assignments[0]!.id);
    expect(planNextQuestion(s)?.question).toContain("보직이 있으신가요");

    // 더 없다고 하면 질문이 끝난다 (문서 단계)
    s = markMoreAssignmentsAsked(s);
    expect(planNextQuestion(s)).toBeNull();
  });

  it("보직을 추가하면 그 보직의 기본정보를 다시 묻는다", () => {
    let s = baseState();
    s = markMoreAssignmentsAsked(s);
    s = addAssignment(s, "제2군수지원사령부");
    const plan = planNextQuestion(s);
    expect(plan?.phase).toBe("assignment");
    expect(plan?.question).toContain("보직명");
  });
});

/* ------------------------------------------------------------------ */
/* 세션 / 무효화                                                        */
/* ------------------------------------------------------------------ */

function stateWithConfirmedItem(): { state: SessionState; itemId: string } {
  let s = baseState();
  s = addExperience(s, s.assignments[0]!.id, "근무표 운영");
  const expId = s.activeExperienceId!;
  s = addMessage(s, "user", "근무표를 확인하고 변경 요청이 있으면 담당자와 일정을 조정했어요.");
  const userMsgId = s.messages[0]!.id;
  s = applyExtraction(s, expId, {
    reflection: "",
    items: [
      {
        field: "duties",
        text: "근무표를 확인하고 일정 변경 요청을 처리했습니다.",
        evidence: [{ messageId: userMsgId, quote: "근무표를 확인하고" }],
      },
    ],
    interpretations: [],
    skipped: false,
    conflicts: [],
  });
  const itemId = s.assignments[0]!.experiences[0]!.items[0]!.id;
  s = setItemStatus(s, itemId, "confirmed");
  return { state: s, itemId };
}

describe("세션 무효화", () => {
  it("문서를 만들면 현재 사실 해시가 기록된다", () => {
    const { state } = stateWithConfirmedItem();
    const s = setDocPreview(state, "미리보기");
    expect(s.doc.factsHash).toBe(computeFactsHash(s));
    expect(isDocStale(s)).toBe(false);
  });

  it("항목을 수정하면 기존 문서는 무효가 된다", () => {
    const { state, itemId } = stateWithConfirmedItem();
    let s = setDocPreview(state, "미리보기");
    s = confirmDoc(s, true);
    expect(canExport(s)).toBe(true);

    s = editItem(s, itemId, "요청 내용을 확인해 담당자에게 전달했습니다.");
    expect(isDocStale(s)).toBe(true);
    expect(canExport(s)).toBe(false);
  });

  it("사실이 바뀐 뒤에는 다시 체크해도 내려받을 수 없다", () => {
    const { state, itemId } = stateWithConfirmedItem();
    let s = confirmDoc(setDocPreview(state, "미리보기"), true);
    s = editItem(s, itemId, "다른 내용으로 고쳤습니다.");
    s = confirmDoc(s, true); // 사용자가 다시 체크 시도
    expect(s.doc.confirmed).toBe(false);
    expect(canExport(s)).toBe(false);
  });

  it("확인 상태를 바꾸거나 항목을 지워도 무효가 된다", () => {
    const { state, itemId } = stateWithConfirmedItem();
    const s1 = confirmDoc(setDocPreview(state, "미리보기"), true);
    expect(canExport(setItemStatus(s1, itemId, "unknown"))).toBe(false);
    expect(canExport(removeItem(s1, itemId))).toBe(false);
  });

  it("문서를 다시 만들면 내려받을 수 있다", () => {
    const { state, itemId } = stateWithConfirmedItem();
    let s = confirmDoc(setDocPreview(state, "미리보기"), true);
    s = editItem(s, itemId, "요청 내용을 확인해 담당자에게 전달했습니다.");
    s = setDocPreview(s, "새 미리보기");
    s = confirmDoc(s, true);
    expect(canExport(s)).toBe(true);
  });

  it("초기화하면 세대가 올라가 이전 응답이 되살아나지 못한다", () => {
    const { state } = stateWithConfirmedItem();
    const fresh = resetSession(state);
    expect(fresh.assignments).toHaveLength(0);
    expect(fresh.messages).toHaveLength(0);
    expect(isSameGeneration(fresh, state.generation)).toBe(false);
    expect(isSameGeneration(fresh, fresh.generation)).toBe(true);
  });

  it("사용자가 확정한 항목은 AI 가 덮어쓰지 못한다", () => {
    const { state, itemId } = stateWithConfirmedItem();
    const expId = state.activeExperienceId!;
    const original = state.assignments[0]!.experiences[0]!.items[0]!.text;
    const after = applyExtraction(state, expId, {
      reflection: "",
      items: [{ field: "duties", text: original, evidence: [{ messageId: "edit:z", quote: original }] }],
      interpretations: [],
      skipped: false,
      conflicts: [],
    });
    const items = after.assignments[0]!.experiences[0]!.items;
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(itemId);
  });
});

/* ------------------------------------------------------------------ */
/* 경력기술서                                                           */
/* ------------------------------------------------------------------ */

describe("경력기술서", () => {
  it("확인된 항목만 사실로 싣는다", () => {
    let { state } = stateWithConfirmedItem();
    const expId = state.activeExperienceId!;
    state = applyExtraction(state, expId, {
      reflection: "",
      items: [
        {
          field: "outcomes",
          text: "수치로 남긴 기록은 없습니다.",
          evidence: [{ messageId: "edit:o", quote: "수치로 남긴 기록은 없습니다." }],
        },
      ],
      interpretations: [],
      skipped: false,
      conflicts: [],
    });
    const outcomeId = state.assignments[0]!.experiences[0]!.items[1]!.id;
    state = setItemStatus(state, outcomeId, "unknown");

    const doc = buildCareerDocument(state);
    expect(doc.sections[0]?.duties).toContain("근무표를 확인하고 일정 변경 요청을 처리했습니다.");
    expect(doc.sections[0]?.results).toHaveLength(0);
    expect(doc.sections[0]?.unconfirmed[0]).toContain("수치로 남긴 기록은 없습니다.");
  });

  it("보직 이력에 부대·기간·이동 사유가 들어간다", () => {
    const { state } = stateWithConfirmedItem();
    const doc = buildCareerDocument(state);
    expect(doc.history[0]).toMatchObject({
      period: "2021.03 ~ 2023.02",
      unit: "○○사단 군사경찰대",
      role: "군사경찰 수사관",
      moveReason: "전역",
    });
  });

  it("부대명을 그대로 쓰기로 선택하면 원문이 들어간다", () => {
    const { state } = stateWithConfirmedItem();
    const s = updateAssignment(state, state.assignments[0]!.id, { unitDisplay: "as-given" });
    expect(buildCareerDocument(s).history[0]?.unit).toBe("제1사단 군사경찰대");
  });

  it("보직이 여러 개면 모두 이력에 들어간다", () => {
    let { state } = stateWithConfirmedItem();
    state = setMoveReason(state, state.assignments[0]!.id, "정기인사");
    state = addAssignment(state, "제2군수지원사령부");
    const second = state.assignments[1]!.id;
    state = updateAssignment(state, second, { role: "인사담당관", periodRaw: "2023.03~2025.02" });
    state = setMoveReason(state, second, "전역");

    const doc = buildCareerDocument(state);
    expect(doc.history).toHaveLength(2);
    expect(doc.history[1]?.role).toBe("인사담당관");
    expect(doc.summary.totalPeriod).toContain("2021.03 ~ 2025.02");
  });

  it("미리보기에 확인 안내가 들어간다", () => {
    const { state } = stateWithConfirmedItem();
    const text = renderPreview(buildCareerDocument(state));
    expect(text).toContain("경력기술서");
    expect(text).toContain("경력 인증 문서가 아닙니다");
    expect(text).toContain("보직 이력");
  });
});

/* ------------------------------------------------------------------ */
/* Word 출력                                                            */
/* ------------------------------------------------------------------ */

describe("Word 출력", () => {
  it("열 수 있는 docx 파일을 만든다", async () => {
    const { state } = stateWithConfirmedItem();
    const buffer = await buildDocxBuffer(buildCareerDocument(state));
    expect(buffer.length).toBeGreaterThan(2000);
    // ZIP 시그니처 (PK)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    const asText = buffer.toString("latin1");
    expect(asText).toContain("word/document.xml");
    expect(asText).toContain("[Content_Types].xml");
  });

  it("파일명에 이름과 날짜가 들어간다", () => {
    const d = new Date(2026, 8, 16);
    expect(docxFileName("성명재", d)).toBe("경력기술서_성명재_20260916.docx");
    expect(docxFileName("", d)).toBe("경력기술서_20260916.docx");
  });
});

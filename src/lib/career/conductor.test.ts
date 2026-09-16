import { beforeEach, describe, expect, it, vi } from "vitest";

import { currentQuestion, startInterview, submitAnswer, type ExtractFn } from "./conductor.js";
import { __resetIdCounter, emptySession } from "./session.js";
import { buildCareerDocument } from "./careerDocument.js";
import type { AiExtraction, SessionState } from "./types.js";

beforeEach(() => __resetIdCounter());

/** 실제 AI 대신, 마지막 사용자 답변을 그대로 근거로 삼는 가짜 추출기 */
function fakeExtractor(field: string): ExtractFn {
  return async (messages) => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")!;
    const extraction: AiExtraction = {
      reflection: "말씀하신 내용을 정리했습니다.",
      items: [
        {
          field: field as AiExtraction["items"][number]["field"],
          text: `${lastUser.text} (정리됨)`,
          evidence: [{ messageId: lastUser.id, quote: lastUser.text.slice(0, 12) }],
        },
      ],
      interpretations: [],
      skipped: false,
      conflicts: [],
    };
    return { ok: true, extraction };
  };
}

const failingExtractor: ExtractFn = async () => ({
  ok: false,
  error: { message: "지금 요청이 몰려 있습니다.", retryable: true },
});

async function answer(state: SessionState, text: string, extract?: ExtractFn) {
  const plan = currentQuestion(state);
  const fn = extract ?? fakeExtractor(plan?.field ?? "duties");
  return submitAnswer(state, text, fn);
}

describe("면담 진행", () => {
  it("기본정보를 차례로 묻고 저장한다", async () => {
    let s = startInterview(emptySession());
    expect(currentQuestion(s)?.question).toContain("어느 군");

    s = (await answer(s, "육군")).state;
    expect(s.service.branch).toBe("육군");
    expect(currentQuestion(s)?.question).toContain("신분");

    s = (await answer(s, "대위로 전역했습니다")).state;
    expect(s.service.serviceType).toBe("장교");

    s = (await answer(s, "의무복무 만료")).state;
    expect(s.service.separationReason).toBe("의무복무 만료");
    expect(currentQuestion(s)?.question).toContain("부대");
  });

  it("보직 기본정보 네 가지를 모두 받는다", async () => {
    let s = startInterview(emptySession());
    for (const t of ["육군", "장교", "의무복무 만료"]) s = (await answer(s, t)).state;

    s = (await answer(s, "제1사단 군사경찰대")).state;
    expect(s.assignments[0]?.unitLabel).toBe("제1사단 군사경찰대");
    expect(s.assignments[0]?.unitGeneralized).toBe("○○사단 군사경찰대");

    s = (await answer(s, "군사경찰 수사관")).state;
    expect(s.assignments[0]?.role).toBe("군사경찰 수사관");

    s = (await answer(s, "2021.03~2023.02")).state;
    expect(s.assignments[0]?.period?.end).toEqual({ year: 2023, month: 2 });

    s = (await answer(s, "정기인사")).state;
    expect(s.assignments[0]?.moveReason).toBe("정기인사");
    expect(currentQuestion(s)?.phase).toBe("experience_pick");
  });

  it("기본정보 단계에서는 AI를 부르지 않는다", async () => {
    const spy = vi.fn(fakeExtractor("duties"));
    let s = startInterview(emptySession());
    for (const t of ["육군", "장교", "의무복무 만료", "제1사단", "수사관", "2021.03~2023.02", "전역"]) {
      s = (await submitAnswer(s, t, spy)).state;
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("심층 질문에서만 AI를 부르고 카드가 쌓인다", async () => {
    let s = await seedToDeepDive();
    const spy = vi.fn(fakeExtractor("duties"));
    s = (await submitAnswer(s, "근무표를 확인하고 일정을 조정했습니다.", spy)).state;

    expect(spy).toHaveBeenCalledTimes(1);
    const exp = s.assignments[0]!.experiences[0]!;
    expect(exp.items).toHaveLength(1);
    expect(exp.items[0]!.status).toBe("draft");
    expect(exp.asked["duties"]).toBe(1);
  });

  it("건너뛰면 AI를 부르지 않고 다음 항목으로 넘어간다", async () => {
    let s = await seedToDeepDive();
    const spy = vi.fn(fakeExtractor("duties"));
    const before = currentQuestion(s)?.field;
    s = (await submitAnswer(s, "기억이 잘 안 나요", spy)).state;

    expect(spy).not.toHaveBeenCalled();
    expect(s.assignments[0]!.experiences[0]!.skipped[0]?.field).toBe(before);
    expect(currentQuestion(s)?.field).not.toBe(before);
  });

  it("AI 실패해도 같은 질문에 갚히지 않는다", async () => {
    const s = await seedToDeepDive();
    const r1 = await submitAnswer(s, "근무표를 봤습니다.", failingExtractor);

    expect(r1.notice).toContain("요청이 몰려");
    expect(r1.retryable).toBe(true);
    // 질문했다는 사실은 AI 실패와 무관하게 기록된다
    expect(r1.state.assignments[0]!.experiences[0]!.asked["duties"]).toBe(1);
    // 실패했다고 같은 항목을 다시 물고 늘어지지 않고 다음으로 넘어간다
    expect(currentQuestion(r1.state)?.field).not.toBe("duties");

    // 사실은 하나도 저장되지 않는다
    expect(r1.state.assignments[0]!.experiences[0]!.items).toHaveLength(0);
  });

  it("결과 항목은 예산에 밀리지 않고 반드시 한 번 물어본다", async () => {
    let s = await seedToDeepDive();
    const asked: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const q = currentQuestion(s);
      if (!q || q.phase !== "deep_dive") break;
      if (q.field) asked.push(q.field);
      s = (await answer(s, "그 일을 했습니다")).state;
    }
    expect(asked).toContain("outcomes");
  });

  it("지어내 달라는 요청은 거절하고 사실로 저장하지 않는다", async () => {
    let s = await seedToDeepDive();
    const spy = vi.fn(fakeExtractor("duties"));
    const r = await submitAnswer(s, "성과를 좀 그럴듯하게 지어내 주세요", spy);

    expect(spy).not.toHaveBeenCalled();
    expect(r.notice).toContain("만들어 드리지는 못합니다");
    expect(r.state.assignments[0]!.experiences[0]!.items).toHaveLength(0);
  });

  it("민감정보는 대화에 남기지도 않는다", async () => {
    let s = await seedToDeepDive();
    const spy = vi.fn(fakeExtractor("duties"));
    const before = s.messages.length;
    const r = await submitAnswer(s, "제 연락처는 010-1234-5678 입니다", spy);

    expect(spy).not.toHaveBeenCalled();
    expect(r.notice).toContain("전화번호");
    expect(r.state.messages).toHaveLength(before);
  });

  it("보직을 여러 개 이어서 받을 수 있다", async () => {
    let s = await seedToDeepDive();
    // 모든 심층 항목 건너뛰기
    for (let i = 0; i < 10; i += 1) {
      const q = currentQuestion(s);
      if (!q || q.phase !== "deep_dive") break;
      s = (await answer(s, "넘어갈게요")).state;
    }
    // 같은 보직 다른 업무 → 없음
    expect(currentQuestion(s)?.question).toContain("다른 일도");
    s = (await answer(s, "없음")).state;

    // 다음 보직
    expect(currentQuestion(s)?.question).toContain("보직이 있으신가요");
    s = (await answer(s, "제2군수지원사령부")).state;
    expect(s.assignments).toHaveLength(2);

    s = (await answer(s, "인사담당관")).state;
    s = (await answer(s, "2023.03~2025.02")).state;
    s = (await answer(s, "전역")).state;

    const doc = buildCareerDocument(s);
    expect(doc.history).toHaveLength(2);
    expect(doc.history[1]?.role).toBe("인사담당관");
    expect(doc.summary.totalPeriod).toContain("2021.03 ~ 2025.02");
  });

  it("모든 질문이 끝나면 문서 단계로 간다", async () => {
    let s = await seedToDeepDive();
    for (let i = 0; i < 24; i += 1) {
      const q = currentQuestion(s);
      if (!q) break;
      s = (await answer(s, q.choices?.includes("없음") ? "없음" : q.choices?.includes("더 없음") ? "더 없음" : "넘어갈게요")).state;
    }
    expect(currentQuestion(s)).toBeNull();
    expect(s.phase).toBe("document");
  });
});

async function seedToDeepDive(): Promise<SessionState> {
  let s = startInterview(emptySession());
  for (const t of [
    "육군",
    "장교",
    "의무복무 만료",
    "제1사단 군사경찰대",
    "군사경찰 수사관",
    "2021.03~2023.02",
    "정기인사",
    "근무표 확인하고 일정 조정하는 일을 했어요",
  ]) {
    s = (await answer(s, t)).state;
  }
  return s;
}

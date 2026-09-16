import { beforeEach, describe, expect, it } from "vitest";

import { currentQuestion, startInterview, submitAnswer, type ExtractFn } from "./conductor.js";
import { __resetIdCounter, emptySession } from "./session.js";
import type { AiExtraction, FieldKey, SessionState } from "./types.js";

beforeEach(() => __resetIdCounter());

/** 항상 해당 슬롯에 "얕은" 항목 하나만 만들어 주는 추출기 */
const shallowExtractor: ExtractFn = async (messages) => {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")!;
  const extraction: AiExtraction = {
    reflection: "정리했습니다.",
    items: [
      {
        field: "duties",
        text: `${lastUser.text}`,
        evidence: [{ messageId: lastUser.id, quote: lastUser.text.slice(0, 10) }],
      },
    ],
    interpretations: [],
    skipped: false,
    conflicts: [],
  };
  return { ok: true, extraction };
};

async function seed(): Promise<SessionState> {
  let s = startInterview(emptySession());
  for (const t of [
    "육군",
    "장교",
    "의무복무 만료",
    "제1사단",
    "정보통신장교",
    "2020.03~2024.02",
    "전역",
    "통신장비 운용",
  ]) {
    s = (await submitAnswer(s, t, shallowExtractor)).state;
  }
  return s;
}

describe("질문 예산", () => {
  it("결과 항목이 예산 부족으로 아예 안 물어지는 일이 없어야 한다", async () => {
    let s = await seed();
    const asked: FieldKey[] = [];

    for (let i = 0; i < 40; i += 1) {
      const q = currentQuestion(s);
      if (!q || q.phase !== "deep_dive") break;
      if (q.field) asked.push(q.field);
      // 항상 짧고 얕게 답해서 슬롯이 잘 안 차게 만든다
      s = (await submitAnswer(s, "그 일을 했습니다", shallowExtractor)).state;
    }

    // 가장 중요한 "결과 / 확인 사항"을 한 번은 물어야 한다
    expect(asked).toContain("outcomes");
  });

  it("한 업무에 물어보는 질문 수가 지나치게 많지 않아야 한다", async () => {
    let s = await seed();
    let count = 0;
    for (let i = 0; i < 40; i += 1) {
      const q = currentQuestion(s);
      if (!q || q.phase !== "deep_dive") break;
      count += 1;
      s = (await submitAnswer(s, "그 일을 했습니다", shallowExtractor)).state;
    }
    expect(count).toBeLessThanOrEqual(12);
  });
});

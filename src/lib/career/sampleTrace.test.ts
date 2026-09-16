import { describe, it } from "vitest";

import { currentQuestion, startInterview, submitAnswer } from "./conductor.js";
import { emptySession } from "./session.js";
import { SAMPLE_SCRIPT, sampleExtractFn } from "./sample.js";

describe.runIf(process.env["TRACE"] === "1")("예시 흐름 추적", () => {
  it("턴별 질문과 답변을 출력한다", async () => {
    let state = startInterview({ ...emptySession(), consentGiven: true });
    state = { ...state, mode: "sample" };

    for (let i = 0; i < SAMPLE_SCRIPT.length; i += 1) {
      const q = currentQuestion(state);
      const turn = SAMPLE_SCRIPT[i]!;
      // eslint-disable-next-line no-console
      console.log(
        `${String(i).padStart(2)} | ${(q?.phase ?? "끝").padEnd(15)} | ${(q?.field ?? "-").padEnd(14)} | ${turn.answer.slice(0, 26)}`,
      );
      const r = await submitAnswer(state, turn.answer, sampleExtractFn(turn));
      state = { ...r.state, mode: "sample" };
    }

    const after = currentQuestion(state);
    // eslint-disable-next-line no-console
    console.log(
      `끝 | 남은 질문: ${after ? `${after.phase}/${after.field ?? "-"} → ${after.question}` : "없음"}`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `보직 ${state.assignments.length}개 / 업무 ${state.assignments.flatMap((a) => a.experiences).length}개`,
    );
  });
});

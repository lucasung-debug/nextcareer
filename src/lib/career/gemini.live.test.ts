/**
 * 실제 Gemini 호출 테스트.
 * LIVE=1 일 때만 동작한다. 요금이 발생하므로 기본적으로 건너뛴다.
 *   $env:LIVE="1"; node node_modules\vitest\vitest.mjs run gemini.live
 */
import { describe, expect, it } from "vitest";

import { callGemini, DEFAULT_MODEL } from "./gemini";
import type { ChatMessage } from "./types";

const KEY = process.env["GEMINI_API_KEY"] ?? "";
const LIVE = process.env["LIVE"] === "1";
const MODELS = (process.env["MODELS"] ?? DEFAULT_MODEL).split(",").map((m) => m.trim());

/** 가상의 답변. 실제 사용자 정보가 아니다. */
const messages: ChatMessage[] = [
  {
    id: "a1",
    role: "assistant",
    text: "그 일을 하실 때 처음부터 끝까지 어떤 순서로 하셨나요?",
  },
  {
    id: "u1",
    role: "user",
    text:
      "부대 인원들 근무표를 매주 짰습니다. 먼저 각 팀에서 올라온 휴가나 교육 일정을 받아서 확인하고, " +
      "겹치는 날이 있으면 팀장들한테 연락해서 조정했어요. 그다음에 최종안을 만들어서 과장님께 결재 받고 " +
      "부대 게시판에 공지했습니다. 급하게 바꿔달라는 요청이 오면 대체 인원이 있는지 먼저 확인했고요.",
  },
];

describe.runIf(LIVE && KEY)("Gemini 실호출", () => {
  for (const model of MODELS) {
    it(
      `${model}: 근거가 붙은 항목을 뽑는다`,
      async () => {
        const started = Date.now();
        const result = await callGemini(
          messages,
          { field: "actions", experienceTitle: "근무표 편성", role: "인사담당관" },
          { apiKey: KEY, model },
        );

        if (!result.ok) {
          // eslint-disable-next-line no-console
          console.log(`[${model}] 실패:`, result.error.code, result.error.message);
        }
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const { extraction } = result;
        // eslint-disable-next-line no-console
        console.log(
          `\n[${model}] ${Date.now() - started}ms | 검증 통과 항목 ${extraction.items.length}개 | 해석 ${extraction.interpretations.length}개`,
        );
        // eslint-disable-next-line no-console
        console.log(`  반영: ${extraction.reflection}`);
        for (const item of extraction.items) {
          // eslint-disable-next-line no-console
          console.log(`  - [${item.field}] ${item.text}`);
          for (const ev of item.evidence) {
            // eslint-disable-next-line no-console
            console.log(`      근거(${ev.messageId}): "${ev.quote}"`);
          }
        }
        for (const p of extraction.interpretations) {
          // eslint-disable-next-line no-console
          console.log(`  · 해석: ${p.text}`);
        }

        // 검증을 통과한 항목이 하나도 없으면 인용을 지어냈다는 뜻이다.
        expect(extraction.items.length).toBeGreaterThan(0);
        expect(extraction.skipped).toBe(false);
      },
      60_000,
    );
  }
});

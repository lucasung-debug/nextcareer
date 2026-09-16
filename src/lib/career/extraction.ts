/**
 * AI 추출 계약
 *
 * AI 는 "다음 질문"을 고르지 않는다. 질문은 planner.ts 가 정한다.
 * AI 가 하는 일은 두 가지뿐이다.
 *   1. 직전 답변을 한 문장으로 반영 (reflection)
 *   2. 답변에서 사실을 뽑고, 그 근거가 되는 원문 인용을 붙이기
 * 뽑아낸 결과는 grounding.ts 를 통과해야만 화면에 올라간다.
 */

import { ALL_FIELDS, FIELD_LABELS, type AiExtraction, type ChatMessage, type FieldKey } from "./types.js";

export const MODEL_ID = "openai/gpt-6-astra";
export const MAX_TEXT = 700;
export const MAX_MESSAGES = 24;

export const SYSTEM_PROMPT = `당신은 전역(예정) 군 간부·부사관의 답변에서 "사실"만 뽑아내는 한국어 추출기입니다.
질문을 새로 만들지 마세요. 질문은 시스템이 따로 정합니다.

당신이 하는 일은 두 가지입니다.
1. reflection: 상대에게 말하듯 한 문장으로 짧게 반영합니다.
   - "사용자는~", "답변했습니다", "응답했습니다" 같은 기록자 말투를 쓰지 마세요.
   - "~하셨군요", "~을 맡으셨네요" 처럼 상대를 주어로 두고 자연스럽게 씁니다.
   - 평가하거나 칭찬하지 않습니다. 사실만 짧게 되돌려줍니다.
2. items: 답변에 실제로 있는 내용만 카드 항목으로 정리합니다.

절대 규칙
- 사용자가 말하지 않은 내용을 쓰지 않습니다. 추측·보완·미화 금지.
- 각 항목의 evidence 에는 사용자 메시지 id 와, 그 메시지에 "글자 그대로" 존재하는 인용을 넣습니다.
  인용을 요약하거나 고쳐 쓰면 그 항목은 버려집니다.
- 수량, 비율, 기간, 인원은 사용자가 말한 숫자만 씁니다. 반올림·환산 금지.
- 성과 평가 표현(무사고, 우수, 개선, 향상, 절감, 달성, 총괄, 리더십, 주도 등)은
  사용자가 그 단어를 직접 말했을 때만 씁니다.
- 민간 직급 환산(과장급, 팀장급 등)은 쓰지 않습니다.
- 확인되지 않은 결과는 "미확인 — ..." 형태로 씁니다. 결과가 없어도 괜찮습니다.
- 반복되는 일상 업무도 그대로 적습니다. 대단해 보이게 바꾸지 않습니다.
- 부대 위치, 병력 규모, 총기·탄약 수량, 장비 식별번호, 보안 절차는 옮겨 적지 않습니다.
- 답변이 "모르겠다/기억이 안 난다/넘어가겠다"이면 skipped=true 로 두고 items 를 비웁니다.
- 이전 답변과 내용이 어긋나면 섞지 말고 conflicts 에 무엇이 어긋나는지 적습니다.

interpretations 는 사실이 아니라 해석입니다. 역량 이름 수준으로 짧게 쓰고,
sourceQuotes 에는 items 의 evidence 에 쓴 인용을 그대로 넣습니다.`;

export function fieldGuide(field: FieldKey | null): string {
  if (!field) return "";
  const guide: Record<FieldKey, string> = {
    duties: "지금은 '어떤 일을 맡았는지'를 묻고 있습니다.",
    scope: "지금은 '어디까지가 본인 담당이었는지'를 묻고 있습니다.",
    actions: "지금은 '본인이 직접 한 행동과 순서'를 묻고 있습니다. 동료가 한 일과 구분하세요.",
    judgment: "지금은 '무엇을 기준으로 판단했는지'를 묻고 있습니다.",
    collaboration: "지금은 '누구와 어떻게 함께 일했는지'를 묻고 있습니다.",
    tools: "지금은 '사용한 양식·문서·시스템'을 묻고 있습니다.",
    difficulty: "지금은 '어려웠던 점과 대처'를 묻고 있습니다.",
    outcomes: "지금은 '확인된 결과'를 묻고 있습니다. 없으면 미확인으로 두세요.",
  };
  return `${guide[field]} 해당 항목의 field 는 "${field}" 입니다.`;
}

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reflection", "items", "interpretations", "skipped", "conflicts"],
  properties: {
    reflection: { type: "string" },
    skipped: { type: "boolean" },
    conflicts: { type: "array", items: { type: "string" } },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "text", "evidence"],
        properties: {
          field: { type: "string", enum: ALL_FIELDS },
          text: { type: "string" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["messageId", "quote"],
              properties: { messageId: { type: "string" }, quote: { type: "string" } },
            },
          },
        },
      },
    },
    interpretations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "sourceQuotes"],
        properties: {
          text: { type: "string" },
          sourceQuotes: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export type ExtractionContext = {
  /** 지금 캐묻고 있는 슬롯 */
  field: FieldKey | null;
  /** 지금 정리 중인 경험 이름 */
  experienceTitle: string;
  /** 보직명 */
  role: string;
};

/** 최근 메시지만 보낸다. 전체 대화를 매번 보내지 않는다. */
export function trimMessages(messages: ChatMessage[], limit = MAX_MESSAGES): ChatMessage[] {
  return messages.slice(-limit);
}

export function buildUserPrompt(messages: ChatMessage[], ctx: ExtractionContext): string {
  const transcript = trimMessages(messages)
    .map((m) => `[${m.role === "user" ? `사용자 id=${m.id}` : "질문"}] ${m.text}`)
    .join("\n");

  const header = [
    ctx.role ? `보직: ${ctx.role}` : "",
    ctx.experienceTitle ? `정리 중인 업무: ${ctx.experienceTitle}` : "",
    fieldGuide(ctx.field),
    ctx.field ? `이번 답변에서 뽑은 항목은 되도록 "${FIELD_LABELS[ctx.field]}"에 넣으세요.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${header}\n\n아래는 지금까지의 대화입니다. evidence 에는 반드시 사용자 메시지의 id 를 쓰세요.\n\n${transcript}\n\n마지막 사용자 답변에서 사실을 뽑아 JSON 으로 작성하세요.`;
}

/** 스트리밍 응답에서 최종 텍스트를 모은다. */
export async function readStreamedText(res: {
  body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null;
}): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completed = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
          text += evt.delta;
        } else if (evt.type === "response.completed" && evt.response?.output_text) {
          completed = Array.isArray(evt.response.output_text)
            ? evt.response.output_text.join("")
            : String(evt.response.output_text);
        }
      } catch {
        // keep-alive 등 JSON 이 아닌 프레임은 무시
      }
    }
  }
  return text || completed;
}

/** 모델 응답 문자열을 AiExtraction 으로 파싱한다. 실패하면 null. */
export function parseExtraction(raw: string): AiExtraction | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const v = value as Partial<AiExtraction>;
  return {
    reflection: typeof v.reflection === "string" ? v.reflection : "",
    items: Array.isArray(v.items) ? v.items : [],
    interpretations: Array.isArray(v.interpretations) ? v.interpretations : [],
    skipped: v.skipped === true,
    conflicts: Array.isArray(v.conflicts) ? v.conflicts : [],
  };
}

export function buildRequestBody(messages: ChatMessage[], ctx: ExtractionContext): unknown {
  return {
    model: MODEL_ID,
    stream: true,
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: buildUserPrompt(messages, ctx) }],
      },
    ],
    reasoning: { effort: "low" },
    max_output_tokens: 1400,
    text: {
      format: {
        type: "json_schema",
        name: "career_extraction",
        strict: true,
        schema: EXTRACTION_SCHEMA,
      },
    },
  };
}

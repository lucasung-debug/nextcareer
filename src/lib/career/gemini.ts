/**
 * Gemini API 호출 레이어
 *
 * - 유료(결제 연결) 프로젝트 키를 쓴다. 무료 구간은 입력이 모델 학습에 쓰이므로
 *   개인 경력을 다루는 이 서비스에는 맞지 않는다.
 * - 키는 서버에서만 읽는다. 클라이언트로 내려보내지 않는다.
 * - 응답은 responseSchema 로 JSON 을 강제하고, 결과는 grounding 검증을 다시 통과해야 한다.
 */

import { buildUserPrompt, SYSTEM_PROMPT, type ExtractionContext } from "./extraction";
import { groundExtraction } from "./grounding";
import type { AiExtraction, ChatMessage } from "./types";
import { ALL_FIELDS } from "./types";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 기본 모델. 비용과 품질 균형을 보고 고른다. */
export const DEFAULT_MODEL = "gemini-3.1-flash-lite";

/**
 * Gemini responseSchema.
 * OpenAPI 서브셋이라 additionalProperties 를 지원하지 않는다.
 * propertyOrdering 으로 출력 순서를 고정해 파싱을 안정화한다.
 */
export const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    reflection: {
      type: "string",
      description: "사용자의 직전 답변을 한 문장으로 짧게 반영. 칭찬이나 평가는 하지 않는다.",
    },
    skipped: {
      type: "boolean",
      description: "사용자가 모르겠다/기억이 안 난다/넘어가겠다고 했으면 true",
    },
    items: {
      type: "array",
      description: "답변에 실제로 있는 내용만. 근거를 만들 수 없으면 넣지 않는다.",
      items: {
        type: "object",
        properties: {
          field: { type: "string", enum: [...ALL_FIELDS] },
          text: { type: "string", description: "사용자가 말한 내용을 정중한 한국어 한 문장으로" },
          evidence: {
            type: "array",
            description: "사용자 메시지에 글자 그대로 존재하는 인용",
            items: {
              type: "object",
              properties: {
                messageId: { type: "string", description: "사용자 메시지의 id" },
                quote: { type: "string", description: "해당 메시지에서 그대로 잘라낸 문구" },
              },
              required: ["messageId", "quote"],
              propertyOrdering: ["messageId", "quote"],
            },
          },
        },
        required: ["field", "text", "evidence"],
        propertyOrdering: ["field", "text", "evidence"],
      },
    },
    interpretations: {
      type: "array",
      description: "사실이 아닌 해석. 역량 이름 수준으로 짧게.",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          sourceQuotes: { type: "array", items: { type: "string" } },
        },
        required: ["text", "sourceQuotes"],
        propertyOrdering: ["text", "sourceQuotes"],
      },
    },
    conflicts: {
      type: "array",
      description: "이전 답변과 어긋나는 내용이 있으면 무엇이 어긋나는지",
      items: { type: "string" },
    },
  },
  required: ["reflection", "skipped", "items", "interpretations", "conflicts"],
  propertyOrdering: ["reflection", "skipped", "items", "interpretations", "conflicts"],
} as const;

export function buildGeminiBody(messages: ChatMessage[], ctx: ExtractionContext): unknown {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(messages, ctx) }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2400,
      responseMimeType: "application/json",
      responseSchema: GEMINI_SCHEMA,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };
}

/** Gemini 응답에서 본문 텍스트를 꺼낸다. */
export function extractText(payload: unknown): string {
  const data = payload as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

export type GeminiFailure = {
  code: "config" | "network" | "rate_limit" | "blocked" | "malformed" | "server";
  message: string;
  retryable: boolean;
};

export function failureForStatus(status: number, detail?: string): GeminiFailure {
  if (status === 400) {
    return {
      code: "malformed",
      message: "요청 형식에 문제가 있어 처리하지 못했습니다. 답변을 조금 줄여서 다시 보내 주세요.",
      retryable: false,
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "config",
      message: "AI 연결 설정에 문제가 있습니다. 가상 사례 체험은 그대로 이용하실 수 있습니다.",
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      code: "rate_limit",
      message: "지금 요청이 몰려 있습니다. 잠시 뒤에 다시 시도해 주세요.",
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      code: "server",
      message: "AI 서버가 일시적으로 응답하지 않습니다. 다시 시도해 주세요.",
      retryable: true,
    };
  }
  return {
    code: "server",
    message: detail ? "AI 응답을 받지 못했습니다. 다시 시도해 주세요." : "알 수 없는 오류가 발생했습니다.",
    retryable: true,
  };
}

export type GeminiResult =
  | { ok: true; extraction: AiExtraction; model: string }
  | { ok: false; error: GeminiFailure };

export type CallOptions = {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export async function callGemini(
  messages: ChatMessage[],
  ctx: ExtractionContext,
  opts: CallOptions,
): Promise<GeminiResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  if (!opts.apiKey) {
    return {
      ok: false,
      error: {
        code: "config",
        message: "AI 연결이 설정되지 않았습니다. 가상 사례 체험을 이용해 주세요.",
        retryable: false,
      },
    };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify(buildGeminiBody(messages, ctx)),
      signal: opts.signal,
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "network",
        message: "네트워크 오류로 AI에 연결하지 못했습니다. 다시 시도해 주세요.",
        retryable: true,
      },
    };
  }

  if (!res.ok) {
    // 본문이나 키는 절대 로그에 남기지 않는다.
    console.error(`[gemini] status ${res.status}`);
    return { ok: false, error: failureForStatus(res.status) };
  }

  const payload = await res.json();
  const text = extractText(payload);
  if (!text) {
    return {
      ok: false,
      error: {
        code: "blocked",
        message: "AI가 답변을 만들지 못했습니다. 표현을 조금 바꿔서 다시 시도해 주세요.",
        retryable: true,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: {
        code: "malformed",
        message: "AI 응답 형식을 이해하지 못했습니다. 다시 시도해 주세요.",
        retryable: true,
      },
    };
  }

  const grounded = groundExtraction(parsed as AiExtraction, messages);
  return { ok: true, extraction: grounded, model };
}

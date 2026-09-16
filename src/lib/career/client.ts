/**
 * 브라우저 → 서버 엔드포인트 호출
 * 키는 서버에만 있으므로 브라우저는 /api/extract 만 부른다.
 */

import type { ExtractionContext } from "./extraction";
import type { AiExtraction, ChatMessage } from "./types";

export type ExtractResponse =
  | { ok: true; extraction: AiExtraction; model?: string }
  | { ok: false; error: { code?: string; message: string; retryable: boolean } };

/** 90초 안에 응답이 없으면 끊는다. */
const TIMEOUT_MS = 90_000;

export async function requestExtraction(
  messages: ChatMessage[],
  context: ExtractionContext,
  signal?: AbortSignal,
): Promise<ExtractResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text })),
        context: {
          field: context.field,
          experienceTitle: context.experienceTitle,
          role: context.role,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: "server",
          message:
            res.status === 429
              ? "지금 요청이 몰려 있습니다. 잠시 뒤에 다시 시도해 주세요."
              : "AI 응답을 받지 못했습니다. 다시 시도해 주세요.",
          retryable: true,
        },
      };
    }

    return (await res.json()) as ExtractResponse;
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ok: false,
      error: {
        code: aborted ? "timeout" : "network",
        message: aborted
          ? "응답이 너무 오래 걸려 중단했습니다. 다시 시도해 주세요."
          : "네트워크 오류로 연결하지 못했습니다. 다시 시도해 주세요.",
        retryable: true,
      },
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

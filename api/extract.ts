/**
 * POST /api/extract
 *
 * 브라우저에서 이 엔드포인트로만 AI를 부른다. Gemini 키는 서버에만 있다.
 *
 * 이 엔드포인트가 하는 일
 *  1. 입력 크기 제한 (프롬프트 폭주·요금 폭증 방지)
 *  2. 민감정보 차단 (서버 쪽 마지막 방어선)
 *  3. Gemini 호출 후 근거 검증까지 끝내서 돌려준다
 *
 * 하지 않는 일
 *  - 대화 내용을 저장하지 않는다. 로그에도 본문을 남기지 않는다.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

import { callGemini, DEFAULT_MODEL } from "../src/lib/career/gemini.js";
import { detectSensitive, sensitiveMessage } from "../src/lib/career/pii.js";
import { checkRateLimit, clientIp, rateLimitMessage } from "../src/lib/career/rateLimit.js";
import { ALL_FIELDS, type ChatMessage, type FieldKey } from "../src/lib/career/types.js";

const MAX_TEXT = 700;
const MAX_MESSAGES = 24;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        role: z.enum(["user", "assistant"]),
        text: z.string().min(1).max(MAX_TEXT),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
  context: z.object({
    field: z.string().nullable(),
    experienceTitle: z.string().max(120).default(""),
    role: z.string().max(120).default(""),
  }),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: { code: "method", message: "POST만 허용됩니다." } });
    return;
  }

  // 공개 서비스라 AI 호출 비용이 운영자에게 청구된다.
  // 반복 호출을 먼저 걸러낸다.
  const limit = checkRateLimit(clientIp(req.headers as Record<string, string | string[] | undefined>));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    res.status(429).json({
      ok: false,
      error: { code: "rate_limit", message: rateLimitMessage(limit), retryable: true },
    });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: {
        code: "malformed",
        message: "요청 형식이 올바르지 않습니다. 답변을 조금 줄여서 다시 보내 주세요.",
        retryable: false,
      },
    });
    return;
  }

  const { messages, context } = parsed.data;

  // 서버 쪽 민감정보 차단. 클라이언트 검사를 우회해도 여기서 막힌다.
  // Gemini 로 전송되는 모든 문자열을 사전에 검사한다.
  // (마지막 사용자 답변만 검사하면 이전 대화·컨텍스트로 우회할 수 있다)
  const scannedTexts = [
    ...messages.map((m) => m.text),
    context.experienceTitle,
    context.role,
  ];
  const hits = scannedTexts.flatMap((t) => detectSensitive(t));
  const uniqueHits = hits.filter(
    (h, i) => hits.findIndex((x) => x.kind === h.kind) === i,
  );
  if (uniqueHits.length > 0) {
    res.status(200).json({
      ok: false,
      error: { code: "sensitive", message: sensitiveMessage(uniqueHits), retryable: false },
    });
    return;
  }

  const apiKey = process.env["GEMINI_API_KEY"] ?? "";
  const field =
    context.field && (ALL_FIELDS as string[]).includes(context.field)
      ? (context.field as FieldKey)
      : null;

  const result = await callGemini(
    messages as ChatMessage[],
    {
      field,
      experienceTitle: context.experienceTitle,
      role: context.role,
    },
    { apiKey, model: process.env["GEMINI_MODEL"] ?? DEFAULT_MODEL, signal: AbortSignal.timeout(50_000) },
  );

  if (!result.ok) {
    // 본문·키는 남기지 않는다. 코드만 기록한다.
    console.error(`[extract] ${result.error.code}`);
    res.status(200).json({ ok: false, error: result.error });
    return;
  }

  res.status(200).json({ ok: true, extraction: result.extraction, model: result.model });
}

/**
 * /api/extract 서버 사전검사(sensitive preflight) 회귀 테스트
 *
 * Gemini 로 전송되는 모든 문자열(전체 messages.text + context.experienceTitle/role)이
 * callGemini 호출 전에 검사되는지 확인한다. 이전 대화·컨텍스트로
 * 마지막 사용자 답변 검사를 우회하는 사례가 여기서 막힌다.
 *
 * callGemini, rateLimit 는 vi.mock 으로 대체한다. 실제 API 호출·키 없음.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callGemini } from "../src/lib/career/gemini.js";
import handler from "./extract.js";
import { checkRateLimit } from "../src/lib/career/rateLimit.js";

vi.mock("../src/lib/career/gemini.js", () => ({
  DEFAULT_MODEL: "gemini-test-model",
  callGemini: vi.fn(),
}));

vi.mock("../src/lib/career/rateLimit.js", () => ({
  checkRateLimit: vi.fn(),
  clientIp: vi.fn(() => "203.0.113.1"),
  rateLimitMessage: vi.fn(() => "잠시 후 다시 시도해 주세요."),
}));

const callGeminiMock = vi.mocked(callGemini);
const checkRateLimitMock = vi.mocked(checkRateLimit);

beforeEach(() => {
  callGeminiMock.mockReset();
  checkRateLimitMock.mockReset();
  checkRateLimitMock.mockReturnValue({
    allowed: true,
    retryAfterSec: 0,
    reason: "ip",
  });
});

/* --- 합성 픽스처. 실제 사용자 데이터 아님 --- */

type RawMessage = { id: string; role: "user" | "assistant"; text: string };

const okExtraction = {
  reflection: "정리했습니다.",
  items: [],
  interpretations: [],
  skipped: false,
  conflicts: [],
};

function makeReq(body: unknown, method = "POST"): VercelRequest {
  return { method, headers: {}, body } as unknown as VercelRequest;
}

function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return { res: res as unknown as VercelResponse, headers, raw: res };
}

const safeUser: RawMessage = {
  id: "m2",
  role: "user",
  text: "근무표 운영과 인사 기록 관리 업무를 담당했습니다.",
};

const safeContext = { field: "duties", experienceTitle: "근무표 운영", role: "인사행정" };

describe("POST /api/extract 민감정보 사전검사", () => {
  it("마지막 사용자 답변이 깨끗해도 이전 사용자 답변에 민감정보가 있으면 막는다", async () => {
    const earlierSensitive: RawMessage = {
      id: "m1",
      role: "user",
      text: "연락처는 010-1234-5678 로 연락 주세요.",
    };
    const { res, raw } = makeRes();

    await handler(makeReq({ messages: [earlierSensitive, safeUser], context: safeContext }), res);

    expect(raw.statusCode).toBe(200);
    const body = raw.body as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("sensitive");
    expect(callGeminiMock).not.toHaveBeenCalled();
  });

  it("assistant 문자열에 민감정보가 있어도 막는다", async () => {
    const assistantSensitive: RawMessage = {
      id: "m1",
      role: "assistant",
      text: "이메일 알려주시면 여기 test@example.com 으로 정리해 드릴게요.",
    };
    const { res, raw } = makeRes();

    await handler(makeReq({ messages: [assistantSensitive, safeUser], context: safeContext }), res);

    const body = raw.body as { ok: boolean; error: { code: string } };
    expect(raw.statusCode).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("sensitive");
    expect(callGeminiMock).not.toHaveBeenCalled();
  });

  it("context.experienceTitle 에 민감정보가 있어도 막는다", async () => {
    const { res, raw } = makeRes();
    await handler(
      makeReq({
        messages: [safeUser],
        context: {
          ...safeContext,
          experienceTitle: "주민번호 900101-1234567 관리 업무",
        },
      }),
      res,
    );

    const body = raw.body as { ok: boolean; error: { code: string } };
    expect(raw.statusCode).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("sensitive");
    expect(callGeminiMock).not.toHaveBeenCalled();
  });

  it("context.role 에 민감정보가 있어도 막는다", async () => {
    const { res, raw } = makeRes();
    await handler(
      makeReq({
        messages: [safeUser],
        context: {
          ...safeContext,
          role: "군번 12-34567 관련 보직",
        },
      }),
      res,
    );

    const body = raw.body as { ok: boolean; error: { code: string } };
    expect(raw.statusCode).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("sensitive");
    expect(callGeminiMock).not.toHaveBeenCalled();
  });

  it("본문이 형식에서 벗어나면 400 malformed 로 응답한다", async () => {
    const { res, raw } = makeRes();
    await handler(makeReq({ messages: "not-an-array" }), res);

    const body = raw.body as { ok: boolean; error: { code: string } };
    expect(raw.statusCode).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("malformed");
    expect(callGeminiMock).not.toHaveBeenCalled();
  });

  it("POST 가 아니면 405 method 로 응답한다", async () => {
    const { res, raw } = makeRes();
    await handler(makeReq({}, "GET"), res);

    const body = raw.body as { ok: boolean; error: { code: string } };
    expect(raw.statusCode).toBe(405);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("method");
    expect(callGeminiMock).not.toHaveBeenCalled();
  });

  it("모두 안전하면 Gemini 를 한 번만 부르고 결과를 돌려준다", async () => {
    callGeminiMock.mockResolvedValue({ ok: true, extraction: okExtraction, model: "gemini-test-model" });
    const { res, raw, headers } = makeRes();

    await handler(makeReq({ messages: [safeUser], context: safeContext }), res);

    expect(raw.statusCode).toBe(200);
    expect(headers["Cache-Control"]).toBe("no-store");
    const body = raw.body as { ok: boolean; extraction: unknown; model: string };
    expect(body.ok).toBe(true);
    expect(body.model).toBe("gemini-test-model");
    expect(body.extraction).toEqual(okExtraction);
    expect(callGeminiMock).toHaveBeenCalledTimes(1);

    const [, ctxArg, optsArg] = callGeminiMock.mock.calls[0] as unknown as [
      RawMessage[],
      { experienceTitle: string; role: string },
      { apiKey: string; model: string; signal: AbortSignal },
    ];
    expect(ctxArg.experienceTitle).toBe("근무표 운영");
    expect(ctxArg.role).toBe("인사행정");
    // 서버가 제 시간 안에 구조화된 실패를 돌려줄 수 있도록 abort 시그널을 건다.
    expect(optsArg.signal).toBeInstanceOf(AbortSignal);
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_GLOBAL,
  MAX_PER_IP,
  WINDOW_MS,
  __resetRateLimit,
  checkRateLimit,
  clientIp,
  rateLimitMessage,
} from "./rateLimit.js";

beforeEach(() => __resetRateLimit());

describe("호출 제한", () => {
  it("한도 안에서는 통과시킨다", () => {
    const now = Date.now();
    for (let i = 0; i < MAX_PER_IP; i += 1) {
      expect(checkRateLimit("1.1.1.1", now).allowed).toBe(true);
    }
  });

  it("한도를 넘으면 막고 대기 시간을 알려준다", () => {
    const now = Date.now();
    for (let i = 0; i < MAX_PER_IP; i += 1) checkRateLimit("1.1.1.1", now);

    const blocked = checkRateLimit("1.1.1.1", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("ip");
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimitMessage(blocked)).toContain("다시 시도");
  });

  it("다른 IP 는 영향을 받지 않는다", () => {
    const now = Date.now();
    for (let i = 0; i < MAX_PER_IP; i += 1) checkRateLimit("1.1.1.1", now);
    expect(checkRateLimit("2.2.2.2", now).allowed).toBe(true);
  });

  it("시간이 지나면 다시 허용한다", () => {
    const now = Date.now();
    for (let i = 0; i < MAX_PER_IP; i += 1) checkRateLimit("1.1.1.1", now);
    expect(checkRateLimit("1.1.1.1", now).allowed).toBe(false);
    expect(checkRateLimit("1.1.1.1", now + WINDOW_MS + 1000).allowed).toBe(true);
  });

  it("전체 폭주도 막는다", () => {
    const now = Date.now();
    let allowed = 0;
    for (let i = 0; i < MAX_GLOBAL + 50; i += 1) {
      if (checkRateLimit(`10.0.${Math.floor(i / 250)}.${i % 250}`, now).allowed) allowed += 1;
    }
    expect(allowed).toBe(MAX_GLOBAL);
    const blocked = checkRateLimit("10.9.9.9", now);
    expect(blocked.reason).toBe("global");
  });

  it("프록시 헤더에서 IP 를 읽는다", () => {
    expect(clientIp({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" })).toBe("203.0.113.5");
    expect(clientIp({ "x-real-ip": "198.51.100.7" })).toBe("198.51.100.7");
    expect(clientIp({})).toBe("");
  });
});

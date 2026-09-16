/**
 * 호출 제한
 *
 * 서비스가 공개되어 있고 AI 호출 비용이 운영자 계정으로 청구되므로,
 * 스크립트로 몰아치는 요청을 1차로 막는다.
 *
 * 한계를 분명히 해두면
 *  - 서버리스 인스턴스마다 카운터가 따로 존재한다. 완벽한 방어가 아니다.
 *  - 최종 방어선은 Google Cloud 쪽 API 할당량이다.
 * 그래도 단순 반복 호출은 여기서 대부분 걸린다.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** 남은 대기 시간(초). 거부됐을 때만 의미가 있다. */
  retryAfterSec: number;
  reason?: "ip" | "global";
};

/** IP 하나가 이 시간 동안 */
export const WINDOW_MS = 10 * 60_000;
/** 보낼 수 있는 최대 요청 수 */
export const MAX_PER_IP = 40;
/** 인스턴스 전체가 이 시간 동안 받을 수 있는 최대 요청 수 (폭주 대비) */
export const MAX_GLOBAL = 400;

type Bucket = number[];

const ipBuckets = new Map<string, Bucket>();
let globalBucket: Bucket = [];

function prune(times: Bucket, now: number): Bucket {
  const cutoff = now - WINDOW_MS;
  let i = 0;
  while (i < times.length && times[i]! <= cutoff) i += 1;
  return i === 0 ? times : times.slice(i);
}

/** 메모리가 무한히 늘어나지 않도록 오래된 IP 기록을 정리한다. */
function sweep(now: number): void {
  if (ipBuckets.size < 5000) return;
  for (const [ip, times] of ipBuckets) {
    const kept = prune(times, now);
    if (kept.length === 0) ipBuckets.delete(ip);
    else ipBuckets.set(ip, kept);
  }
}

export function checkRateLimit(ip: string, now = Date.now()): RateLimitResult {
  sweep(now);

  globalBucket = prune(globalBucket, now);
  if (globalBucket.length >= MAX_GLOBAL) {
    const oldest = globalBucket[0] ?? now;
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
      reason: "global",
    };
  }

  const key = ip || "unknown";
  const times = prune(ipBuckets.get(key) ?? [], now);
  if (times.length >= MAX_PER_IP) {
    const oldest = times[0] ?? now;
    ipBuckets.set(key, times);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
      reason: "ip",
    };
  }

  times.push(now);
  ipBuckets.set(key, times);
  globalBucket.push(now);
  return { allowed: true, retryAfterSec: 0 };
}

/** 테스트용 초기화 */
export function __resetRateLimit(): void {
  ipBuckets.clear();
  globalBucket = [];
}

/** 프록시 헤더에서 클라이언트 IP 를 뽑는다. */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const pick = (v: string | string[] | undefined): string =>
    Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

  const forwarded = pick(headers["x-forwarded-for"]);
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return pick(headers["x-real-ip"]).trim();
}

export function rateLimitMessage(result: RateLimitResult): string {
  const minutes = Math.ceil(result.retryAfterSec / 60);
  if (result.reason === "global") {
    return `지금 이용자가 많아 잠시 대기가 필요합니다. ${minutes}분 뒤에 다시 시도해 주세요. 가상 사례 체험은 그대로 이용하실 수 있습니다.`;
  }
  return `짧은 시간에 요청이 많았습니다. ${minutes}분 뒤에 다시 시도해 주세요. 지금까지 정리된 내용은 그대로 남아 있습니다.`;
}

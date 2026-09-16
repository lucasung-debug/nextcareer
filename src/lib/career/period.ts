/**
 * 재직기간 파서
 *
 * 사용자는 기간을 자유롭게 적는다. 형식을 강요하지 않고 최대한 읽어내되,
 * 읽지 못하면 원문을 그대로 문서에 싣는다. (추측해서 날짜를 만들지 않는다)
 */

import type { Period, PeriodPoint } from "./types";

const ONGOING = /(현재|재직\s*중|지금|진행\s*중)/;

/** "2021년 3월", "2021.03", "2021-3", "21.3" 형태에서 연·월을 뽑는다. */
function parsePoint(raw: string): PeriodPoint | null {
  const text = raw.trim();
  if (!text) return null;

  const m =
    text.match(/(\d{4})\s*(?:년|[.\-/])\s*(\d{1,2})/) ??
    text.match(/(\d{2})\s*[.\-/]\s*(\d{1,2})/);
  if (!m) {
    // 연도만 적은 경우
    const yearOnly = text.match(/(\d{4})\s*년?/);
    if (yearOnly?.[1]) {
      const year = Number(yearOnly[1]);
      if (year >= 1950 && year <= 2100) return { year, month: 1 };
    }
    return null;
  }

  let year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (year < 100) year += year >= 50 ? 1900 : 2000;
  if (year < 1950 || year > 2100) return null;
  if (month < 1 || month > 12) return null;

  return { year, month };
}

export function parsePeriod(raw: string): Period | null {
  const text = raw.trim();
  if (!text) return null;

  const parts = text.split(/[~〜–—]|부터|to|까지/i).map((p) => p.trim()).filter(Boolean);
  const start = parsePoint(parts[0] ?? "");
  if (!start) return null;

  const tail = parts.slice(1).join(" ");
  if (!tail || ONGOING.test(text.slice(text.indexOf(parts[0] ?? "") + (parts[0]?.length ?? 0)))) {
    if (ONGOING.test(text)) return { start, end: null };
  }
  const end = parsePoint(tail);
  if (!end) {
    return ONGOING.test(text) ? { start, end: null } : { start, end: null };
  }
  return { start, end };
}

export function formatPoint(p: PeriodPoint): string {
  return `${p.year}.${String(p.month).padStart(2, "0")}`;
}

export function formatPeriod(period: Period | null, raw: string): string {
  if (!period) return raw.trim();
  const end = period.end ? formatPoint(period.end) : "현재";
  return `${formatPoint(period.start)} ~ ${end}`;
}

/** 개월 수. end 가 없으면 null. */
export function monthsBetween(period: Period): number | null {
  if (!period.end) return null;
  const months =
    (period.end.year - period.start.year) * 12 + (period.end.month - period.start.month) + 1;
  return months > 0 ? months : null;
}

export function formatDuration(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest}개월`;
  if (rest === 0) return `${years}년`;
  return `${years}년 ${rest}개월`;
}

/** 여러 보직의 기간을 합쳐 전체 복무기간 표기를 만든다. */
export function totalServicePeriod(periods: (Period | null)[]): string {
  const valid = periods.filter((p): p is Period => p !== null);
  if (valid.length === 0) return "미확인";

  const starts = valid.map((p) => p.start);
  const earliest = starts.reduce((a, b) =>
    a.year !== b.year ? (a.year < b.year ? a : b) : a.month <= b.month ? a : b,
  );

  const ends = valid.map((p) => p.end);
  if (ends.some((e) => e === null)) {
    return `${formatPoint(earliest)} ~ 현재`;
  }
  const latest = (ends as PeriodPoint[]).reduce((a, b) =>
    a.year !== b.year ? (a.year > b.year ? a : b) : a.month >= b.month ? a : b,
  );

  const months = monthsBetween({ start: earliest, end: latest });
  const span = `${formatPoint(earliest)} ~ ${formatPoint(latest)}`;
  return months ? `${span} (${formatDuration(months)})` : span;
}

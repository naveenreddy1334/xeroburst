// Local-time helpers. The database stores UTC; every "day", "week" and "streak" is computed in the
// organisation time zone (default Asia/Kolkata) using Intl, so there is no date library.

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  s: number;
}

export function localParts(ms: number, tz: string): LocalParts {
  const p: Record<string, number> = {};
  for (const part of fmt(tz).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { y: p.year!, m: p.month!, d: p.day!, h: p.hour! % 24, min: p.minute!, s: p.second! };
}

export function tzOffsetMs(utcMs: number, tz: string): number {
  const p = localParts(utcMs, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** UTC instant of local midnight at the start of y-m-d (m is 1-based, overflow allowed). */
export function localMidnightUtc(y: number, m: number, d: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return t;
}

export function dateKey(ms: number, tz: string): string {
  const p = localParts(ms, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Day number (days since 1970-01-01) of a local date, for streak arithmetic. */
export function dayNumber(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
}

/** 0 = Monday ... 6 = Sunday (or 0 = Sunday when weekStart is sunday). */
export function weekdayIndex(ms: number, tz: string, weekStart: 'monday' | 'sunday'): number {
  const p = localParts(ms, tz);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sunday
  return weekStart === 'monday' ? (dow + 6) % 7 : dow;
}

export interface Window {
  from: number;
  to: number;
  label: string;
  buckets: { key: string; label: string; from: number; to: number }[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function addDays(y: number, m: number, d: number, n: number): { y: number; m: number; d: number } {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * The window for an analytics range. offset 0 is the current period, -1 the one before.
 * day: 24 hourly buckets. week: 7 daily buckets. month: one bucket per day.
 */
export function rangeWindow(
  range: 'day' | 'week' | 'month',
  offset: number,
  nowMs: number,
  tz: string,
  weekStart: 'monday' | 'sunday',
): Window {
  const p = localParts(nowMs, tz);
  if (range === 'day') {
    const base = addDays(p.y, p.m, p.d, offset);
    const from = localMidnightUtc(base.y, base.m, base.d, tz);
    const next = addDays(base.y, base.m, base.d, 1);
    const to = localMidnightUtc(next.y, next.m, next.d, tz);
    const buckets = Array.from({ length: 24 }, (_, h) => ({
      key: String(h).padStart(2, '0'),
      label: String(h).padStart(2, '0'),
      from: from + h * 3600_000,
      to: Math.min(to, from + (h + 1) * 3600_000),
    }));
    const label = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : `${base.d} ${MONTH_NAMES[base.m - 1]}`;
    return { from, to, label, buckets };
  }
  if (range === 'week') {
    const wd = weekdayIndex(nowMs, tz, weekStart);
    const start = addDays(p.y, p.m, p.d, -wd + offset * 7);
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const a = addDays(start.y, start.m, start.d, i);
      const b = addDays(start.y, start.m, start.d, i + 1);
      const dow = new Date(Date.UTC(a.y, a.m - 1, a.d)).getUTCDay();
      return {
        key: `${a.y}-${String(a.m).padStart(2, '0')}-${String(a.d).padStart(2, '0')}`,
        label: DAY_NAMES[dow]!,
        from: localMidnightUtc(a.y, a.m, a.d, tz),
        to: localMidnightUtc(b.y, b.m, b.d, tz),
      };
    });
    const end = addDays(start.y, start.m, start.d, 6);
    const label =
      offset === 0
        ? 'This week'
        : offset === -1
          ? 'Last week'
          : `${start.d} ${MONTH_NAMES[start.m - 1]} - ${end.d} ${MONTH_NAMES[end.m - 1]}`;
    return { from: buckets[0]!.from, to: buckets[6]!.to, label, buckets };
  }
  // month
  let y = p.y;
  let m = p.m + offset;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const buckets = Array.from({ length: days }, (_, i) => {
    const a = { y, m, d: i + 1 };
    const b = addDays(y, m, i + 1, 1);
    return {
      key: `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
      label: String(i + 1),
      from: localMidnightUtc(a.y, a.m, a.d, tz),
      to: localMidnightUtc(b.y, b.m, b.d, tz),
    };
  });
  const label = offset === 0 ? 'This month' : `${MONTH_NAMES[m - 1]} ${y}`;
  return { from: buckets[0]!.from, to: buckets[days - 1]!.to, label, buckets };
}

export const iso = (ms: number) => new Date(ms).toISOString();

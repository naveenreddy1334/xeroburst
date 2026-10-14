// The numbers behind the Analytics gauges and charts, computed from a round's stored target rows. Same formulas as the design:
// Variation = standard deviation / average x 100, RCS = 1 - variation/100 (never below 0), Speed = targets per second.

export interface HitRowDTO {
  seq: number;
  rt_ms: number | null;
  correct: boolean;
  distractor: boolean;
  t_ms: number;
}

export interface Target {
  n: number;
  rt: number | null;
  hit: boolean;
  /** seconds since the round started */
  at: number;
}

export const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
export const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
/** 01:23.4 */
export const fmtClock = (s: number) => {
  const m = Math.floor(s / 60);
  const x = s - m * 60;
  return String(m).padStart(2, '0') + ':' + x.toFixed(1).padStart(4, '0');
};

export function targetsOf(rows: HitRowDTO[]): Target[] {
  return rows.map((r, i) => ({ n: i + 1, rt: r.rt_ms, hit: r.correct, at: r.t_ms / 1000 }));
}

export interface RoundStats {
  avg: number;
  hits: number;
  miss: number;
  acc: number;
  cv: number;
  rcs: number;
  speed: number;
  tot: number;
  count: number;
  fast: Target | null;
  slow: Target | null;
}

export function statsOf(T: Target[]): RoundStats | null {
  if (!T.length) return null;
  const rts = T.filter((x) => x.rt !== null).map((x) => x.rt as number);
  const hits = T.filter((x) => x.hit).length;
  const avg = mean(rts);
  const cv = avg ? (sd(rts) / avg) * 100 : 0;
  const tot = T[T.length - 1]!.at || 0.001;
  const timed = T.filter((x) => x.rt !== null);
  const fast = timed.length ? timed.reduce((a, x) => (x.rt! < a.rt! ? x : a)) : null;
  const slow = timed.length ? timed.reduce((a, x) => (x.rt! > a.rt! ? x : a)) : null;
  return { avg, hits, miss: T.length - hits, acc: (hits / T.length) * 100, cv, rcs: Math.max(0, 1 - cv / 100), speed: T.length / tot, tot, count: T.length, fast, slow };
}

export interface ChartRow {
  n: number;
  rt: number | null;
  ma: number;
  lo: number;
  hi: number;
  acc: number;
  sp: number;
  hit: boolean;
  at: number;
}

/** One row per target: the value, a 3-point moving average, the band around it, running accuracy and instantaneous speed. */
export function rowsOf(T: Target[]): ChartRow[] {
  const rts = T.filter((x) => x.rt !== null).map((x) => x.rt as number);
  const s = sd(rts) * 0.5;
  return T.map((x, i) => {
    const win = T.slice(Math.max(0, i - 2), i + 1).filter((y) => y.rt !== null).map((y) => y.rt as number);
    const m = win.length ? mean(win) : 0;
    const h = T.slice(0, i + 1).filter((y) => y.hit).length;
    return {
      n: x.n,
      rt: x.rt,
      ma: Math.round(m),
      lo: Math.max(0, Math.round(m - s)),
      hi: Math.round(m + s),
      acc: Math.round((h / (i + 1)) * 100),
      sp: x.rt === null ? 0 : +(1 / (x.rt / 1000 + 0.5)).toFixed(2),
      hit: x.hit,
      at: x.at,
    };
  });
}

export function histOf(v: number[]): { x: number; c: number }[] {
  const b: { x: number; c: number }[] = [];
  for (let a = 200; a < 1200; a += 100) b.push({ x: a, c: 0 });
  v.forEach((x) => {
    b[Math.min(b.length - 1, Math.max(0, Math.floor((x - 200) / 100)))]!.c++;
  });
  return b;
}

export const pctDelta = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

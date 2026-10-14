// Result calculations (section 28.3). The app uses these for the instant result screen and the
// server uses the same code to recompute the summary from the uploaded hits, so the stored figures
// never depend on what a device claims.

import type { GameSlug } from './games';

/** One row per board event: a correct hit, a wrong press, a decoy press, or a timeout (pressed_btn null). */
export interface HitRow {
  seq: number;
  target_btn: number | null;
  pressed_btn: number | null;
  rt_ms: number | null;
  correct: boolean;
  distractor: boolean;
  /** ms since the round started */
  t_ms: number;
  /** Memory Sequence: sequence length and step index of this press. */
  len?: number | null;
  step?: number | null;
}

export type PrimaryMetricKey = 'avg_rt' | 'longest_seq' | 'degradation_pct';

export interface MetricInfo {
  key: PrimaryMetricKey;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
}

/** Personal best per game and level (28.3): best average RT; longest sequence; lowest degradation. */
export const PRIMARY_METRIC: Record<GameSlug, MetricInfo> = {
  quick: { key: 'avg_rt', label: 'Average RT', unit: 'ms', lowerIsBetter: true },
  hunt: { key: 'avg_rt', label: 'Average find time', unit: 'ms', lowerIsBetter: true },
  memory: { key: 'longest_seq', label: 'Longest sequence', unit: '', lowerIsBetter: false },
  endure: { key: 'degradation_pct', label: 'Slow-down', unit: '%', lowerIsBetter: true },
};

export interface SummaryBase {
  game: GameSlug;
  /** Memory: longest sequence. Everything else: number of correct hits. */
  score: number;
  duration_ms: number;
  /** Every event row: correct hits, wrong presses, decoy presses, timeouts. */
  events: number;
  correct_hits: number;
  /**
   * ONE definition used everywhere (live screen, result, statistics, reports):
   * every event that was not a correct hit = timeouts + wrong presses + decoy / NO HIT presses.
   * correct_hits + misses === events, always.
   */
  misses: number;
  /** Breakdown of `misses`: the target timed out, nothing was pressed. */
  timeouts: number;
  /** Breakdown of `misses`: pressed the wrong button. */
  wrong_hits: number;
  /** Breakdown of `misses`: pressed a decoy light or pressed during NO HIT. */
  distractor_hits: number;
  /** correct / all events, as a percentage with one decimal */
  accuracy: number;
  avg_rt: number | null;
  best_rt: number | null;
  median_rt: number | null;
  /** consistency: standard deviation of RT, lower is steadier */
  sd_rt: number | null;
}

export interface QuickSummary extends SummaryBase {
  game: 'quick';
  /** RT of each correct hit in order, for the round trend chart */
  trend: number[];
}
export interface MemorySummary extends SummaryBase {
  game: 'memory';
  longest_seq: number;
  errors: number;
  /** Where each mistake happened */
  error_points: { len: number; step: number }[];
  completion_ms: number;
}
export interface HuntSummary extends SummaryBase {
  game: 'hunt';
  find_times: number[];
}
export interface EnduranceSummary extends SummaryBase {
  game: 'endure';
  start_rt: number | null;
  mid_rt: number | null;
  end_rt: number | null;
  /** (end - start) / start as a percentage; positive means slower at the end */
  degradation_pct: number | null;
  /** Mean RT per 5 s bucket */
  curve: { t_s: number; rt: number }[];
}
export type Summary = QuickSummary | MemorySummary | HuntSummary | EnduranceSummary;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);

export function mean(a: number[]): number | null {
  return a.length ? a.reduce((p, c) => p + c, 0) / a.length : null;
}
export function stdev(a: number[]): number | null {
  const m = mean(a);
  if (m === null) return null;
  return Math.sqrt(a.reduce((p, c) => p + (c - m) ** 2, 0) / a.length);
}
export function median(a: number[]): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Summaries stored before the single miss definition existed counted only timeouts as `misses`.
 * Every event that was not a correct hit is a miss, so it is always derivable: this makes old and new
 * rows read the same in the result, statistics and reports.
 */
export function normalizeSummary<T extends Summary>(s: T): T {
  const misses = Math.max(0, s.events - s.correct_hits);
  const legacy = typeof (s as { timeouts?: number }).timeouts !== 'number';
  return {
    ...s,
    misses,
    timeouts: legacy ? Math.max(0, misses - s.wrong_hits - s.distractor_hits) : s.timeouts,
  };
}

/** Counts for a list of event rows. The live screen and the result both use this, so they cannot disagree. */
export interface Tally {
  events: number;
  hits: number;
  /** every event that was not a correct hit */
  misses: number;
  timeouts: number;
  wrong: number;
  distractor: number;
}

export function tally(hits: readonly HitRow[]): Tally {
  let correct = 0;
  let timeouts = 0;
  let wrong = 0;
  let distractor = 0;
  for (const h of hits) {
    if (h.correct) correct++;
    else if (h.pressed_btn === null || h.pressed_btn === undefined) timeouts++;
    else if (h.distractor) distractor++;
    else wrong++;
  }
  return { events: hits.length, hits: correct, misses: timeouts + wrong + distractor, timeouts, wrong, distractor };
}

export function summarize(
  game: GameSlug,
  hits: HitRow[],
  meta: { score?: number; duration_ms: number },
): Summary {
  const correct = hits.filter((h) => h.correct);
  const rts = correct.map((h) => h.rt_ms).filter((x): x is number => typeof x === 'number');
  const t = tally(hits);
  const maxT = hits.reduce((m, h) => Math.max(m, h.t_ms), 0);
  const duration = Math.max(0, meta.duration_ms, maxT);

  const base: SummaryBase = {
    game,
    score: correct.length,
    duration_ms: duration,
    events: hits.length,
    correct_hits: correct.length,
    misses: t.misses,
    timeouts: t.timeouts,
    wrong_hits: t.wrong,
    distractor_hits: t.distractor,
    accuracy: hits.length ? r1((correct.length / hits.length) * 100) : 0,
    avg_rt: rts.length ? r0(mean(rts)!) : null,
    best_rt: rts.length ? Math.min(...rts) : null,
    median_rt: rts.length ? r0(median(rts)!) : null,
    sd_rt: rts.length ? r0(stdev(rts)!) : null,
  };

  switch (game) {
    case 'memory': {
      const fullSeqLens = correct.filter((h) => typeof h.len === 'number' && h.step === (h.len as number) - 1).map((h) => h.len as number);
      const derived = fullSeqLens.length ? Math.max(...fullSeqLens) : 0;
      const hasLen = hits.some((h) => typeof h.len === 'number');
      const longest = hasLen ? derived : Math.max(0, Math.floor(meta.score ?? 0));
      const bad = hits.filter((h) => !h.correct);
      return {
        ...base,
        game: 'memory',
        score: longest,
        longest_seq: longest,
        errors: bad.length,
        error_points: bad.map((h) => ({ len: h.len ?? 0, step: h.step ?? 0 })),
        completion_ms: duration,
      };
    }
    case 'hunt':
      return { ...base, game: 'hunt', find_times: rts };
    case 'endure': {
      const win = (pred: (t: number) => boolean) => {
        const v = correct.filter((h) => typeof h.rt_ms === 'number' && pred(h.t_ms)).map((h) => h.rt_ms as number);
        return v.length ? r0(mean(v)!) : null;
      };
      const start = win((t) => t < 10000);
      const end = win((t) => t >= duration - 10000);
      const mid = win((t) => Math.abs(t - duration / 2) <= 5000);
      const buckets = new Map<number, number[]>();
      for (const h of correct) {
        if (typeof h.rt_ms !== 'number') continue;
        const b = Math.floor(h.t_ms / 5000) * 5;
        buckets.set(b, [...(buckets.get(b) ?? []), h.rt_ms]);
      }
      const curve = [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([t_s, v]) => ({ t_s, rt: r0(mean(v)!) }));
      return {
        ...base,
        game: 'endure',
        start_rt: start,
        mid_rt: mid,
        end_rt: end,
        degradation_pct: start && end ? r1(((end - start) / start) * 100) : null,
        curve,
      };
    }
    default:
      return { ...base, game: 'quick', trend: rts.slice(0, 80) };
  }
}

/** The number a personal best is judged by. */
export function primaryValue(s: Summary | null | undefined): number | null {
  if (!s) return null;
  switch (s.game) {
    case 'memory':
      return s.longest_seq;
    case 'endure':
      return s.degradation_pct;
    default:
      return s.avg_rt;
  }
}

/** true when `candidate` is strictly better than `best` for this game. */
export function isBetter(game: GameSlug, candidate: number | null, best: number | null): boolean {
  if (candidate === null) return false;
  if (best === null) return true;
  return PRIMARY_METRIC[game].lowerIsBetter ? candidate < best : candidate > best;
}

// ---- Display helpers ------------------------------------------------------------------------------

export function fmtMs(n: number | null | undefined): string {
  return n === null || n === undefined ? '--' : `${Math.round(n)} ms`;
}
export function fmtPct(n: number | null | undefined, digits = 0): string {
  return n === null || n === undefined ? '--' : `${n.toFixed(digits)}%`;
}
export function fmtSigned(n: number | null | undefined, unit = '', digits = 0): string {
  if (n === null || n === undefined) return '--';
  const s = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${s}${Math.abs(n).toFixed(digits)}${unit ? ' ' + unit : ''}`;
}
export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '--';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtMetric(game: GameSlug, v: number | null | undefined): string {
  if (v === null || v === undefined) return '--';
  const info = PRIMARY_METRIC[game];
  if (info.key === 'avg_rt') return `${Math.round(v)} ms`;
  if (info.key === 'degradation_pct') return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  return String(v);
}

// ---- Several levels played in one go ----------------------------------------------------------------

export interface RunTotals {
  levels: number;
  events: number;
  hits: number;
  /** every event that was not a correct hit, summed over the levels: the same definition as one round */
  misses: number;
  timeouts: number;
  wrong: number;
  distractor: number;
  accuracy: number;
  /** average over every correct hit of every level (weighted, not an average of averages) */
  avg_rt: number | null;
  best_rt: number | null;
  duration_ms: number;
}

/** Totals for a run of levels (auto progression). Each level is its own stored round; this only adds them up. */
export function runTotals(summaries: readonly Summary[]): RunTotals {
  let events = 0;
  let hits = 0;
  let timeouts = 0;
  let wrong = 0;
  let distractor = 0;
  let rtSum = 0;
  let rtN = 0;
  let best: number | null = null;
  let duration = 0;
  for (const raw of summaries) {
    const s = normalizeSummary(raw);
    events += s.events;
    hits += s.correct_hits;
    timeouts += s.timeouts;
    wrong += s.wrong_hits;
    distractor += s.distractor_hits;
    duration += s.duration_ms;
    if (s.avg_rt !== null && s.correct_hits > 0) {
      rtSum += s.avg_rt * s.correct_hits;
      rtN += s.correct_hits;
    }
    if (s.best_rt !== null) best = best === null ? s.best_rt : Math.min(best, s.best_rt);
  }
  return {
    levels: summaries.length,
    events,
    hits,
    misses: events - hits,
    timeouts,
    wrong,
    distractor,
    accuracy: events ? Math.round((hits / events) * 1000) / 10 : 0,
    avg_rt: rtN ? Math.round(rtSum / rtN) : null,
    best_rt: best,
    duration_ms: duration,
  };
}

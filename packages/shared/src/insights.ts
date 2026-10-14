// Performance Insights & Improvement Plan.
//
// Deterministic rules over the summaries the app already stores. No AI service, no network, no invented
// numbers: every "evidence" line quotes a figure that is computed here from recorded sessions, and every
// "action" and "goal" is labelled as a suggestion in the UI. It is training guidance, not a diagnosis.
//
// The same functions feed the result screen, historical reports, the player profile (coach view), the
// player dashboard and the organisation view, so they cannot disagree with each other or with the stats.

import { GAMES } from './games';
import type { GameSlug } from './games';
import { PRIMARY_METRIC } from './metrics';
import type { Summary } from './metrics';

export interface InsightSession {
  id: string;
  game: GameSlug;
  level: number;
  /** ISO time; sessions are ordered by this */
  started_at: string;
  summary: Summary;
}

export type InsightKind = 'focus' | 'improving' | 'strength' | 'start';

export interface Insight {
  id: string;
  kind: InsightKind;
  game: GameSlug | null;
  title: string;
  /** What the data shows (a measured fact). */
  observation: string;
  /** The metric or comparison behind it (a measured fact). */
  evidence: string;
  /** What to practise (a suggestion). */
  action: string;
  /** A measurable target, only when there is enough baseline data (a suggestion). */
  goal: string | null;
}

export interface InsightsResult {
  /** Completed sessions the insights are based on. */
  sessions_considered: number;
  /** False until there are enough rounds for personal trends. */
  enough_data: boolean;
  /** Plain-language note about the data behind the plan. */
  note: string | null;
  items: Insight[];
}

/** Rounds needed before trends and comparisons are shown. */
export const MIN_ROUNDS_FOR_TRENDS = 3;
/** At most this many recommendations are shown. */
export const MAX_INSIGHTS = 4;

// ---- Aggregation: the one definition of totals, shared with the analytics service --------------------------------

export interface Aggregate {
  sessions: number;
  hits: number;
  misses: number;
  events: number;
  /** Mean RT weighted by correct hits, rounded to ms. */
  avg_rt: number | null;
  time_ms: number;
}

export function aggregate(rows: { summary: Summary }[]): Aggregate {
  let hits = 0;
  let misses = 0;
  let events = 0;
  let rtSum = 0;
  let rtN = 0;
  let time = 0;
  for (const r of rows) {
    hits += r.summary.correct_hits;
    misses += r.summary.misses;
    events += r.summary.events;
    time += r.summary.duration_ms;
    if (r.summary.avg_rt !== null) {
      rtSum += r.summary.avg_rt * r.summary.correct_hits;
      rtN += r.summary.correct_hits;
    }
  }
  return { sessions: rows.length, hits, misses, events, avg_rt: rtN ? Math.round(rtSum / rtN) : null, time_ms: time };
}

/** Accuracy of an aggregate: correct hits over every event, one decimal. */
export function accuracyOf(a: Pick<Aggregate, 'hits' | 'events'>): number | null {
  return a.events ? Math.round((a.hits / a.events) * 1000) / 10 : null;
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface PerfSummary {
  sessions: number;
  hits: number;
  misses: number;
  accuracy: number | null;
  avg_rt: number | null;
  last_session_at: string | null;
  /** Accuracy: last three rounds against the three before. Null with fewer than four rounds. */
  accuracy_trend: { direction: TrendDirection; delta: number } | null;
}

const byTime = <T extends { started_at: string }>(rows: T[]) => [...rows].sort((a, b) => (a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0));
const meanOf = (a: number[]) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : null);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);

function accOf(rows: { summary: Summary }[]): number | null {
  return accuracyOf(aggregate(rows));
}

export function accuracyTrend(rowsInOrder: { summary: Summary }[]): PerfSummary['accuracy_trend'] {
  if (rowsInOrder.length < 4) return null;
  const last = rowsInOrder.slice(-3);
  const prev = rowsInOrder.slice(-6, -3);
  const a = accOf(last);
  const b = accOf(prev);
  if (a === null || b === null) return null;
  const delta = r1(a - b);
  return { direction: delta >= 2 ? 'up' : delta <= -2 ? 'down' : 'flat', delta };
}

export function perfSummary(rows: InsightSession[]): PerfSummary {
  const sorted = byTime(rows);
  const a = aggregate(sorted);
  return {
    sessions: a.sessions,
    hits: a.hits,
    misses: a.misses,
    accuracy: accuracyOf(a),
    avg_rt: a.avg_rt,
    last_session_at: sorted.length ? sorted[sorted.length - 1]!.started_at : null,
    accuracy_trend: accuracyTrend(sorted),
  };
}

// ---- Level-wise performance -------------------------------------------------------------------------------------------

export interface LevelPerf {
  game: GameSlug;
  level: number;
  sessions: number;
  accuracy: number | null;
  avg_rt: number | null;
  best: number | null;
  /** True when this level's accuracy is 10 points or more below the player's accuracy at easier levels. */
  weak: boolean;
}

export function levelPerformance(rows: InsightSession[]): LevelPerf[] {
  const out: LevelPerf[] = [];
  const games = [...new Set(rows.map((r) => r.game))];
  for (const game of games) {
    const g = rows.filter((r) => r.game === game);
    const levels = [...new Set(g.map((r) => r.level))].sort((a, b) => a - b);
    const info = PRIMARY_METRIC[game];
    for (const level of levels) {
      const at = g.filter((r) => r.level === level);
      const a = aggregate(at);
      const vals = at.map((r) => primaryOf(r.summary)).filter((x): x is number => x !== null);
      const best = vals.length ? (info.lowerIsBetter ? Math.min(...vals) : Math.max(...vals)) : null;
      const easier = g.filter((r) => r.level < level);
      const accHere = accuracyOf(a);
      const accEasier = easier.length ? accOf(easier) : null;
      out.push({
        game,
        level,
        sessions: a.sessions,
        accuracy: accHere,
        avg_rt: a.avg_rt,
        best,
        weak: accHere !== null && accEasier !== null && accEasier - accHere >= 10,
      });
    }
  }
  return out;
}

function primaryOf(s: Summary): number | null {
  switch (s.game) {
    case 'quick':
    case 'hunt':
      return s.avg_rt;
    case 'memory':
      return s.longest_seq;
    case 'endure':
      return s.degradation_pct;
  }
}

// ---- Rules ------------------------------------------------------------------------------------------------------------------

interface Candidate extends Insight {
  /** Higher is shown first. */
  weight: number;
}

const GAME_NAME = (g: GameSlug) => GAMES[g].name;
const pct = (n: number) => `${r1(n)}%`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Rules for one game, looking at `target` against the rounds played before it. */
function rulesFor(target: InsightSession, history: InsightSession[], all: InsightSession[], trends: boolean): Candidate[] {
  const s = target.summary;
  const g = target.game;
  const name = GAME_NAME(g);
  const out: Candidate[] = [];
  const push = (c: Omit<Candidate, 'game' | 'id'> & { key: string }) => out.push({ ...c, id: `${g}-${c.key}`, game: g });
  const sameLevelBefore = history.filter((h) => h.level === target.level);
  const maxLevel = GAMES[g].maxLevel;
  const minLevel = GAMES[g].minLevel;

  // 1. Accuracy and misses. One rule, so the same figure is never repeated as two recommendations.
  if (s.events > 0 && s.accuracy < 80) {
    const other = s.wrong_hits + s.distractor_hits;
    const mostly =
      s.timeouts > other
        ? `Most misses were timeouts (${s.timeouts} of ${s.misses}): the light went unpressed in time.`
        : other > s.timeouts
          ? `Most misses were wrong presses (${other} of ${s.misses}): the wrong button was pressed.`
          : `Misses were split between timeouts (${s.timeouts}) and wrong presses (${other}).`;
    const lower = Math.max(minLevel, target.level - 1);
    const target_acc = Math.min(100, Math.ceil(s.accuracy / 5) * 5 + 5);
    push({
      key: 'accuracy',
      kind: 'focus',
      weight: 90 - Math.min(40, s.accuracy / 2),
      title: 'Accuracy comes before speed',
      observation: `${plural(s.misses, 'miss')} in ${plural(s.events, 'event')} in this ${name} round. ${mostly}`,
      evidence: `Accuracy ${pct(s.accuracy)}: ${s.correct_hits} hits, ${s.misses} misses (${s.timeouts} timed out, ${s.wrong_hits} wrong, ${s.distractor_hits} decoy).`,
      action:
        s.timeouts > other
          ? `Practise ${name} at level ${lower} and focus on watching for the next light, before raising the difficulty again.`
          : `Practise ${name} at level ${lower} and check the light before you press, before raising the difficulty again.`,
      goal: `Reach ${target_acc}% accuracy in your next round at level ${lower}.`,
    });
  }

  // 2. Reaction time against the player's own earlier rounds at the same level (Quick and Hunt).
  if ((g === 'quick' || g === 'hunt') && s.avg_rt !== null) {
    const base = meanOf(sameLevelBefore.map((h) => h.summary.avg_rt).filter((x): x is number => x !== null));
    if (trends && base !== null && sameLevelBefore.length >= 2) {
      const diff = s.avg_rt - base;
      const rel = diff / base;
      if (rel >= 0.08) {
        push({
          key: 'rt-slower',
          kind: 'focus',
          weight: 70 + Math.min(15, rel * 100),
          title: 'Slower than your own average',
          observation: `Your average ${g === 'hunt' ? 'find time' : 'reaction time'} at level ${target.level} was slower than usual.`,
          evidence: `${r0(s.avg_rt)} ms now against ${r0(base)} ms across your previous ${plural(sameLevelBefore.length, 'round')} at this level (+${r0(diff)} ms).`,
          action: `Do two or three short ${name} rounds at level ${target.level} while fresh, keeping your hand ready over the board.`,
          goal: `Get back to ${r0(base)} ms or better at level ${target.level}.`,
        });
      } else if (rel <= -0.05) {
        push({
          key: 'rt-faster',
          kind: 'improving',
          weight: 60 + Math.min(15, -rel * 100),
          title: 'Faster than your own average',
          observation: `Your ${g === 'hunt' ? 'find time' : 'reaction time'} at level ${target.level} improved.`,
          evidence: `${r0(s.avg_rt)} ms now against ${r0(base)} ms across your previous ${plural(sameLevelBefore.length, 'round')} at this level (${r0(diff)} ms).`,
          action: s.accuracy >= 85 && target.level < maxLevel ? `Try level ${target.level + 1} next while keeping accuracy at 85% or above.` : `Repeat level ${target.level} to make this speed your normal.`,
          goal: `Hold ${r0(s.avg_rt)} ms or better, with accuracy of at least 85%.`,
        });
      }
    }
    // Consistency: how much RT varies inside the round.
    if (s.sd_rt !== null && s.avg_rt > 0 && s.correct_hits >= 8) {
      const cv = s.sd_rt / s.avg_rt;
      if (cv > 0.35) {
        push({
          key: 'consistency',
          kind: 'focus',
          weight: 55 + Math.min(15, (cv - 0.35) * 60),
          title: 'Uneven reaction times',
          observation: 'Some hits were much slower than others within the round.',
          evidence: `Spread of ${r0(s.sd_rt)} ms around an average of ${r0(s.avg_rt)} ms (${r0(cv * 100)}% of the average).`,
          action: `Use short, rhythmic ${name} rounds at an easier level to keep every hit near the same speed.`,
          goal: `Bring the spread under ${r0(s.avg_rt * 0.3)} ms (30% of your average).`,
        });
      }
    }
  }

  // 3. Memory Sequence: where the mistakes cluster, and the longest sequence against the previous best.
  if (s.game === 'memory') {
    const byLen = new Map<number, number>();
    for (const e of s.error_points) byLen.set(e.len, (byLen.get(e.len) ?? 0) + 1);
    const worst = [...byLen.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (worst && worst[1] >= 2) {
      push({
        key: 'memory-errors',
        kind: 'focus',
        weight: 80,
        title: 'Mistakes repeat at one sequence length',
        observation: `Mistakes bunch up when the sequence reaches ${worst[0]} lights.`,
        evidence: `${plural(worst[1], 'mistake')} at length ${worst[0]} out of ${plural(s.error_points.length, 'mistake')} in this round.`,
        action: `Rehearse sequences of ${worst[0]} lights: say the buttons in groups of two or three as they show.`,
        goal: trends ? `Complete length ${worst[0]} without a mistake in your next round.` : null,
      });
    }
    const prevBest = Math.max(0, ...history.map((h) => (h.summary.game === 'memory' ? h.summary.longest_seq : 0)));
    if (trends && history.length && s.longest_seq > prevBest) {
      push({
        key: 'memory-best',
        kind: 'improving',
        weight: 65,
        title: 'New longest sequence',
        observation: 'You remembered a longer sequence than in any earlier round.',
        evidence: `Longest sequence ${s.longest_seq} against a previous best of ${prevBest}.`,
        action: `Repeat level ${target.level} once to confirm it before moving up.`,
        goal: `Reach a longest sequence of ${s.longest_seq + 1}.`,
      });
    }
  }

  // 4. Endurance: how much the player slows down between the start and the end of the round.
  if (s.game === 'endure' && s.degradation_pct !== null) {
    const prev = history.map((h) => (h.summary.game === 'endure' ? h.summary.degradation_pct : null)).filter((x): x is number => x !== null);
    const prevMean = meanOf(prev);
    if (s.degradation_pct > 15) {
      push({
        key: 'endure-fade',
        kind: 'focus',
        weight: 78,
        title: 'Slowing down late in the round',
        observation: 'Your reaction time got slower as the round went on.',
        evidence: `${s.start_rt !== null ? `${r0(s.start_rt)} ms at the start` : 'Start RT n/a'}, ${s.end_rt !== null ? `${r0(s.end_rt)} ms at the end` : 'end RT n/a'}: ${pct(s.degradation_pct)} slower${trends && prevMean !== null ? ` (your earlier average: ${pct(prevMean)})` : ''}.`,
        action: `Practise ${name} at level ${target.level} with steady breathing and an even pace from the first light.`,
        goal: trends && prevMean !== null ? `Keep the slow-down under ${pct(Math.max(5, Math.min(prevMean, s.degradation_pct) - 5))}.` : `Keep the slow-down under 15%.`,
      });
    } else if (trends && prevMean !== null && s.degradation_pct <= prevMean - 5) {
      push({
        key: 'endure-better',
        kind: 'improving',
        weight: 62,
        title: 'Holding your pace better',
        observation: 'You slowed down less than in your earlier rounds.',
        evidence: `Slow-down ${pct(s.degradation_pct)} against an earlier average of ${pct(prevMean)}.`,
        action: target.level < maxLevel ? `Try level ${target.level + 1} with the same even pace.` : `Repeat this level to lock the pace in.`,
        goal: `Keep the slow-down under ${pct(Math.max(5, s.degradation_pct))}.`,
      });
    }
  }

  // 5. Higher levels: accuracy drops compared with easier levels, taken from every round of this game.
  if (trends) {
    const lp = levelPerformance(all.filter((r) => r.game === g)).filter((l) => l.weak && l.sessions >= 1);
    const first = lp.sort((a, b) => a.level - b.level)[0];
    if (first) {
      const easier = all.filter((r) => r.game === g && r.level < first.level);
      const accEasier = accOf(easier);
      if (accEasier !== null && first.accuracy !== null) {
        const lvls = lp.map((l) => l.level);
        const label = lvls.length > 1 ? `levels ${lvls.join(', ')}` : `level ${first.level}`;
        push({
          key: 'level-drop',
          kind: 'focus',
          weight: 85,
          title: `Accuracy drops at ${label}`,
          observation: `Accuracy falls when ${name} gets harder.`,
          evidence: `${pct(first.accuracy)} at level ${first.level} against ${pct(accEasier)} at easier levels (${r1(accEasier - first.accuracy)} points lower).`,
          action: `Spend your next ${name} rounds at level ${first.level}, aiming for clean hits before speed.`,
          goal: `Reach ${Math.min(100, Math.round(first.accuracy / 5) * 5 + 10)}% accuracy at level ${first.level}.`,
        });
      }
    }
  }

  // 6. Overall accuracy trend for this game.
  if (trends) {
    const seq = byTime(all.filter((r) => r.game === g));
    const t = accuracyTrend(seq);
    if (t && t.direction === 'up') {
      const last = accOf(seq.slice(-3));
      const prev = accOf(seq.slice(-6, -3));
      push({
        key: 'acc-up',
        kind: 'improving',
        weight: 66,
        title: 'Accuracy is improving',
        observation: `Your last three ${name} rounds were more accurate than the three before.`,
        evidence: `${pct(last ?? 0)} against ${pct(prev ?? 0)} (+${t.delta} points).`,
        action: (last ?? 0) >= 85 && target.level < maxLevel ? `Move up to level ${Math.min(maxLevel, target.level + 1)} and keep accuracy at 85% or higher.` : `Keep practising at level ${target.level} until accuracy passes 85%.`,
        goal: `Average ${Math.min(100, Math.round(last ?? 0) + 3)}% accuracy over your next three rounds.`,
      });
    } else if (t && t.direction === 'down') {
      const last = accOf(seq.slice(-3));
      const prev = accOf(seq.slice(-6, -3));
      push({
        key: 'acc-down',
        kind: 'focus',
        weight: 82,
        title: 'Accuracy has slipped lately',
        observation: `Your last three ${name} rounds were less accurate than the three before.`,
        evidence: `${pct(last ?? 0)} against ${pct(prev ?? 0)} (${t.delta} points).`,
        action: `Drop to level ${Math.max(minLevel, target.level - 1)} for a couple of rounds and rebuild accuracy first.`,
        goal: `Return to ${pct(prev ?? 0)} accuracy.`,
      });
    }
  }

  // 7. A clean round with no concerns.
  if (s.events > 0 && s.accuracy >= 95 && !out.some((c) => c.kind === 'focus')) {
    push({
      key: 'clean',
      kind: 'strength',
      weight: 40,
      title: 'Clean round',
      observation: 'Almost every light was hit correctly.',
      evidence: `Accuracy ${pct(s.accuracy)}: ${s.correct_hits} hits, ${plural(s.misses, 'miss')}.`,
      action: target.level < maxLevel ? `You are ready to try level ${target.level + 1}.` : 'You are at the top level: repeat it to build consistency.',
      goal: trends ? `Keep accuracy at 95% or higher at level ${Math.min(maxLevel, target.level + 1)}.` : null,
    });
  }

  return out;
}

/** Beginner guidance when there are too few rounds for personal trends. Clearly general, never presented as a trend. */
function startGuidance(game: GameSlug, rounds: number): Insight {
  const need = MIN_ROUNDS_FOR_TRENDS - rounds;
  const tips: Record<GameSlug, string> = {
    quick: 'Keep your hand relaxed over the board and press each light as soon as it appears. Aim for clean hits first.',
    memory: 'Watch the whole sequence before you press. Say the numbers in small groups to remember them.',
    hunt: 'Scan the whole board first, then go straight to the lit button. Ignore the decoys.',
    endure: 'Start at a pace you can hold for the whole round. Breathe steadily.',
  };
  return {
    id: `${game}-start`,
    kind: 'start',
    game,
    title: 'Build your baseline',
    observation: `Personal trends need at least ${MIN_ROUNDS_FOR_TRENDS} completed rounds. ${need > 0 ? `${plural(need, 'more round')} to go.` : ''}`.trim(),
    evidence: `${plural(rounds, 'completed round')} recorded so far.`,
    action: tips[game],
    goal: null,
  };
}

/**
 * Insights for one round, compared with the same player's earlier rounds of that game.
 * `all` is every completed round of that player, in any order.
 */
export function insightsForSession(sessionId: string, all: InsightSession[]): InsightsResult {
  const sorted = byTime(all);
  const idx = sorted.findIndex((r) => r.id === sessionId);
  if (idx < 0) return { sessions_considered: 0, enough_data: false, note: null, items: [] };
  const target = sorted[idx]!;
  const history = sorted.slice(0, idx).filter((r) => r.game === target.game);
  const total = idx + 1;
  const enough = history.length + 1 >= MIN_ROUNDS_FOR_TRENDS;
  // Rules that look at the whole record only use rounds up to and including this one, so an old report
  // always reads the same as it did when it was new.
  const upTo = sorted.slice(0, idx + 1);
  return finish(rulesFor(target, history, upTo, enough), enough, total, target.game, history.length + 1);
}

/** Insights for the player overall: the latest round of each game they play, with the whole record behind it. */
export function insightsForPlayer(all: InsightSession[]): InsightsResult {
  const sorted = byTime(all);
  if (!sorted.length) {
    return { sessions_considered: 0, enough_data: false, note: 'No completed rounds yet. Play a game and your plan appears here.', items: [] };
  }
  const games = [...new Set(sorted.map((r) => r.game))];
  const cands: Candidate[] = [];
  const guidance: Insight[] = [];
  let anyEnough = false;
  for (const g of games) {
    const rounds = sorted.filter((r) => r.game === g);
    const enough = rounds.length >= MIN_ROUNDS_FOR_TRENDS;
    anyEnough = anyEnough || enough;
    const target = rounds[rounds.length - 1]!;
    const items = rulesFor(target, rounds.slice(0, -1), sorted, enough);
    // Latest rounds count for more: a game played last week matters less than one played today.
    const recency = sorted.indexOf(target) / Math.max(1, sorted.length - 1);
    for (const c of items) cands.push({ ...c, weight: c.weight + recency * 6 });
    if (!enough) guidance.push(startGuidance(g, rounds.length));
  }
  const res = finish(cands, anyEnough, sorted.length, null, sorted.length, 2);
  if (!anyEnough || res.items.length < 2) {
    for (const gd of guidance) {
      if (res.items.length >= MAX_INSIGHTS) break;
      if (!res.items.some((i) => i.game === gd.game)) res.items.push(gd);
    }
  }
  return res;
}

function finish(cands: Candidate[], enough: boolean, total: number, game: GameSlug | null, gameRounds: number, perGame = MAX_INSIGHTS): InsightsResult {
  const ordered = [...cands].sort((a, b) => b.weight - a.weight);
  const items: Insight[] = [];
  const count = new Map<string, number>();
  for (const c of ordered) {
    if (items.length >= MAX_INSIGHTS) break;
    const k = c.game ?? '-';
    if ((count.get(k) ?? 0) >= perGame) continue;
    count.set(k, (count.get(k) ?? 0) + 1);
    const { weight: _w, ...rest } = c;
    void _w;
    items.push(rest);
  }
  // Always say something useful: a steady round gets a plain next step instead of an empty panel.
  if (!items.length && game) {
    items.push({
      id: `${game}-steady`,
      kind: 'strength',
      game,
      title: 'Steady round',
      observation: 'Nothing stood out as a problem in this round.',
      evidence: `${plural(gameRounds, 'completed round')} of ${GAME_NAME(game)} on record.`,
      action: `Keep playing ${GAME_NAME(game)} at this level and watch accuracy and speed settle.`,
      goal: null,
    });
  }
  if (!enough && game && !items.some((i) => i.kind === 'start')) items.push(startGuidance(game, gameRounds));
  const note = enough
    ? `Based on ${plural(total, 'completed round')}. Measured figures are shown as evidence; actions and goals are suggestions for training, not a diagnosis.`
    : `Personal trends need at least ${MIN_ROUNDS_FOR_TRENDS} completed rounds of a game (you have ${gameRounds}). Until then this plan uses this round and general guidance.`;
  return { sessions_considered: total, enough_data: enough, note, items };
}

// ---- Organisation / roster level -----------------------------------------------------------------------------------------

export interface AttentionReason {
  code: 'inactive' | 'accuracy_low' | 'accuracy_down' | 'no_sessions';
  text: string;
}

export interface PlayerPerfInput {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  rounds: InsightSession[];
}

export interface AttentionItem {
  player_id: string;
  name: string;
  code: string;
  reasons: AttentionReason[];
}

/** Players who need a coach's attention, from recorded data only. `now` is passed in so tests are stable. */
export function playersNeedingAttention(players: PlayerPerfInput[], now: number, inactiveDays = 7): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const p of players) {
    if (p.status !== 'active') continue;
    const reasons: AttentionReason[] = [];
    const sorted = byTime(p.rounds);
    if (!sorted.length) {
      reasons.push({ code: 'no_sessions', text: 'No completed rounds yet.' });
    } else {
      const last = Date.parse(sorted[sorted.length - 1]!.started_at);
      const days = Math.floor((now - last) / 86_400_000);
      if (days >= inactiveDays) reasons.push({ code: 'inactive', text: `No round for ${plural(days, 'day')}.` });
      if (sorted.length >= MIN_ROUNDS_FOR_TRENDS) {
        const recent = sorted.slice(-3);
        const acc = accOf(recent);
        if (acc !== null && acc < 75) reasons.push({ code: 'accuracy_low', text: `Accuracy ${pct(acc)} over the last three rounds.` });
        const t = accuracyTrend(sorted);
        if (t && t.direction === 'down' && t.delta <= -5) reasons.push({ code: 'accuracy_down', text: `Accuracy down ${Math.abs(t.delta)} points on the three rounds before.` });
      }
    }
    if (reasons.length) out.push({ player_id: p.id, name: p.name, code: p.code, reasons });
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name));
}

import { describe, expect, it } from 'vitest';
import {
  MAX_INSIGHTS,
  accuracyTrend,
  insightsForPlayer,
  insightsForSession,
  levelPerformance,
  perfSummary,
  playersNeedingAttention,
  summarize,
} from '../src';
import type { InsightSession, HitRow, Summary } from '../src';

/** A quick-reaction round with `hits` correct hits at `rt` ms and the given misses. */
function quick(id: string, day: number, level: number, hits: number, timeouts: number, wrong: number, rt = 400): InsightSession {
  const rows: HitRow[] = [];
  let seq = 0;
  let t = 0;
  for (let i = 0; i < hits; i++) rows.push({ seq: seq++, target_btn: 1, pressed_btn: 1, rt_ms: rt, correct: true, distractor: false, t_ms: (t += 500) });
  for (let i = 0; i < timeouts; i++) rows.push({ seq: seq++, target_btn: 1, pressed_btn: null, rt_ms: null, correct: false, distractor: false, t_ms: (t += 500) });
  for (let i = 0; i < wrong; i++) rows.push({ seq: seq++, target_btn: 1, pressed_btn: 2, rt_ms: 300, correct: false, distractor: false, t_ms: (t += 500) });
  const summary = summarize('quick', rows, { duration_ms: t + 500 }) as Summary;
  return { id, game: 'quick', level, started_at: new Date(Date.UTC(2026, 9, day, 10)).toISOString(), summary };
}

describe('performance summary uses the same figures as the stats', () => {
  it('adds hits, misses and accuracy across rounds', () => {
    const rounds = [quick('a', 1, 1, 8, 1, 1), quick('b', 2, 1, 9, 1, 0)];
    const p = perfSummary(rounds);
    expect(p.sessions).toBe(2);
    expect(p.hits).toBe(17);
    expect(p.misses).toBe(3);
    expect(p.accuracy).toBe(85);
    expect(p.last_session_at).toBe(rounds[1]!.started_at);
  });
  it('accuracy trend needs four rounds', () => {
    const r = [quick('a', 1, 1, 8, 1, 1), quick('b', 2, 1, 8, 1, 1), quick('c', 3, 1, 8, 1, 1)];
    expect(accuracyTrend(r)).toBeNull();
  });
});

describe('insights for one round', () => {
  it('low accuracy: observation quotes the real miss breakdown and sets a measurable goal', () => {
    const rounds = [quick('a', 1, 4, 14, 4, 2)]; // 20 events, 14 hits = 70%
    const res = insightsForSession('a', rounds);
    const acc = res.items.find((i) => i.id === 'quick-accuracy')!;
    expect(acc).toBeTruthy();
    expect(acc.evidence).toContain('70%');
    expect(acc.evidence).toContain('14 hits, 6 misses (4 timed out, 2 wrong, 0 decoy)');
    expect(acc.observation).toContain('timeouts');
    expect(acc.goal).toMatch(/75% accuracy/);
  });
  it('flags a round as insufficient data and gives beginner guidance, not trends', () => {
    const res = insightsForSession('a', [quick('a', 1, 1, 18, 1, 1)]);
    expect(res.enough_data).toBe(false);
    expect(res.note).toMatch(/at least 3 completed rounds/);
    expect(res.items.some((i) => i.kind === 'start')).toBe(true);
    expect(res.items.every((i) => !/against your previous/.test(i.evidence))).toBe(true);
  });
  it('compares reaction time with the same player\'s earlier rounds at the same level', () => {
    const rounds = [quick('a', 1, 3, 19, 0, 1, 400), quick('b', 2, 3, 19, 0, 1, 400), quick('c', 3, 3, 19, 0, 1, 400), quick('d', 4, 3, 19, 0, 1, 470)];
    const res = insightsForSession('d', rounds);
    const slow = res.items.find((i) => i.id === 'quick-rt-slower')!;
    expect(slow.evidence).toBe('470 ms now against 400 ms across your previous 3 rounds at this level (+70 ms).');
    expect(slow.goal).toBe('Get back to 400 ms or better at level 3.');
  });
  it('does not use rounds played after the one being viewed', () => {
    const rounds = [quick('a', 1, 3, 19, 0, 1, 400), quick('b', 2, 3, 19, 0, 1, 400), quick('c', 3, 3, 19, 0, 1, 400), quick('d', 4, 3, 19, 0, 1, 400), quick('e', 5, 3, 19, 0, 1, 700)];
    const old = insightsForSession('d', rounds);
    expect(old.items.some((i) => i.id === 'quick-rt-slower')).toBe(false);
  });
  it('detects accuracy dropping at a harder level', () => {
    const rounds = [
      quick('a', 1, 2, 19, 0, 1), quick('b', 2, 2, 19, 0, 1), quick('c', 3, 2, 19, 0, 1),
      quick('d', 4, 6, 12, 5, 3),
    ];
    const res = insightsForSession('d', rounds);
    const drop = res.items.find((i) => i.id === 'quick-level-drop')!;
    expect(drop.title).toBe('Accuracy drops at level 6');
    expect(drop.evidence).toContain('60% at level 6 against 95% at easier levels');
  });
  it('acknowledges improvement across recent rounds', () => {
    const rounds = [
      quick('a', 1, 2, 14, 4, 2), quick('b', 2, 2, 14, 4, 2), quick('c', 3, 2, 14, 4, 2),
      quick('d', 4, 2, 18, 1, 1), quick('e', 5, 2, 18, 1, 1), quick('f', 6, 2, 19, 0, 1),
    ];
    const res = insightsForSession('f', rounds);
    const up = res.items.find((i) => i.id === 'quick-acc-up')!;
    expect(up.kind).toBe('improving');
    expect(up.evidence).toMatch(/\+\d+(\.\d)? points/);
  });
  it('shows at most four recommendations', () => {
    const rounds = [quick('a', 1, 2, 19, 0, 1), quick('b', 2, 2, 19, 0, 1), quick('c', 3, 2, 19, 0, 1), quick('d', 4, 8, 8, 8, 4, 600)];
    expect(insightsForSession('d', rounds).items.length).toBeLessThanOrEqual(MAX_INSIGHTS);
  });
  it('a steady round still gets a useful next step', () => {
    const rounds = [quick('a', 1, 3, 17, 1, 2), quick('b', 2, 3, 17, 1, 2), quick('c', 3, 3, 17, 1, 2)];
    const res = insightsForSession('c', rounds);
    expect(res.items.length).toBeGreaterThan(0);
  });
  it('unknown session gives an empty result', () => {
    expect(insightsForSession('zzz', [quick('a', 1, 1, 10, 0, 0)]).items).toEqual([]);
  });
});

describe('insights for a player', () => {
  it('empty record: says there is nothing yet and invents nothing', () => {
    const res = insightsForPlayer([]);
    expect(res.items).toEqual([]);
    expect(res.enough_data).toBe(false);
  });
  it('is deterministic', () => {
    const rounds = [quick('a', 1, 2, 14, 4, 2), quick('b', 2, 2, 15, 3, 2), quick('c', 3, 2, 16, 2, 2)];
    expect(insightsForPlayer(rounds)).toEqual(insightsForPlayer([...rounds].reverse()));
  });
});

describe('level-wise performance', () => {
  it('groups by game and level and marks a weak level', () => {
    const rounds = [quick('a', 1, 2, 19, 0, 1), quick('b', 2, 6, 12, 5, 3)];
    const lv = levelPerformance(rounds);
    expect(lv.map((l) => l.level)).toEqual([2, 6]);
    expect(lv[1]!.weak).toBe(true);
    expect(lv[0]!.weak).toBe(false);
  });
});

describe('players needing attention', () => {
  const now = Date.UTC(2026, 9, 20, 10);
  it('lists inactive players and low accuracy, and ignores healthy and inactive accounts', () => {
    const healthy = { id: 'h', name: 'Healthy', code: 'NB-1', status: 'active' as const, rounds: [quick('a', 18, 1, 19, 0, 1), quick('b', 19, 1, 19, 0, 1), quick('c', 20, 1, 19, 0, 1)] };
    const idle = { id: 'i', name: 'Idle', code: 'NB-2', status: 'active' as const, rounds: [quick('d', 1, 1, 19, 0, 1)] };
    const weak = { id: 'w', name: 'Weak', code: 'NB-3', status: 'active' as const, rounds: [quick('e', 18, 1, 12, 5, 3), quick('f', 19, 1, 12, 5, 3), quick('g', 20, 1, 12, 5, 3)] };
    const off = { id: 'o', name: 'Off', code: 'NB-4', status: 'inactive' as const, rounds: [] };
    const none = { id: 'n', name: 'New', code: 'NB-5', status: 'active' as const, rounds: [] };
    const res = playersNeedingAttention([healthy, idle, weak, off, none], now);
    expect(res.map((r) => r.name).sort()).toEqual(['Idle', 'New', 'Weak']);
    expect(res.find((r) => r.name === 'Idle')!.reasons[0]!.text).toBe('No round for 19 days.');
    expect(res.find((r) => r.name === 'Weak')!.reasons[0]!.code).toBe('accuracy_low');
  });
});

import { describe, expect, it } from 'vitest';
import { isBetter, normalizeSummary, primaryValue, runTotals, summarize, tally, type HitRow } from '../src';

const row = (o: Partial<HitRow>): HitRow => ({ seq: 0, target_btn: 1, pressed_btn: 1, rt_ms: 300, correct: true, distractor: false, t_ms: 1000, ...o });

describe('summarize', () => {
  it('quick: average, best, accuracy count misses and wrong presses', () => {
    const hits = [
      row({ rt_ms: 300 }), row({ rt_ms: 400 }), row({ rt_ms: 500 }),
      row({ correct: false, rt_ms: 250, pressed_btn: 2 }),
      row({ correct: false, rt_ms: null, pressed_btn: null }),
    ];
    const s = summarize('quick', hits, { duration_ms: 20000 });
    expect(s.avg_rt).toBe(400);
    expect(s.best_rt).toBe(300);
    expect(s.correct_hits).toBe(3);
    // one definition: every event that was not a correct hit (1 wrong press + 1 timeout)
    expect(s.misses).toBe(2);
    expect(s.timeouts).toBe(1);
    expect(s.wrong_hits).toBe(1);
    expect(s.correct_hits + s.misses).toBe(s.events);
    expect(s.accuracy).toBe(60);
    expect(s.score).toBe(3);
    expect(s.sd_rt).toBe(82);
  });
  it('hunt: decoy presses are counted separately and lower accuracy', () => {
    const s = summarize('hunt', [row({}), row({ correct: false, distractor: true, rt_ms: 200 })], { duration_ms: 5000 });
    expect(s.distractor_hits).toBe(1);
    expect(s.wrong_hits).toBe(0);
    expect(s.accuracy).toBe(50);
  });
  it('memory: longest sequence comes from fully repeated sequences, errors keep their position', () => {
    const hits = [
      row({ len: 1, step: 0 }),
      row({ len: 2, step: 0 }), row({ len: 2, step: 1 }),
      row({ len: 3, step: 0 }), row({ len: 3, step: 1, correct: false, pressed_btn: 9 }),
    ];
    const s = summarize('memory', hits, { duration_ms: 12000, score: 99 });
    if (s.game !== 'memory') throw new Error('type');
    expect(s.longest_seq).toBe(2);
    expect(s.score).toBe(2);
    expect(s.errors).toBe(1);
    expect(s.error_points).toEqual([{ len: 3, step: 1 }]);
  });
  it('endurance: degradation compares the first and last 10 seconds', () => {
    const hits: HitRow[] = [];
    for (let t = 1000; t < 10000; t += 1000) hits.push(row({ t_ms: t, rt_ms: 342 }));
    for (let t = 25000; t < 35000; t += 1000) hits.push(row({ t_ms: t, rt_ms: 367 }));
    for (let t = 50000; t < 60000; t += 1000) hits.push(row({ t_ms: t, rt_ms: 401 }));
    const s = summarize('endure', hits, { duration_ms: 60000 });
    if (s.game !== 'endure') throw new Error('type');
    expect(s.start_rt).toBe(342);
    expect(s.mid_rt).toBe(367);
    expect(s.end_rt).toBe(401);
    expect(s.degradation_pct).toBe(17.3);
    expect(s.curve.length).toBeGreaterThan(5);
  });
  it('empty rounds do not crash', () => {
    const s = summarize('quick', [], { duration_ms: 0 });
    expect(s.accuracy).toBe(0);
    expect(s.avg_rt).toBeNull();
  });
});

describe('personal best direction', () => {
  it('lower RT and lower slow-down are better, longer sequence is better', () => {
    expect(isBetter('quick', 300, 350)).toBe(true);
    expect(isBetter('quick', 400, 350)).toBe(false);
    expect(isBetter('memory', 8, 7)).toBe(true);
    expect(isBetter('endure', 5, 9)).toBe(true);
    expect(isBetter('quick', null, 350)).toBe(false);
    expect(isBetter('quick', 300, null)).toBe(true);
  });
  it('primaryValue reads the right field per game', () => {
    const q = summarize('quick', [row({ rt_ms: 321 })], { duration_ms: 1 });
    expect(primaryValue(q)).toBe(321);
  });
});


describe('one source of truth for hits and misses', () => {
  const wrongPress = (o: Partial<HitRow> = {}) => row({ correct: false, pressed_btn: 2, ...o });
  const timeout = () => row({ correct: false, pressed_btn: null, rt_ms: null });

  it('2 misses during play is 2 misses in the result (the reported bug)', () => {
    const rows = [row({}), row({}), timeout(), row({}), timeout(), row({})];
    const live = tally(rows);
    const s = summarize('quick', rows, { duration_ms: 10000 });
    expect(live.misses).toBe(2);
    expect(s.misses).toBe(2);
    expect(s.correct_hits).toBe(4);
    expect(live.hits).toBe(s.correct_hits);
  });

  it('wrong presses, decoy presses and timeouts are all misses, and add up', () => {
    const rows = [row({}), wrongPress(), wrongPress({ distractor: true }), timeout()];
    const s = summarize('hunt', rows, { duration_ms: 5000 });
    expect(s.misses).toBe(3);
    expect(s.wrong_hits).toBe(1);
    expect(s.distractor_hits).toBe(1);
    expect(s.timeouts).toBe(1);
    expect(s.wrong_hits + s.distractor_hits + s.timeouts).toBe(s.misses);
    expect(s.correct_hits + s.misses).toBe(s.events);
  });

  it('0 misses and many misses', () => {
    expect(summarize('quick', [row({}), row({})], { duration_ms: 1 }).misses).toBe(0);
    const many = Array.from({ length: 9 }, () => timeout());
    expect(summarize('quick', many, { duration_ms: 1 }).misses).toBe(9);
  });

  it('old stored summaries (timeouts only) read the same as new ones', () => {
    const s = summarize('quick', [row({}), wrongPress(), timeout()], { duration_ms: 1 });
    const legacy = { ...s, misses: 1 } as Record<string, unknown>;
    delete legacy.timeouts;
    const fixed = normalizeSummary(legacy as unknown as typeof s);
    expect(fixed.misses).toBe(2);
    expect(fixed.timeouts).toBe(1);
  });

  it('a run over several levels adds the levels up exactly', () => {
    const l1 = summarize('quick', [...Array.from({ length: 8 }, () => row({ rt_ms: 300 })), timeout(), wrongPress()], { duration_ms: 20000 });
    const l2 = summarize('quick', [...Array.from({ length: 5 }, () => row({ rt_ms: 500 })), timeout()], { duration_ms: 15000 });
    expect(l1.correct_hits).toBe(8);
    expect(l1.misses).toBe(2);
    const t = runTotals([l1, l2]);
    expect(t.hits).toBe(13);
    expect(t.misses).toBe(3);
    expect(t.events).toBe(16);
    expect(t.hits + t.misses).toBe(t.events);
    expect(t.levels).toBe(2);
    expect(t.avg_rt).toBe(Math.round((8 * 300 + 5 * 500) / 13));
    expect(t.accuracy).toBe(81.3);
    expect(t.duration_ms).toBe(35000);
  });
});

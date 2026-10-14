import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardSim, SimBot, summarize, tally, parseBoardLine, parseAppLine, LineBuffer, type BoardToApp, type HitRow, type GameSlug } from '../src';

function run(game: GameSlug, level: number, skill = 0.7, seed = 7) {
  let s = seed;
  const random = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const sim = new BoardSim({ random });
  const bot = new SimBot(sim, { skill, random });
  const log: BoardToApp[] = [];
  sim.onMessage((m) => log.push(m));
  bot.attach();
  bot.configure(game, level);
  sim.receive({ t: 'hello' });
  sim.receive({ t: 'cfg', g: game, lv: level });
  sim.receive({ t: 'go' });
  return { sim, log };
}

function toRows(log: BoardToApp[]): HitRow[] {
  const rows: HitRow[] = [];
  for (const m of log) {
    if (m.t === 'hit') rows.push({ seq: rows.length, target_btn: m.tb ?? null, pressed_btn: m.n, rt_ms: m.rt, correct: m.ok === 1, distractor: m.d === 1, t_ms: m.ms ?? 0, len: m.len ?? null, step: m.st ?? null });
    if (m.t === 'miss') rows.push({ seq: rows.length, target_btn: m.n, pressed_btn: null, rt_ms: null, correct: false, distractor: false, t_ms: m.ms ?? 0, len: m.len ?? null, step: m.st ?? null });
  }
  return rows;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('BoardSim handshake', () => {
  it('answers hello, acks cfg, rejects bad config and go before cfg', () => {
    const sim = new BoardSim();
    const log: BoardToApp[] = [];
    sim.onMessage((m) => log.push(m));
    sim.receive({ t: 'hello' });
    sim.receive({ t: 'go' });
    sim.receive({ t: 'cfg', g: 'quick', lv: 11 });
    sim.receive({ t: 'cfg', g: 'quick', lv: 3 });
    expect(log[0]).toMatchObject({ t: 'hello', btn: 10 });
    expect(log[1]).toEqual({ t: 'err', code: 1 });
    expect(log[2]).toEqual({ t: 'err', code: 3 });
    expect(log[3]).toEqual({ t: 'ack', of: 'cfg' });
  });
});

describe('the four games run to the end and produce a summary', () => {
  it('quick reaction ends after 20 targets', () => {
    const { log } = run('quick', 3);
    vi.advanceTimersByTime(120000);
    const end = log.find((m) => m.t === 'end');
    expect(end).toBeTruthy();
    const targets = log.filter((m) => m.t === 'tgt');
    expect(targets).toHaveLength(20);
    const s = summarize('quick', toRows(log), { duration_ms: (end as any).ms });
    expect(s.correct_hits).toBeGreaterThan(10);
    expect(s.avg_rt).toBeGreaterThan(150);
  });

  it('memory sequence grows and ends on strikes with the longest sequence', () => {
    const { log } = run('memory', 2, 0.55, 3);
    vi.advanceTimersByTime(600000);
    const end = log.find((m) => m.t === 'end') as Extract<BoardToApp, { t: 'end' }>;
    expect(end).toBeTruthy();
    const s = summarize('memory', toRows(log), { duration_ms: end.ms ?? 0, score: end.score });
    if (s.game !== 'memory') throw new Error('type');
    expect(s.longest_seq).toBe(end.score);
    expect(s.longest_seq).toBeGreaterThanOrEqual(1);
    expect(log.some((m) => m.t === 'ph' && m.p === 'repeat')).toBe(true);
  });

  it('target hunt at level 8 lights decoys and sometimes NO HIT', () => {
    const { log } = run('hunt', 8, 0.7, 11);
    vi.advanceTimersByTime(300000);
    expect(log.some((m) => m.t === 'end')).toBe(true);
    const go = log.filter((m) => m.t === 'tgt' && m.k === 'go') as Extract<BoardToApp, { t: 'tgt' }>[];
    expect(go.length).toBeGreaterThan(10);
    expect(go.every((m) => m.f && m.f.includes(m.n))).toBe(true);
    expect(go.some((m) => m.d && m.d.length > 0)).toBe(true);
  });

  it('endurance runs for the level length and shows a fatigue curve', () => {
    const { log } = run('endure', 1, 0.6, 5);
    vi.advanceTimersByTime(60000);
    const end = log.find((m) => m.t === 'end') as Extract<BoardToApp, { t: 'end' }>;
    expect(end).toBeTruthy();
    expect(end.ms!).toBeGreaterThanOrEqual(29000);
    expect(end.ms!).toBeLessThan(35000);
    const s = summarize('endure', toRows(log), { duration_ms: end.ms! });
    if (s.game !== 'endure') throw new Error('type');
    expect(s.curve.length).toBeGreaterThan(3);
    expect(s.start_rt).not.toBeNull();
  });

  it('stop aborts a round without an end message', () => {
    const { sim, log } = run('quick', 1);
    vi.advanceTimersByTime(3000);
    sim.receive({ t: 'stop' });
    vi.advanceTimersByTime(60000);
    expect(log.some((m) => m.t === 'end')).toBe(false);
    expect(log.some((m) => m.t === 'ack' && m.of === 'stop')).toBe(true);
  });
});

describe('protocol parsing', () => {
  it('accepts valid board lines and rejects junk', () => {
    expect(parseBoardLine('{"t":"hit","n":7,"ok":1,"rt":342}')).toEqual({ t: 'hit', n: 7, ok: 1, rt: 342 });
    expect(parseBoardLine('{"t":"tgt","n":7,"ms":1250}')).toEqual({ t: 'tgt', n: 7, ms: 1250 });
    expect(parseBoardLine('{"t":"end","score":24}')).toEqual({ t: 'end', score: 24 });
    expect(parseBoardLine('{"t":"hit","n":"x"}')).toBeNull();
    expect(parseBoardLine('not json')).toBeNull();
    expect(parseBoardLine('{"t":"evil"}')).toBeNull();
  });
  it('validates app lines, including the level range', () => {
    expect(parseAppLine('{"t":"cfg","g":"hunt","lv":3}')).toEqual({ t: 'cfg', g: 'hunt', lv: 3 });
    expect(parseAppLine('{"t":"cfg","g":"hunt","lv":30}')).toBeNull();
    expect(parseAppLine('{"t":"cfg","g":"nope","lv":3}')).toBeNull();
  });
  it('LineBuffer rebuilds lines split across Bluetooth chunks', () => {
    const b = new LineBuffer();
    expect(b.push('{"t":"hit","n":7,')).toEqual([]);
    expect(b.push('"ok":1,"rt":342}\n{"t":"miss","n":2}\n')).toEqual(['{"t":"hit","n":7,"ok":1,"rt":342}', '{"t":"miss","n":2}']);
  });
});

import { eventsToRows, simulateRound, seededRandom, memorySequence } from '../src';

describe('simulateRound (virtual time)', () => {
  it('plays every game to the end instantly and deterministically', () => {
    vi.useRealTimers();
    for (const g of ['quick', 'memory', 'hunt', 'endure'] as const) {
      const a = simulateRound(g, 3, { skill: 0.7, seed: 42 });
      const b = simulateRound(g, 3, { skill: 0.7, seed: 42 });
      expect(a.ended).toBe(true);
      expect(a.log.length).toBeGreaterThan(5);
      expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
      const rows = eventsToRows(a.log);
      expect(rows.length).toBeGreaterThanOrEqual(3);
      const s = summarize(g, rows, { duration_ms: a.duration_ms, score: a.score });
      expect(s.game).toBe(g);
    }
  });
  it('a better player is faster', () => {
    vi.useRealTimers();
    const slow = summarize('quick', eventsToRows(simulateRound('quick', 3, { skill: 0.1, seed: 9 }).log), { duration_ms: 1 });
    const fast = summarize('quick', eventsToRows(simulateRound('quick', 3, { skill: 0.95, seed: 9 }).log), { duration_ms: 1 });
    expect(fast.avg_rt!).toBeLessThan(slow.avg_rt!);
  });
  it('seededRandom is repeatable', () => {
    const r1 = seededRandom(5), r2 = seededRandom(5);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

describe('exactly 10 buttons', () => {
  it('every game only ever uses buttons 1 to 10', () => {
    for (const game of ['quick', 'memory', 'hunt', 'endure'] as const) {
      for (const level of [1, 5, 10]) {
        const { log } = simulateRound(game, level, { seed: level + 7 });
        for (const m of log) {
          const used: number[] = [];
          if (m.t === 'tgt') used.push(m.n, ...(m.f ?? []), ...(m.d ?? []));
          if (m.t === 'hit') used.push(m.n);
          if (m.t === 'miss') used.push(m.n);
          for (const n of used) {
            if (m.t === 'tgt' && m.k === 'nohit') continue;
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(10);
          }
        }
      }
    }
  });

  it('the live tally always equals the summary of the same events (hits + misses = events)', () => {
    for (const game of ['quick', 'memory', 'hunt', 'endure'] as const) {
      for (const skill of [0.1, 0.9]) {
        const { log } = simulateRound(game, 4, { seed: 3, skill });
        const rows = eventsToRows(log);
        const t = tally(rows);
        const s = summarize(game, rows, { duration_ms: 1 });
        expect(s.misses).toBe(t.misses);
        expect(s.correct_hits).toBe(t.hits);
        expect(s.correct_hits + s.misses).toBe(rows.length);
      }
    }
  });
});

describe('memory sequence', () => {
  it('level N repeats the first N-1 lights of level N-1 and adds one, for the same seed', () => {
    const full = memorySequence(1234, 10);
    for (let n = 1; n <= 10; n++) expect(memorySequence(1234, n)).toEqual(full.slice(0, n));
    expect(memorySequence(1234, 6)).not.toEqual(memorySequence(99, 6));
    expect(full.every((b) => b >= 1 && b <= 10)).toBe(true);
  });
});

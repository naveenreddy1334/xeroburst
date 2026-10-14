// Role hierarchy, coach player access, performance and insights (second round of XeroBurst changes).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eventsToRows, simulateRound, summarize } from '@nboard/shared';
import type { GameSlug } from '@nboard/shared';
import { PW, makeEnv } from './helpers.js';
import type { TestEnv } from './helpers.js';

let env: TestEnv;
const tok: Record<string, string> = {};
let ravi = '';
let playerA = ''; // Ravi's, registered by Ravi
let playerB = ''; // Sneha's
let seq = 0;

async function play(token: string, game: GameSlug, level: number, skill = 0.6) {
  const id = `h-${++seq}-${Math.random().toString(36).slice(2, 7)}`;
  const c = await env.req('POST', '/sessions', token, { id, game, level, transport: 'mock' });
  expect(c.status, JSON.stringify(c.body)).toBe(201);
  const round = simulateRound(game, level, { seed: seq, skill });
  const hits = eventsToRows(round.log);
  // Stagger the start times so rounds have a stable order.
  const end = Date.now() - (30 - seq) * 60_000;
  const fin = await env.req('POST', `/sessions/${id}/finish`, token, {
    status: 'completed',
    started_at: new Date(end - round.duration_ms).toISOString(),
    ended_at: new Date(end).toISOString(),
    hits,
  });
  expect(fin.status, JSON.stringify(fin.body)).toBe(200);
  return { id, hits, round, fin };
}

beforeAll(async () => {
  env = await makeEnv();
  await env.addUser('sa', 'SUPER_ADMIN');
  ravi = await env.addUser('ravi', 'COACH');
  await env.addUser('sneha', 'COACH');
  for (const n of ['sa', 'ravi', 'sneha']) tok[n] = await env.token(n, PW);
  const a = await env.req('POST', '/players', tok.ravi, { age: 20, weight_kg: 65, display_name: 'Asha Rao' });
  const b = await env.req('POST', '/players', tok.sneha, { age: 20, weight_kg: 65, display_name: 'Bala Nair' });
  playerA = a.body.player.id;
  playerB = b.body.player.id;
  tok.pa = await env.token(a.body.credentials.login_id, a.body.credentials.pin);
  tok.pb = await env.token(b.body.credentials.login_id, b.body.credentials.pin);
});
afterAll(() => env.close());

describe('hierarchy', () => {
  it('Super Admin can play, configure games and see all players', async () => {
    expect((await env.req('GET', '/games', tok.sa)).status).toBe(200);
    expect((await env.req('GET', '/players', tok.sa)).body.items.length).toBe(2);
    expect((await env.req('PUT', `/players/${playerA}/access/memory`, tok.sa, { state: 'unlocked' })).status).toBe(200);
    expect((await env.req('GET', '/analytics/performance', tok.sa)).body.scoped).toBe(false);
    const run = await play(tok.sa, 'quick', 2);
    expect(run.fin.body.session.status).toBe('completed');
  });

  it('Coach cannot do Super Admin-only things', async () => {
    expect((await env.req('GET', '/system/settings', tok.ravi)).status).toBe(403);
    expect((await env.req('GET', '/users', tok.ravi)).status).toBe(403);
    expect((await env.req('POST', '/users', tok.ravi, { email: 'staff@xeroburst.test', phone: '+91 98450 11122', age: 35, login_id: 'x', display_name: 'x', role: 'ADMIN' })).status).toBe(403);
    expect((await env.req('GET', '/audit', tok.ravi)).status).toBe(403);
  });

  it('every role sees every game card; only starting depends on unlock state', async () => {
    for (const t of [tok.sa, tok.ravi, tok.pa]) {
      const g = await env.req('GET', '/games', t);
      expect(g.status).toBe(200);
      expect(g.body.items.map((x: any) => x.slug).sort()).toEqual(['endure', 'hunt', 'memory', 'quick']);
    }
    // Player A: memory is locked for them. They can read it but not start it.
    expect((await env.req('GET', '/games/hunt', tok.pa)).body.state).toBe('locked');
    expect((await env.req('GET', '/games/hunt/howto', tok.pa)).status).toBe(200);
    const start = await env.req('POST', '/sessions', tok.pa, { id: 'locked-try', game: 'hunt', level: 1, transport: 'mock' });
    expect(start.status).toBe(403);
    expect(start.body.error.code).toBe('GAME_LOCKED');
  });
});

describe('coach registers a player and sees their data', () => {
  it('new player appears in the roster with a performance summary, and sessions belong to them', async () => {
    const r = await env.req('POST', '/players', tok.ravi, { weight_kg: 65, display_name: 'Chirag Das', age: 17 });
    expect(r.status).toBe(201);
    const id = r.body.player.id;
    expect(r.body.player.perf.sessions).toBe(0);
    const list = await env.req('GET', '/players?q=Chirag', tok.ravi);
    expect(list.body.items.map((p: any) => p.id)).toEqual([id]);
    const t = await env.token(r.body.credentials.login_id, r.body.credentials.pin);
    const run = await play(t, 'quick', 1);
    const after = await env.req('GET', `/players/${id}`, tok.ravi);
    expect(after.body.perf.sessions).toBe(1);
    expect(after.body.perf.hits).toBe(run.fin.body.session.summary.correct_hits);
    expect(after.body.perf.misses).toBe(run.fin.body.session.summary.misses);
    // The round is in that player's history and nobody else's.
    const mine = await env.req('GET', `/players/${id}/results`, tok.ravi);
    expect(mine.body.items.map((s: any) => s.id)).toContain(run.id);
    const other = await env.req('GET', `/players/${playerA}/results`, tok.ravi);
    expect(other.body.items.map((s: any) => s.id)).not.toContain(run.id);
  });

  it('a Coach reads full performance, results and insights of every player', async () => {
    await play(tok.pa, 'quick', 3);
    await play(tok.pa, 'quick', 3, 0.3);
    expect((await env.req('GET', `/players/${playerA}/performance`, tok.ravi)).status).toBe(200);
    expect((await env.req('GET', `/players/${playerB}/performance`, tok.ravi)).status).toBe(200);
    expect((await env.req('GET', `/players/${playerB}/performance`, tok.pa)).status).toBe(403);
    expect((await env.req('GET', `/players/${playerB}/performance`, tok.sa)).status).toBe(200);
  });

  it('the roster performance summary counts every player for a Coach as for the Super Admin', async () => {
    await play(tok.pb, 'quick', 2);
    const mine = (await env.req('GET', '/analytics/performance', tok.ravi)).body;
    const all = (await env.req('GET', '/analytics/performance', tok.sa)).body;
    expect(mine.scoped).toBe(false);
    expect(mine.players).toBe(all.players);
    expect(mine.rounds_30d).toBe(all.rounds_30d);
  });
});

describe('statistics and recommendations read the same numbers', () => {
  it('profile totals equal the sum of the stored rounds and the analytics totals', async () => {
    const perf = (await env.req('GET', `/players/${playerA}/performance`, tok.ravi)).body;
    const results = (await env.req('GET', `/players/${playerA}/results?status=completed&limit=100`, tok.ravi)).body.items as any[];
    const hits = results.reduce((n, s) => n + s.summary.correct_hits, 0);
    const misses = results.reduce((n, s) => n + s.summary.misses, 0);
    expect(perf.summary.sessions).toBe(results.length);
    expect(perf.summary.hits).toBe(hits);
    expect(perf.summary.misses).toBe(misses);
    const an = (await env.req('GET', `/players/${playerA}/analytics?range=month`, tok.ravi)).body;
    expect(an.totals.hits).toBe(hits);
    expect(an.totals.misses).toBe(misses);
  });

  it('session insights quote the exact recorded figures of that round', async () => {
    const run = await play(tok.pa, 'quick', 5, 0.25); // weak round
    const s = run.fin.body.session.summary;
    const ins = (await env.req('GET', `/sessions/${run.id}/insights`, tok.pa)).body;
    expect(ins.sessions_considered).toBeGreaterThanOrEqual(3);
    if (s.accuracy < 80) {
      const acc = ins.items.find((i: any) => i.id === 'quick-accuracy');
      expect(acc.evidence).toContain(`${s.correct_hits} hits, ${s.misses} misses`);
    }
    expect(ins.items.length).toBeLessThanOrEqual(4);
    // The round's own summary equals what the server recomputes from its hit rows.
    const expected = summarize('quick', run.hits, { duration_ms: run.round.duration_ms });
    expect(s.misses).toBe(expected.misses);
  });

  it('insights are protected like the session itself', async () => {
    const run = await play(tok.pa, 'quick', 2);
    expect((await env.req('GET', `/sessions/${run.id}/insights`, tok.ravi)).status).toBe(200);
    expect((await env.req('GET', `/sessions/${run.id}/insights`, tok.sa)).status).toBe(200);
    expect((await env.req('GET', `/sessions/${run.id}/insights`, tok.sneha)).status).toBe(200);
    expect((await env.req('GET', `/sessions/${run.id}/insights`, tok.pb)).status).toBe(403);
    expect((await env.req('GET', `/sessions/${run.id}/insights`, null)).status).toBe(401);
    expect((await env.req('GET', '/sessions/nope/insights', tok.pa)).status).toBe(404);
  });

  it('a player with no rounds gets an empty, honest plan', async () => {
    const r = await env.req('POST', '/players', tok.ravi, { age: 20, weight_kg: 65, display_name: 'Empty Case' });
    const t = await env.token(r.body.credentials.login_id, r.body.credentials.pin);
    const perf = (await env.req('GET', '/me/performance', t)).body;
    expect(perf.summary.sessions).toBe(0);
    expect(perf.trend).toEqual([]);
    expect(perf.insights.items).toEqual([]);
    expect(perf.insights.enough_data).toBe(false);
    expect(perf.comparison).toBeNull();
  });

  it('trend points are in time order and comparison needs six rounds', async () => {
    const perf = (await env.req('GET', `/players/${playerA}/performance`, tok.ravi)).body;
    const times = perf.trend.map((p: any) => p.started_at);
    expect([...times].sort()).toEqual(times);
    expect(perf.summary.sessions >= 6 ? perf.comparison !== null : perf.comparison === null).toBe(true);
  });
});

void ravi;

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eventsToRows, primaryValue, simulateRound, summarize } from '@nboard/shared';
import type { GameSlug } from '@nboard/shared';
import { PW, makeEnv } from './helpers.js';
import type { TestEnv } from './helpers.js';

let env: TestEnv;
const tok: Record<string, string> = {};
let playerId = '';
let seq = 0;
const sid = () => `test-session-${++seq}-${Math.random().toString(36).slice(2, 8)}`;

async function play(token: string, game: GameSlug, level: number, opts: { status?: 'completed' | 'interrupted' | 'aborted'; seed?: number; skill?: number } = {}) {
  const id = sid();
  const created = await env.req('POST', '/sessions', token, { id, game, level, transport: 'mock' });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const round = simulateRound(game, level, { seed: opts.seed ?? seq, skill: opts.skill ?? 0.6 });
  const hits = eventsToRows(round.log);
  const now = Date.now();
  const fin = await env.req('POST', `/sessions/${id}/finish`, token, {
    status: opts.status ?? 'completed',
    started_at: new Date(now - round.duration_ms).toISOString(),
    ended_at: new Date(now).toISOString(),
    hits,
  });
  return { id, hits, round, fin };
}

beforeAll(async () => {
  env = await makeEnv();
  await env.addUser('sa', 'SUPER_ADMIN');
  await env.addUser('ad', 'ADMIN');
  await env.addUser('coach', 'COACH');
  tok.sa = await env.token('sa', PW);
  tok.ad = await env.token('ad', PW);
  tok.coach = await env.token('coach', PW);
  const mk = await env.req('POST', '/players', tok.coach, { age: 20, weight_kg: 65, display_name: 'Test Player' });
  playerId = mk.body.player.id;
  tok.pl = await env.token(mk.body.credentials.login_id, mk.body.credentials.pin);
});
afterAll(() => env.close());

describe('game access', () => {
  it('a player sees locked games as locked and cannot open or start them', async () => {
    const games = await env.req('GET', '/games', tok.pl);
    const state = Object.fromEntries(games.body.items.map((g: any) => [g.slug, g.state]));
    expect(state).toEqual({ quick: 'unlocked', memory: 'locked', hunt: 'locked', endure: 'locked' });
    // Locked games stay visible and readable; only starting is refused.
    const open = await env.req('GET', '/games/memory', tok.pl);
    expect(open.status).toBe(200);
    expect(open.body.state).toBe('locked');
    expect((await env.req('GET', '/games/memory/howto', tok.pl)).status).toBe(200);
    const start = await env.req('POST', '/sessions', tok.pl, { id: sid(), game: 'memory', level: 1, transport: 'mock' });
    expect(start.status).toBe(403);
    expect(start.body.error.code).toBe('GAME_LOCKED');
    expect(start.body.error.details.game).toBe('memory');
  });

  it('staff see every game as unlocked', async () => {
    const games = await env.req('GET', '/games', tok.coach);
    expect(games.body.items.every((g: any) => g.state === 'unlocked')).toBe(true);
  });

  it('the Coach unlocks a game and caps the level; the cap is enforced on start', async () => {
    const set = await env.req('PUT', `/players/${playerId}/access/memory`, tok.coach, { state: 'unlocked', level_cap: 3 });
    expect(set.status).toBe(200);
    const ok = await env.req('POST', '/sessions', tok.pl, { id: sid(), game: 'memory', level: 3, transport: 'mock' });
    expect(ok.status).toBe(201);
    expect(ok.body.level_cap).toBe(3);
    const over = await env.req('POST', '/sessions', tok.pl, { id: sid(), game: 'memory', level: 4, transport: 'mock' });
    expect(over.status).toBe(403);
    expect(over.body.error.code).toBe('GAME_LOCKED');
    expect(over.body.error.details.level_cap).toBe(3);
  });

  it('locking a game refuses the next start', async () => {
    await env.req('PUT', `/players/${playerId}/access/memory`, tok.coach, { state: 'locked' });
    const r = await env.req('POST', '/sessions', tok.pl, { id: sid(), game: 'memory', level: 1, transport: 'mock' });
    expect(r.body.error.code).toBe('GAME_LOCKED');
    await env.req('PUT', `/players/${playerId}/access/memory`, tok.coach, { state: 'unlocked' });
  });
});

describe('a session from start to result', () => {
  it('stores the hits and recomputes the summary on the server', async () => {
    const { id, hits, round, fin } = await play(tok.pl, 'quick', 5, { seed: 11 });
    expect(fin.status).toBe(200);
    const expected = summarize('quick', hits, { duration_ms: round.duration_ms });
    expect(fin.body.session.summary.correct_hits).toBe(expected.correct_hits);
    expect(fin.body.session.summary.avg_rt).toBe(expected.avg_rt);
    expect(fin.body.session.status).toBe('completed');
    expect(fin.body.is_pb).toBe(true);
    const count = env.ctx.db.prepare('SELECT COUNT(*) c FROM hits WHERE session_id = ?').get(id) as { c: number };
    expect(count.c).toBe(hits.length);
  });

  it('ignores a summary the device might claim: only hits count', async () => {
    const id = sid();
    await env.req('POST', '/sessions', tok.pl, { id, game: 'quick', level: 2, transport: 'ble' });
    const now = Date.now();
    const fin = await env.req('POST', `/sessions/${id}/finish`, tok.pl, {
      status: 'completed',
      started_at: new Date(now - 30000).toISOString(),
      ended_at: new Date(now).toISOString(),
      summary: { avg_rt: 1, correct_hits: 9999 },
      hits: [
        { seq: 0, target_btn: 3, pressed_btn: 3, rt_ms: 400, correct: true, distractor: false, t_ms: 1000 },
        { seq: 1, target_btn: 5, pressed_btn: 6, rt_ms: 700, correct: false, distractor: false, t_ms: 3000 },
      ],
    });
    expect(fin.status).toBe(200);
    expect(fin.body.session.summary.correct_hits).toBe(1);
    expect(fin.body.session.summary.accuracy).toBe(50);
    expect(fin.body.session.summary.avg_rt).toBe(400);
  });

  it('uploading twice is safe and returns the stored result', async () => {
    const { id, hits, fin } = await play(tok.pl, 'quick', 4, { seed: 5 });
    const again = await env.req('POST', `/sessions/${id}/finish`, tok.pl, {
      status: 'completed',
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      hits: hits.slice(0, 2),
    });
    expect(again.status).toBe(200);
    expect(again.body.session.summary).toEqual(fin.body.session.summary);
    const count = env.ctx.db.prepare('SELECT COUNT(*) c FROM hits WHERE session_id = ?').get(id) as { c: number };
    expect(count.c).toBe(hits.length);
  });

  it("another user cannot upload or abort someone else's session", async () => {
    const id = sid();
    await env.req('POST', '/sessions', tok.pl, { id, game: 'quick', level: 1, transport: 'mock' });
    const body = { status: 'completed', started_at: new Date().toISOString(), ended_at: new Date().toISOString(), hits: [] };
    expect((await env.req('POST', `/sessions/${id}/finish`, tok.coach, body)).status).toBe(403);
    expect((await env.req('POST', `/sessions/${id}/abort`, tok.coach)).status).toBe(403);
    expect((await env.req('POST', `/sessions/${id}/abort`, tok.pl)).body.status).toBe('aborted');
  });

  it('reports a delta against the previous session and flags a personal best', async () => {
    const a = await play(tok.pl, 'quick', 6, { seed: 21, skill: 0.4 });
    const b = await play(tok.pl, 'quick', 6, { seed: 22, skill: 0.95 });
    expect(b.fin.body.previous.id).toBe(a.id);
    expect(b.fin.body.delta.key).toBe('avg_rt');
    expect(b.fin.body.delta.lower_is_better).toBe(true);
    expect(b.fin.body.delta.better).toBe(true);
    expect(b.fin.body.is_pb).toBe(true);
    const c = await play(tok.pl, 'quick', 6, { seed: 23, skill: 0.2 });
    expect(c.fin.body.is_pb).toBe(false);
    expect(c.fin.body.delta.better).toBe(false);
  });

  it('stopped (interrupted) rounds count in analytics but not in bests and streaks', async () => {
    const before = await env.req('GET', '/me/analytics?range=week&game=hunt', tok.pl);
    expect(before.body.totals.sessions).toBe(0);
    await env.req('PUT', `/players/${playerId}/access/hunt`, tok.coach, { state: 'unlocked' });
    const r = await play(tok.pl, 'hunt', 3, { status: 'interrupted', seed: 31 });
    expect(r.fin.body.session.status).toBe('interrupted');
    expect(r.fin.body.is_pb).toBe(false);
    const after = await env.req('GET', '/me/analytics?range=week&game=hunt', tok.pl);
    expect(after.body.totals.sessions).toBe(1);
    expect(after.body.streak).toEqual(before.body.streak);
    const games = await env.req('GET', '/games', tok.pl);
    expect(games.body.items.find((g: any) => g.slug === 'hunt').bests).toEqual([]);
    // Saved, though: it shows in the results list with its status, and the Coach can open it.
    const list = await env.req('GET', '/me/results?game=hunt', tok.pl);
    expect(list.body.items[0].status).toBe('interrupted');
    expect((await env.req('GET', `/sessions/${r.id}`, tok.coach)).status).toBe(200);
  });
});

describe('targets', () => {
  it('a met target marks the game Completed but does not unlock the next game', async () => {
    await env.req('PUT', `/players/${playerId}/access/quick`, tok.coach, { state: 'unlocked', target_sessions: 2, target_level: 7, target_accuracy: 0 });
    const g1 = await play(tok.pl, 'quick', 7, { seed: 41 });
    expect(g1.fin.body.state_change).toBeNull();
    const g2 = await play(tok.pl, 'quick', 7, { seed: 42 });
    expect(g2.fin.body.state_change).toBe('completed');
    const acc = await env.req('GET', `/players/${playerId}/access`, tok.coach);
    const byGame = Object.fromEntries(acc.body.items.map((a: any) => [a.game, a.state]));
    expect(byGame.quick).toBe('completed');
    expect(byGame.endure).toBe('locked');
    // Completed is still playable (D6).
    expect((await env.req('POST', '/sessions', tok.pl, { id: sid(), game: 'quick', level: 1, transport: 'mock' })).status).toBe(201);
  });
});

describe('programs', () => {
  let p: string;
  beforeAll(async () => {
    const mk = await env.req('POST', '/players', tok.coach, { age: 20, weight_kg: 65, display_name: 'Program Player', program_id: 'prog_default_foundation' });
    p = mk.body.player.id;
  });

  it('assigning the default program starts at week 1 with the 25% figure', async () => {
    const d = await env.req('GET', `/players/${p}`, tok.coach);
    expect(d.body.stage).toBe(1);
    expect(d.body.stage_count).toBe(4);
    expect(d.body.progress_pct).toBe(25);
    expect(d.body.games_unlocked).toBe(1);
  });

  it('advance unlocks the stage games; set-stage steps back and locks them again', async () => {
    const states = async () => Object.fromEntries((await env.req('GET', `/players/${p}/access`, tok.coach)).body.items.map((a: any) => [a.game, a.state]));
    await env.req('POST', `/players/${p}/program/advance`, tok.coach);
    await env.req('POST', `/players/${p}/program/advance`, tok.coach);
    expect(await states()).toEqual({ quick: 'unlocked', memory: 'unlocked', hunt: 'unlocked', endure: 'locked' });
    const d = await env.req('GET', `/players/${p}`, tok.coach);
    expect(d.body.progress_pct).toBe(75);
    await env.req('PUT', `/players/${p}/program/stage`, tok.coach, { stage: 1 });
    expect(await states()).toEqual({ quick: 'unlocked', memory: 'locked', hunt: 'locked', endure: 'locked' });
  });

  it('manual changes always win over the program', async () => {
    await env.req('PUT', `/players/${p}/access/endure`, tok.coach, { state: 'unlocked' });
    await env.req('PUT', `/players/${p}/program/stage`, tok.coach, { stage: 2 });
    await env.req('PUT', `/players/${p}/program/stage`, tok.coach, { stage: 1 });
    const acc = (await env.req('GET', `/players/${p}/access`, tok.coach)).body.items;
    expect(acc.find((a: any) => a.game === 'endure').state).toBe('unlocked');
    expect(acc.find((a: any) => a.game === 'endure').manual).toBe(true);
    expect(acc.find((a: any) => a.game === 'memory').state).toBe('locked');
  });

  it('cannot advance past the last stage; a program in use cannot be deleted', async () => {
    await env.req('PUT', `/players/${p}/program/stage`, tok.coach, { stage: 4 });
    const over = await env.req('POST', `/players/${p}/program/advance`, tok.coach);
    expect(over.status).toBe(409);
    expect((await env.req('PUT', `/players/${p}/program/stage`, tok.coach, { stage: 9 })).status).toBe(422);
    const del = await env.req('DELETE', '/programs/prog_default_foundation', tok.ad);
    expect(del.status).toBe(409);
    const mine = await env.req('POST', '/programs', tok.coach, { name: 'Unused', stages: [{ label: 'A', games: ['quick'] }] });
    expect((await env.req('DELETE', `/programs/${mine.body.id}`, tok.coach)).status).toBe(200);
  });
});

describe('analytics', () => {
  it('weekly totals, per-game figures, bests and streak', async () => {
    const r = await env.req('GET', '/me/analytics?range=week', tok.pl);
    expect(r.status).toBe(200);
    expect(r.body.timezone).toBe('Asia/Kolkata');
    expect(r.body.series).toHaveLength(7);
    expect(r.body.totals.sessions).toBeGreaterThan(0);
    const sum = r.body.series.reduce((p: number, s: any) => p + s.sessions, 0);
    expect(sum).toBe(r.body.totals.sessions);
    expect(r.body.per_game.find((g: any) => g.game === 'quick').sessions).toBeGreaterThan(0);
    expect(r.body.pbs.length).toBeGreaterThan(0);
    expect(r.body.streak.current).toBe(1);
    expect((await env.req('GET', '/me/analytics?range=day', tok.pl)).body.series).toHaveLength(24);
    expect((await env.req('GET', '/me/analytics?range=month', tok.pl)).body.series.length).toBeGreaterThanOrEqual(28);
    expect((await env.req('GET', '/me/analytics?range=year', tok.pl)).status).toBe(422);
  });

  it("the Coach sees the player's analytics; overview counts players only, not staff sessions", async () => {
    const a = await env.req('GET', `/players/${playerId}/analytics?range=week`, tok.coach);
    expect(a.body.totals.sessions).toBeGreaterThan(0);
    const before = (await env.req('GET', '/analytics/overview', tok.coach)).body;
    await play(tok.coach, 'quick', 2, { seed: 91 });
    const after = (await env.req('GET', '/analytics/overview', tok.coach)).body;
    expect(after.sessions_week).toBe(before.sessions_week);
    expect(after.total_players).toBe(2);
    const act = await env.req('GET', '/activity', tok.coach);
    expect(act.body.items.every((i: any) => i.player_name)).toBe(true);
    expect(act.body.items.some((i: any) => i.player_id === playerId)).toBe(true);
  });

  it('paging through results with a cursor', async () => {
    const first = await env.req('GET', '/me/results?limit=2', tok.pl);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.next_cursor).toBeTruthy();
    const second = await env.req('GET', `/me/results?limit=2&cursor=${first.body.next_cursor}`, tok.pl);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    expect(second.body.items.map((i: any) => i.id)).not.toContain(first.body.items[1].id);
  });

  it('personal best uses the right metric per game', async () => {
    await env.req('PUT', `/players/${playerId}/access/endure`, tok.coach, { state: 'unlocked' });
    await env.req('PUT', `/players/${playerId}/access/memory`, tok.coach, { state: 'unlocked' });
    const m = await play(tok.pl, 'memory', 3, { seed: 61 });
    const e = await play(tok.pl, 'endure', 1, { seed: 62 });
    expect(m.fin.body.delta.key).toBe('longest_seq');
    expect(e.fin.body.delta.key).toBe('degradation_pct');
    expect(m.fin.body.delta.value).toBe(primaryValue(m.fin.body.session.summary));
  });
});

describe('Assess: staff record a round for a player', () => {
  it('lands in the player analytics, and the hits endpoint serves per-target rows', async () => {
    const id = sid();
    const c = await env.req('POST', '/sessions', tok.coach, { id, game: 'quick', level: 1, transport: 'mock', player_id: playerId });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const round = simulateRound('quick', 1, { seed: 7, skill: 0.6 });
    const now = Date.now();
    const fin = await env.req('POST', `/sessions/${id}/finish`, tok.coach, {
      status: 'completed',
      started_at: new Date(now - round.duration_ms).toISOString(),
      ended_at: new Date(now).toISOString(),
      hits: eventsToRows(round.log),
    });
    expect(fin.status, JSON.stringify(fin.body)).toBe(200);
    const mine = await env.req('GET', `/sessions/${id}`, tok.pl);
    expect(mine.status).toBe(200);
    const hits = await env.req('GET', `/sessions/${id}/hits`, tok.pl);
    expect(hits.status).toBe(200);
    expect(hits.body.hits.length).toBeGreaterThan(0);
  });

  it('a player cannot record for someone else, and an unknown player is refused', async () => {
    const r = await env.req('POST', '/sessions', tok.pl, { id: sid(), game: 'quick', level: 1, transport: 'mock', player_id: 'someone' });
    expect(r.status).toBe(403);
    const r2 = await env.req('POST', '/sessions', tok.coach, { id: sid(), game: 'quick', level: 1, transport: 'mock', player_id: 'nobody' });
    expect(r2.status).toBe(404);
  });
});

describe('board and rts', () => {
  it('serves the latest round per player and the reaction-time pool', async () => {
    await play(tok.coach, 'quick', 1, { seed: 3 });
    const b = await env.req('GET', '/analytics/board?game=quick', tok.coach);
    expect(b.status).toBe(200);
    expect(b.body.items.length).toBeGreaterThan(0);
    const rts = await env.req('GET', `/players/${playerId}/rts?game=quick&days=30`, tok.coach);
    expect(rts.status).toBe(200);
    expect(Array.isArray(rts.body.rts)).toBe(true);
    expect((await env.req('GET', '/analytics/board?game=quick', tok.pl)).status).toBe(403);
  });
});

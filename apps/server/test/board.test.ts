import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RowCollector, parseBoardLine } from '@nboard/shared';
import type { BoardToApp } from '@nboard/shared';
import WebSocket from 'ws';
import { PW, makeEnv } from './helpers.js';
import type { TestEnv } from './helpers.js';

let env: TestEnv;
const tok: Record<string, string> = {};
let playerId = '';
let port = 0;
let seq = 0;
const sid = () => `board-session-${++seq}-${Math.random().toString(36).slice(2, 8)}`;

interface Conn {
  ws: any;
  msgs: any[];
  closed: Promise<number>;
  wait(pred: (m: any) => boolean, ms?: number): Promise<any>;
  send(m: object): void;
}

async function connect(ticket: string): Promise<Conn> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/board?ticket=${ticket}`);
  const msgs: any[] = [];
  const waiters: { pred: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  ws.on('message', (raw: Buffer) => {
    const m = JSON.parse(raw.toString());
    msgs.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const closed = new Promise<number>((r) => ws.on('close', (code: number) => r(code)));
  return {
    ws,
    msgs,
    closed,
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 5000) =>
      new Promise((resolve, reject) => {
        const found = msgs.find(pred);
        if (found) return resolve(found);
        const t = setTimeout(() => reject(new Error(`timed out; saw ${JSON.stringify(msgs.slice(-5))}`)), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
      }),
  };
}

async function open(token: string, game: string, level: number) {
  const id = sid();
  const r = await env.req('POST', '/sessions', token, { id, game, level, transport: 'bridge' });
  return { id, res: r, ticket: r.body.board_ticket as string };
}

beforeAll(async () => {
  env = await makeEnv({ noBoard: false, boardSim: true });
  await env.app.listen({ port: 0, host: '127.0.0.1' });
  port = (env.app.server.address() as { port: number }).port;
  await env.addUser('coach', 'COACH');
  tok.coach = await env.token('coach', PW);
  const mk = await env.req('POST', '/players', tok.coach, { age: 20, weight_kg: 65, display_name: 'Relay Player', starting_games: ['quick', 'memory'] });
  playerId = mk.body.player.id;
  tok.pl = await env.token(mk.body.credentials.login_id, mk.body.credentials.pin);
  await env.req('PUT', `/players/${playerId}/access/memory`, tok.coach, { level_cap: 3 });
});
afterAll(() => env.close());

describe('board relay (simulated board)', () => {
  it('reports the simulator in the board status', async () => {
    const s = await env.req('GET', '/board/status', tok.pl);
    expect(s.body).toMatchObject({ mode: 'sim', connected: true, busy: false, buttons: 10 });
    expect(s.body.held_by).toBeNull();
  });

  it('plays a whole round through the relay and the result matches the hits', async () => {
    const { id, res, ticket } = await open(tok.pl, 'quick', 10);
    expect(res.status).toBe(201);
    expect(res.body.ticket_expires_in).toBe(60);
    const c = await connect(ticket);
    const srv = await c.wait((m) => m.t === 'srv');
    expect(srv).toMatchObject({ session: id, board_connected: true, level_cap: 10 });

    // While the lock is held: the status shows busy, players do not see who, staff do.
    const busy = await env.req('GET', '/board/status', tok.pl);
    expect(busy.body.busy).toBe(true);
    expect(busy.body.held_by).toBeNull();
    expect((await env.req('GET', '/board/status', tok.coach)).body.held_by.name).toBe('Relay Player');

    c.send({ t: 'hello' });
    await c.wait((m) => m.t === 'hello');
    c.send({ t: 'cfg', g: 'quick', lv: 10 });
    await c.wait((m) => m.t === 'ack' && m.of === 'cfg');
    const rows = new RowCollector();
    const started = Date.now();
    c.send({ t: 'go' });
    const hb = setInterval(() => c.send({ t: 'hb' }), 500);
    const end = await c.wait((m) => m.t === 'end', 40_000);
    clearInterval(hb);
    // Every line the board sent was valid protocol and reached the lock holder.
    for (const m of c.msgs) {
      if (m.t === 'srv') continue;
      expect(parseBoardLine(JSON.stringify(m)), JSON.stringify(m)).not.toBeNull();
      rows.push(m as BoardToApp);
    }
    expect(rows.rows.length).toBeGreaterThan(5);
    expect(end.score).toBeGreaterThan(0);

    const fin = await env.req('POST', `/sessions/${id}/finish`, tok.pl, {
      status: 'completed',
      started_at: new Date(started).toISOString(),
      ended_at: new Date().toISOString(),
      hits: rows.rows,
    });
    expect(fin.status).toBe(200);
    expect(fin.body.session.summary.correct_hits).toBe(end.score);
    // Finishing releases the lock at once.
    expect((await env.req('GET', '/board/status', tok.pl)).body.busy).toBe(false);
    await c.closed;
  }, 60_000);

  it('a ticket works once', async () => {
    const { ticket } = await open(tok.pl, 'quick', 1);
    const a = await connect(ticket);
    await a.wait((m) => m.t === 'srv');
    const b = await connect(ticket);
    const code = await b.closed;
    expect(code).toBe(4401);
    expect(b.msgs[0]).toMatchObject({ t: 'err', code: 101 });
    a.ws.close();
    await a.closed;
  });

  it('refuses a second session while the board is held, and frees it when the app disconnects', async () => {
    const one = await open(tok.pl, 'quick', 1);
    const c1 = await connect(one.ticket);
    await c1.wait((m) => m.t === 'srv');

    const busy = await env.req('POST', '/sessions', tok.coach, { id: sid(), game: 'quick', level: 1, transport: 'bridge' });
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('BOARD_BUSY');

    // A ticket obtained by a non-bridge session still cannot take the lock.
    const sneaky = await env.req('POST', '/sessions', tok.coach, { id: sid(), game: 'quick', level: 1, transport: 'mock' });
    const c2 = await connect(sneaky.body.board_ticket);
    expect(await c2.closed).toBe(4409);
    expect(c2.msgs[0]).toMatchObject({ t: 'err', code: 102 });

    c1.ws.close();
    await c1.closed;
    await new Promise((r) => setTimeout(r, 100));
    expect((await env.req('GET', '/board/status', tok.pl)).body.busy).toBe(false);
    const ok = await env.req('POST', '/sessions', tok.coach, { id: sid(), game: 'quick', level: 1, transport: 'bridge' });
    expect(ok.status).toBe(201);
  });

  it('forwards cfg only for the approved game, at or below the level cap', async () => {
    const { ticket } = await open(tok.pl, 'memory', 3);
    const c = await connect(ticket);
    const srv = await c.wait((m) => m.t === 'srv');
    expect(srv.level_cap).toBe(3);
    c.send({ t: 'cfg', g: 'hunt', lv: 1 });
    expect(await c.wait((m) => m.t === 'err')).toMatchObject({ code: 101 });
    c.msgs.length = 0;
    c.send({ t: 'cfg', g: 'memory', lv: 8 });
    expect(await c.wait((m) => m.t === 'err')).toMatchObject({ code: 101 });
    c.msgs.length = 0;
    c.send({ t: 'cfg', g: 'memory', lv: 3 });
    expect(await c.wait((m) => m.t === 'ack')).toMatchObject({ of: 'cfg' });
    c.send({ t: 'nonsense' });
    expect(await c.wait((m) => m.t === 'err' && m.msg === 'Unknown command.')).toBeTruthy();
    c.send({ t: 'stop' });
    c.ws.close();
    await c.closed;
  });

  it('a lost heartbeat releases the board and marks the session interrupted', async () => {
    const { id, ticket } = await open(tok.pl, 'quick', 1);
    const c = await connect(ticket);
    await c.wait((m) => m.t === 'srv');
    // No heartbeats. The test hub times out after 1.5 s and checks every 2 s.
    expect(await c.closed).toBe(1000);
    const s = await env.req('GET', `/sessions/${id}`, tok.pl);
    expect(s.body.status).toBe('interrupted');
    expect((await env.req('GET', '/board/status', tok.pl)).body.busy).toBe(false);
    // The app can still upload what it had.
    const fin = await env.req('POST', `/sessions/${id}/finish`, tok.pl, {
      status: 'interrupted',
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      hits: [{ seq: 0, target_btn: 1, pressed_btn: 1, rt_ms: 300, correct: true, distractor: false, t_ms: 900 }],
    });
    expect(fin.status).toBe(200);
    expect(fin.body.session.summary.correct_hits).toBe(1);
    expect(fin.body.session.status).toBe('interrupted');
  }, 20_000);
});

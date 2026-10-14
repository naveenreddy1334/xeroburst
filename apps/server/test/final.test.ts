// Final updates: mandatory fields on the server, every module open to staff, a Coach reaching every player,
// and older records (no age, weight or contact details) staying valid.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PW, makeEnv } from './helpers.js';
import type { TestEnv } from './helpers.js';

let env: TestEnv;
const tok: Record<string, string> = {};
let playerA = ''; // Ravi's
let playerB = ''; // Sneha's
let legacy = ''; // created before the new rules: no age or weight
let pa = '';

const goodPlayer = { display_name: 'Asha Rao', age: 17, weight_kg: 58 };
const goodCoach = { login_id: 'coach.new', display_name: 'Coach New', role: 'COACH', email: 'new@xeroburst.test', phone: '+91 98450 11122', age: 36 };

beforeAll(async () => {
  env = await makeEnv();
  await env.addUser('sa', 'SUPER_ADMIN');
  await env.addUser('ravi', 'COACH');
  const sneha = await env.addUser('sneha', 'COACH');
  for (const n of ['sa', 'ravi', 'sneha']) tok[n] = await env.token(n, PW);
  const a = await env.req('POST', '/players', tok.ravi, goodPlayer);
  const b = await env.req('POST', '/players', tok.sneha, { ...goodPlayer, display_name: 'Bala Nair' });
  expect(a.status).toBe(201);
  expect(b.status).toBe(201);
  playerA = a.body.player.id;
  playerB = b.body.player.id;
  pa = await env.token(a.body.credentials.login_id, a.body.credentials.pin);
  // A record from before the new rules.
  const id = 'u_legacy0000000000001';
  env.ctx.db.prepare(`INSERT INTO users (id, login_id, display_name, role, password_hash, must_change_password, is_active, created_at) VALUES (?,?,?,?,?,0,1,?)`).run(id, 'nb-9001', 'Legacy Lee', 'PLAYER', 'x', new Date().toISOString());
  env.ctx.db.prepare(`INSERT INTO player_profiles (user_id, player_code, coach_id, status) VALUES (?,?,?,?)`).run(id, 'NB-9001', sneha, 'active');
  legacy = id;
});
afterAll(async () => env.close());

describe('mandatory fields: player', () => {
  it.each([
    ['blank name', { ...goodPlayer, display_name: '   ' }, 'display_name'],
    ['one-letter name', { ...goodPlayer, display_name: 'A' }, 'display_name'],
    ['digits-only name', { ...goodPlayer, display_name: '12345' }, 'display_name'],
    ['missing age', { display_name: 'No Age', weight_kg: 60 }, 'age'],
    ['null age', { ...goodPlayer, age: null }, 'age'],
    ['age too low', { ...goodPlayer, age: 2 }, 'age'],
    ['age too high', { ...goodPlayer, age: 101 }, 'age'],
    ['fractional age', { ...goodPlayer, age: 17.5 }, 'age'],
    ['missing weight', { display_name: 'No Weight', age: 20 }, 'weight_kg'],
    ['weight too low', { ...goodPlayer, weight_kg: 5 }, 'weight_kg'],
    ['weight too high', { ...goodPlayer, weight_kg: 400 }, 'weight_kg'],
    ['text weight', { ...goodPlayer, weight_kg: 'heavy' }, 'weight_kg'],
  ])('rejects %s', async (_n, body, field) => {
    const r = await env.req('POST', '/players', tok.ravi, body);
    expect(r.status).toBe(422);
    expect(r.body.error.details.fields[field]).toBeTruthy();
  });

  it('accepts a complete record', async () => {
    const r = await env.req('POST', '/players', tok.ravi, { ...goodPlayer, display_name: 'Chosen Name' });
    expect(r.status).toBe(201);
    expect(r.body.player.age).toBe(17);
    expect(r.body.player.weight_kg).toBe(58);
  });

  it('edits are validated too', async () => {
    expect((await env.req('PATCH', `/players/${playerA}`, tok.ravi, { display_name: '  ' })).status).toBe(422);
    expect((await env.req('PATCH', `/players/${playerA}`, tok.ravi, { age: null })).status).toBe(422);
    expect((await env.req('PATCH', `/players/${playerA}`, tok.ravi, { weight_kg: 0 })).status).toBe(422);
    const ok = await env.req('PATCH', `/players/${playerA}`, tok.ravi, { age: 18, weight_kg: 60 });
    expect(ok.status).toBe(200);
  });
});

describe('mandatory fields: coach', () => {
  it('rejects a Coach without contact details, and does not ask for weight', async () => {
    const none = await env.req('POST', '/users', tok.sa, { login_id: 'coach.bad', display_name: 'Coach Bad', role: 'COACH' });
    expect(none.status).toBe(422);
    expect(Object.keys(none.body.error.details.fields).sort()).toEqual(['age', 'email', 'phone']);
    expect((await env.req('POST', '/users', tok.sa, { ...goodCoach, email: 'not-an-email' })).body.error.details.fields.email).toBeTruthy();
    expect((await env.req('POST', '/users', tok.sa, { ...goodCoach, phone: 'abc' })).body.error.details.fields.phone).toBeTruthy();
    expect((await env.req('POST', '/users', tok.sa, { ...goodCoach, age: 17 })).body.error.details.fields.age).toBeTruthy();
    expect((await env.req('POST', '/users', tok.sa, { ...goodCoach, display_name: '   ' })).body.error.details.fields.display_name).toBeTruthy();
    const withWeight = await env.req('POST', '/users', tok.sa, { ...goodCoach, weight_kg: undefined });
    expect(withWeight.status).toBe(201);
  });

  it('stores and returns the contact details', async () => {
    const r = await env.req('POST', '/users', tok.sa, { ...goodCoach, login_id: 'coach.two', display_name: 'Coach Two' });
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe('new@xeroburst.test');
    expect(r.body.user.phone).toBe('+91 98450 11122');
    expect(r.body.user.age).toBe(36);
    const list = await env.req('GET', '/users?role=COACH', tok.sa);
    expect(list.body.items.find((u: any) => u.login_id === 'coach.two').email).toBe('new@xeroburst.test');
  });

  it('Coach and Admin edits are validated', async () => {
    const id = (await env.req('GET', '/users?role=COACH', tok.sa)).body.items.find((u: any) => u.login_id === 'coach.two').id;
    expect((await env.req('PATCH', `/users/${id}`, tok.sa, { email: 'nope' })).status).toBe(422);
    expect((await env.req('PATCH', `/users/${id}`, tok.sa, { phone: '+91 99999 00000', age: 40 })).status).toBe(200);
  });
});

describe('every module is open to staff', () => {
  it('Super Admin and Coach see all four modules enabled; a Player keeps the old restriction', async () => {
    for (const t of [tok.sa, tok.ravi]) {
      const r = await env.req('GET', '/modules', t);
      expect(r.body.items.map((m: any) => m.key)).toEqual(['nboard', 'nbase', 'ncourt', 'npad']);
      expect(r.body.items.every((m: any) => m.enabled && !m.coming_soon)).toBe(true);
    }
    const p = await env.req('GET', '/modules', pa);
    expect(p.body.items.find((m: any) => m.key === 'nboard').enabled).toBe(true);
    for (const k of ['nbase', 'ncourt', 'npad']) {
      const m = p.body.items.find((x: any) => x.key === k);
      expect(m.enabled).toBe(false);
      expect(m.coming_soon).toBe(true);
    }
  });

  it('staff can run a round in any module and it is stored with that module', async () => {
    for (const key of ['nbase', 'ncourt', 'npad']) {
      const id = `mod-${key}-${Math.random().toString(36).slice(2, 8)}`;
      const c = await env.req('POST', '/sessions', tok.ravi, { id, game: 'quick', level: 1, transport: 'mock', module_key: key });
      expect(c.status, JSON.stringify(c.body)).toBe(201);
      expect((await env.req('GET', `/sessions/${id}`, tok.ravi)).body.module_key).toBe(key);
      expect((await env.req('GET', `/sessions/${id}`, tok.sa)).body.module_key).toBe(key);
    }
    const plain = await env.req('POST', '/sessions', tok.sa, { id: 'mod-default-1', game: 'quick', level: 1, transport: 'mock' });
    expect(plain.status).toBe(201);
    expect((await env.req('GET', '/sessions/mod-default-1', tok.sa)).body.module_key).toBe('nboard');
  });

  it('a Player cannot start a round in another module, and an unknown module is invalid', async () => {
    const no = await env.req('POST', '/sessions', pa, { id: 'mod-player-1', game: 'quick', level: 1, transport: 'mock', module_key: 'nbase' });
    expect(no.status).toBe(403);
    const bad = await env.req('POST', '/sessions', tok.ravi, { id: 'mod-bad-001', game: 'quick', level: 1, transport: 'mock', module_key: 'nothing' });
    expect(bad.status).toBe(422);
    const own = await env.req('POST', '/sessions', pa, { id: 'mod-player-2', game: 'quick', level: 1, transport: 'mock' });
    expect(own.status).toBe(201);
  });
});

describe('a Coach reaches every player; a Player only themselves', () => {
  it("opens, searches and edits another Coach's player", async () => {
    expect((await env.req('GET', `/players/${playerB}`, tok.ravi)).status).toBe(200);
    expect((await env.req('GET', `/players/${playerB}/performance`, tok.ravi)).status).toBe(200);
    expect((await env.req('GET', `/players/${playerB}/results`, tok.ravi)).status).toBe(200);
    const list = await env.req('GET', '/players?q=Bala', tok.ravi);
    expect(list.body.items.map((p: any) => p.id)).toEqual([playerB]);
    expect((await env.req('PATCH', `/players/${playerB}`, tok.ravi, { display_name: 'Bala N' })).status).toBe(200);
    expect((await env.req('PUT', `/players/${playerB}/access/memory`, tok.ravi, { state: 'unlocked' })).status).toBe(200);
  });

  it('system administration stays restricted for a Coach', async () => {
    expect((await env.req('GET', '/users', tok.ravi)).status).toBe(403);
    expect((await env.req('GET', '/system/settings', tok.ravi)).status).toBe(403);
    expect((await env.req('GET', '/audit', tok.ravi)).status).toBe(403);
  });

  it('a Player reaches only their own data', async () => {
    expect((await env.req('GET', `/players/${playerB}`, pa)).status).toBe(403);
    expect((await env.req('GET', `/players/${playerB}/performance`, pa)).status).toBe(403);
    expect((await env.req('GET', '/players', pa)).status).toBe(403);
    expect((await env.req('GET', '/me/performance', pa)).status).toBe(200);
  });
});

describe('older records stay valid', () => {
  it('a player with no age or weight is still listed, readable, and can be renamed', async () => {
    const list = await env.req('GET', '/players?q=Legacy', tok.ravi);
    expect(list.body.items.map((p: any) => p.id)).toEqual([legacy]);
    const one = await env.req('GET', `/players/${legacy}`, tok.ravi);
    expect(one.status).toBe(200);
    expect(one.body.age).toBeNull();
    expect(one.body.weight_kg).toBeNull();
    expect((await env.req('PATCH', `/players/${legacy}`, tok.ravi, { display_name: 'Legacy Leigh' })).status).toBe(200);
  });
});

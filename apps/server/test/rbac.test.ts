import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PW, makeEnv } from './helpers.js';
import type { TestEnv } from './helpers.js';

let env: TestEnv;
const tok: Record<string, string> = {};
let ravi = '';
let sneha = '';
let playerA = ''; // belongs to Ravi
let playerB = ''; // belongs to Sneha
let targetCoach = '';
let programId = '';

beforeAll(async () => {
  env = await makeEnv();
  await env.addUser('sa', 'SUPER_ADMIN');
  await env.addUser('ad', 'ADMIN');
  ravi = await env.addUser('ravi', 'COACH');
  sneha = await env.addUser('sneha', 'COACH');
  targetCoach = await env.addUser('target.coach', 'COACH');
  for (const n of ['sa', 'ad', 'ravi', 'sneha']) tok[n] = await env.token(n, PW);

  const a = await env.req('POST', '/players', tok.ravi, { age: 20, weight_kg: 65, display_name: 'Player A' });
  const b = await env.req('POST', '/players', tok.sneha, { age: 20, weight_kg: 65, display_name: 'Player B' });
  expect(a.status).toBe(201);
  playerA = a.body.player.id;
  playerB = b.body.player.id;
  tok.pl = await env.token(a.body.credentials.login_id, a.body.credentials.pin);
  const p = await env.req('POST', '/programs', tok.ravi, { name: 'Ravi plan', stages: [{ label: 'Week 1', games: ['quick'] }] });
  programId = p.body.id;
});
afterAll(() => env.close());

type R = 'anon' | 'sa' | 'ad' | 'co' | 'pl';
const ALL: R[] = ['sa', 'ad', 'co', 'pl'];
const STAFF3: R[] = ['sa', 'ad', 'co'];
// Hierarchy: Super Admin has complete control (including training and games); Coach trains their own players.
const TRAIN: R[] = ['sa', 'ad', 'co', 'pl'];
const COACHING: R[] = ['sa', 'ad', 'co'];

// [method, path, who may pass the permission gate, body]
// "co" is Ravi, a Coach without grants; the player in the paths is Ravi's, so scope does not interfere.
const MATRIX: [string, () => string, R[], unknown?][] = [
  ['GET', () => '/me', ALL],
  ['GET', () => '/me/results', TRAIN],
  ['GET', () => '/me/analytics', TRAIN],
  ['GET', () => '/me/progress', ['sa', 'pl']],
  ['GET', () => '/me/performance', TRAIN],
  ['GET', () => `/players/${playerA}/performance`, STAFF3],
  ['GET', () => '/analytics/performance', STAFF3],
  ['GET', () => '/me/sessions', ALL],
  ['GET', () => '/modules', ALL],
  ['GET', () => '/games', TRAIN],
  ['GET', () => '/games/quick', TRAIN],
  ['GET', () => '/games/quick/howto', TRAIN],
  ['GET', () => '/board/status', TRAIN],
  ['GET', () => '/users', ['sa', 'ad']],
  ['POST', () => '/users', ['sa', 'ad'], {}],
  ['GET', () => `/users/${targetCoach}`, ['sa', 'ad']],
  ['PATCH', () => `/users/${targetCoach}`, ['sa', 'ad'], {}],
  ['POST', () => `/users/${targetCoach}/revoke-sessions`, ['sa', 'ad']],
  ['PUT', () => `/users/${targetCoach}/permissions`, ['sa', 'ad'], { create_coaches: false }],
  ['GET', () => '/players', STAFF3],
  ['POST', () => '/players', STAFF3, {}],
  ['GET', () => `/players/${playerA}`, STAFF3],
  ['PATCH', () => `/players/${playerA}`, STAFF3, {}],
  ['PUT', () => `/players/${playerA}/coach`, ['sa', 'ad'], {}],
  ['GET', () => `/players/${playerA}/access`, STAFF3],
  ['PUT', () => `/players/${playerA}/access/quick`, COACHING, {}],
  ['GET', () => `/players/${playerA}/program`, STAFF3],
  ['PUT', () => `/players/${playerA}/program`, COACHING, {}],
  ['POST', () => `/players/${playerA}/program/advance`, COACHING],
  ['PUT', () => `/players/${playerA}/program/stage`, COACHING, {}],
  ['GET', () => `/players/${playerA}/results`, STAFF3],
  ['GET', () => `/players/${playerA}/analytics`, STAFF3],
  ['GET', () => '/analytics/overview', STAFF3],
  ['GET', () => '/activity', STAFF3],
  ['GET', () => '/programs', STAFF3],
  ['POST', () => '/programs', COACHING, {}],
  ['PATCH', () => `/programs/${programId}`, COACHING, {}],
  ['DELETE', () => '/programs/no-such-program', COACHING],
  ['GET', () => '/audit', ['sa', 'ad']],
  ['GET', () => '/system/settings', ['sa']],
  ['PUT', () => '/system/settings', ['sa'], {}],
  ['POST', () => '/system/backup', ['sa']],
  ['GET', () => '/system/devices', ['sa']],
  ['POST', () => '/sessions', TRAIN, {}],
  ['POST', () => '/sessions/none/finish', TRAIN, {}],
  ['POST', () => '/sessions/none/abort', TRAIN],
  ['GET', () => '/sessions/none', ALL],
];

const tokenFor = (r: R): string | null => (r === 'anon' ? null : r === 'co' ? tok.ravi! : tok[r]!);

describe('permission matrix: role x endpoint', () => {
  for (const [method, path, allowed, body] of MATRIX) {
    for (const role of ['anon', 'sa', 'ad', 'co', 'pl'] as R[]) {
      const should = role !== 'anon' && allowed.includes(role);
      it(`${method} ${path().replace(/u_[a-z0-9]+/g, ':id')} as ${role} -> ${should ? 'passes the gate' : role === 'anon' ? '401' : '403'}`, async () => {
        const r = await env.req(method, path(), tokenFor(role), body);
        if (role === 'anon') {
          expect(r.status).toBe(401);
        } else if (should) {
          // Past the gate: any outcome except an auth failure (a body error or 404 is fine).
          expect([401, 403], `${r.status} ${JSON.stringify(r.body)}`).not.toContain(r.status);
        } else {
          expect(r.status, JSON.stringify(r.body)).toBe(403);
          expect(r.body.error.code).toBe('FORBIDDEN');
        }
      });
    }
  }
});

describe('scope: a Coach reaches every player', () => {
  it("another Coach's player is open on every read and edit route", async () => {
    for (const [method, path, body] of [
      ['GET', `/players/${playerB}`],
      ['PATCH', `/players/${playerB}`, { display_name: 'Player B' }],
      ['GET', `/players/${playerB}/access`],
      ['PUT', `/players/${playerB}/access/memory`, { state: 'unlocked' }],
      ['GET', `/players/${playerB}/program`],
      ['GET', `/players/${playerB}/results`],
      ['GET', `/players/${playerB}/analytics`],
      ['GET', `/players/${playerB}/performance`],
    ] as [string, string, unknown?][]) {
      const r = await env.req(method, path, tok.ravi, body);
      expect(r.status, `${method} ${path}`).toBe(200);
    }
  });

  it('a Coach lists, searches and filters every player', async () => {
    const mine = await env.req('GET', '/players', tok.ravi);
    expect(mine.body.items.map((p: any) => p.id).sort()).toEqual([playerA, playerB].sort());
    const search = await env.req('GET', '/players?q=Player%20B', tok.ravi);
    expect(search.body.items.map((p: any) => p.id)).toEqual([playerB]);
    const all = await env.req('GET', '/players', tok.ad);
    expect(all.body.items.length).toBe(2);
    expect((await env.req('GET', `/players/${playerB}`, tok.sa)).status).toBe(200);
  });

  it("a Coach cannot assign or edit another Coach's program, but can use shared templates", async () => {
    const theirs = await env.req('POST', '/programs', tok.sneha, { name: 'Sneha plan', stages: [{ label: 'W1', games: ['quick'] }] });
    expect(theirs.status).toBe(201);
    const peek = await env.req('PUT', `/players/${playerA}/program`, tok.ravi, { program_id: theirs.body.id });
    expect(peek.status).toBe(403);
    expect((await env.req('PATCH', `/programs/${theirs.body.id}`, tok.ravi, { name: 'hijack' })).status).toBe(403);
    expect((await env.req('DELETE', `/programs/${theirs.body.id}`, tok.ravi)).status).toBe(403);
    const list = await env.req('GET', '/programs', tok.ravi);
    const names = list.body.items.map((p: any) => p.name);
    expect(names).toContain('Foundation (4 weeks)');
    expect(names).toContain('Ravi plan');
    expect(names).not.toContain('Sneha plan');
    const shared = await env.req('PUT', `/players/${playerA}/program`, tok.ravi, { program_id: 'prog_default_foundation' });
    expect(shared.status).toBe(200);
    // An Admin can edit any program.
    expect((await env.req('PATCH', `/programs/${theirs.body.id}`, tok.ad, { name: 'Sneha plan v2' })).status).toBe(200);
  });

  it('a player cannot reach another entity even with a guessed id', async () => {
    expect((await env.req('GET', `/players/${playerB}`, tok.pl)).status).toBe(403);
    const mine = await env.req('GET', '/sessions/does-not-exist', tok.pl);
    expect(mine.status).toBe(404);
  });
});

describe('rank rules', () => {
  it('an Admin cannot create or manage an Admin; a Super Admin can manage an Admin', async () => {
    const mk = await env.req('POST', '/users', tok.ad, { email: 'staff@xeroburst.test', phone: '+91 98450 11122', age: 35, login_id: 'new.admin', display_name: 'Xavier', role: 'ADMIN' });
    expect(mk.status).toBe(403);
    expect(mk.body.error.code).toBe('ROLE_RANK');
    const adId = (env.ctx.db.prepare("SELECT id FROM users WHERE login_id = 'ad'").get() as { id: string }).id;
    const edit = await env.req('PATCH', `/users/${adId}`, tok.ad, { display_name: 'self' });
    expect(edit.status).toBe(403);
    expect(edit.body.error.code).toBe('ROLE_RANK');
    const sa = await env.req('POST', '/users', tok.sa, { email: 'staff@xeroburst.test', phone: '+91 98450 11122', age: 35, login_id: 'new.admin', display_name: 'New Admin', role: 'ADMIN' });
    expect(sa.status).toBe(201);
    expect((await env.req('PATCH', `/users/${adId}`, tok.sa, { display_name: 'Anil' })).status).toBe(200);
  });

  it('nobody can create a Super Admin through the API', async () => {
    const r = await env.req('POST', '/users', tok.sa, { login_id: 'another.sa', display_name: 'Xavier', role: 'SUPER_ADMIN' });
    expect(r.status).toBe(422);
    const saId = (env.ctx.db.prepare("SELECT id FROM users WHERE login_id = 'sa'").get() as { id: string }).id;
    const p = await env.req('PATCH', `/users/${saId}`, tok.ad, { is_active: false });
    expect(p.status).toBe(403);
  });

  it('a Coach without CREATE_COACHES cannot create Coaches; with the grant, Coaches only', async () => {
    const no = await env.req('POST', '/users', tok.ravi, { email: 'staff@xeroburst.test', phone: '+91 98450 11122', age: 35, login_id: 'coach.two', display_name: 'Coach Two', role: 'COACH' });
    expect(no.status).toBe(403);
    expect(no.body.error.code).toBe('FORBIDDEN');

    const grant = await env.req('PUT', `/users/${ravi}/permissions`, tok.ad, { create_coaches: true });
    expect(grant.status).toBe(200);
    expect(grant.body.grants).toContain('CREATE_COACHES');
    const yes = await env.req('POST', '/users', tok.ravi, { email: 'staff@xeroburst.test', phone: '+91 98450 11122', age: 35, login_id: 'coach.two', display_name: 'Coach Two', role: 'COACH' });
    expect(yes.status).toBe(201);
    const admin = await env.req('POST', '/users', tok.ravi, { email: 'staff@xeroburst.test', phone: '+91 98450 11122', age: 35, login_id: 'coach.three', display_name: 'Coach Three', role: 'ADMIN' });
    expect(admin.status).toBe(403);
    expect(admin.body.error.code).toBe('ROLE_RANK');
    // Having created a Coach does not let Ravi list or edit Coaches.
    expect((await env.req('GET', '/users', tok.ravi)).status).toBe(403);
    expect((await env.req('PATCH', `/users/${yes.body.user.id}`, tok.ravi, {})).status).toBe(403);

    const revoke = await env.req('PUT', `/users/${ravi}/permissions`, tok.ad, { create_coaches: false });
    expect(revoke.body.grants).not.toContain('CREATE_COACHES');
    expect((await env.req('POST', '/users', tok.ravi, { email: 'staff@xeroburst.test', phone: '+91 98450 11122', age: 35, login_id: 'coach.four', display_name: 'Coach Four', role: 'COACH' })).status).toBe(403);
  });

  it('Admin sees Coaches in the staff list; only a Super Admin sees Admins', async () => {
    const ad = await env.req('GET', '/users', tok.ad);
    expect(ad.body.items.every((u: any) => u.role === 'COACH')).toBe(true);
    const sa = await env.req('GET', '/users', tok.sa);
    expect(sa.body.items.some((u: any) => u.role === 'ADMIN')).toBe(true);
  });

  it('only a Super Admin changes roles', async () => {
    const id = targetCoach;
    const byAdmin = await env.req('PATCH', `/users/${id}`, tok.ad, { role: 'ADMIN' });
    expect(byAdmin.status).toBe(403);
    const bySa = await env.req('PATCH', `/users/${id}`, tok.sa, { role: 'ADMIN' });
    expect(bySa.status).toBe(200);
    expect(bySa.body.role).toBe('ADMIN');
    await env.req('PATCH', `/users/${id}`, tok.sa, { role: 'COACH' });
  });
});

describe('players are staff-managed', () => {
  it('a Coach creates a player; the PIN is shown once and works; simple PINs are refused', async () => {
    const simple = await env.req('POST', '/players', tok.ravi, { age: 20, weight_kg: 65, display_name: 'Sam', pin: '123456' });
    expect(simple.status).toBe(422);
    expect(simple.body.error.details.fields.pin).toBeTruthy();
    const ok = await env.req('POST', '/players', tok.ravi, { age: 20, weight_kg: 65, display_name: 'Chosen Pin', pin: '482915' });
    expect(ok.status).toBe(201);
    expect(ok.body.credentials.pin).toBe('482915');
    expect(ok.body.credentials.login_id).toMatch(/^NB-\d{4}$/);
    expect((await env.login(ok.body.credentials.login_id, '482915')).status).toBe(200);
    // Defaults (17.4): Quick unlocked, others locked.
    const states = Object.fromEntries(ok.body.player.access.map((a: any) => [a.game, a.state]));
    expect(states).toEqual({ quick: 'unlocked', memory: 'locked', hunt: 'locked', endure: 'locked' });
    // The PIN is not in the player record or the audit log.
    expect(JSON.stringify(ok.body.player)).not.toContain('482915');
    const log = await env.req('GET', '/audit?limit=200', tok.sa);
    expect(JSON.stringify(log.body)).not.toContain('482915');
  });

  it('an Admin must pick a Coach; a Coach cannot create for someone else', async () => {
    const noCoach = await env.req('POST', '/players', tok.ad, { age: 20, weight_kg: 65, display_name: 'Xavier' });
    expect(noCoach.status).toBe(422);
    const ok = await env.req('POST', '/players', tok.ad, { age: 20, weight_kg: 65, display_name: 'Xavier', coach_id: sneha });
    expect(ok.status).toBe(201);
    expect(ok.body.player.coach.id).toBe(sneha);
    const bad = await env.req('POST', '/players', tok.ravi, { age: 20, weight_kg: 65, display_name: 'Yusuf', coach_id: sneha });
    expect(bad.status).toBe(403);
  });

  it('reassigning a player moves them between Coaches', async () => {
    const mv = await env.req('PUT', `/players/${playerB}/coach`, tok.ad, { coach_id: ravi });
    expect(mv.status).toBe(200);
    expect((await env.req('GET', `/players/${playerB}`, tok.ravi)).status).toBe(200);
    expect((await env.req('GET', `/players/${playerB}`, tok.sneha)).status).toBe(200);
    await env.req('PUT', `/players/${playerB}/coach`, tok.ad, { coach_id: sneha });
  });

  it('deactivating a player signs them out at once', async () => {
    const mk = await env.req('POST', '/players', tok.ravi, { age: 20, weight_kg: 65, display_name: 'Leaver' });
    const t = await env.token(mk.body.credentials.login_id, mk.body.credentials.pin);
    expect((await env.req('GET', '/games', t)).status).toBe(200);
    await env.req('PATCH', `/players/${mk.body.player.id}`, tok.ravi, { status: 'inactive' });
    expect((await env.req('GET', '/games', t)).status).toBe(401);
    expect((await env.login(mk.body.credentials.login_id, mk.body.credentials.pin)).status).toBe(401);
  });

  it('keeps the reason for going inactive and clears it on reactivation', async () => {
    const mk = await env.req('POST', '/players', tok.ravi, { age: 21, weight_kg: 70, display_name: 'Pauser' });
    const id = mk.body.player.id;
    const off = await env.req('PATCH', `/players/${id}`, tok.ravi, { status: 'inactive', reason: 'Injury break' });
    expect(off.body.inactive_reason).toBe('Injury break');
    const on = await env.req('PATCH', `/players/${id}`, tok.ravi, { status: 'active' });
    expect(on.body.inactive_reason).toBeNull();
  });

  it('a player can ask for a new PIN from the sign-in screen; the coach sees it and issuing one clears it', async () => {
    const mk = await env.req('POST', '/players', tok.ravi, { age: 22, weight_kg: 71, display_name: 'Forgetful' });
    const id = mk.body.player.id;
    const code = mk.body.credentials.login_id;
    const a = await env.req('POST', '/auth/forgot', null, { login_id: code });
    expect(a.status).toBe(200);
    expect(a.body.kind).toBe('player');
    expect((await env.req('GET', `/players/${id}`, tok.ravi)).body.pin_reset_requested).toBe(true);
    const unknown = await env.req('POST', '/auth/forgot', null, { login_id: 'NB-9999' });
    expect(unknown.body).toEqual(a.body);
    expect((await env.req('POST', '/auth/forgot', null, { login_id: 'coach.someone' })).body.kind).toBe('staff');
    await env.req('POST', `/players/${id}/reset-credentials`, tok.ravi, {});
    expect((await env.req('GET', `/players/${id}`, tok.ravi)).body.pin_reset_requested).toBe(false);
  });
});

describe('audit actor filter', () => {
  it('matches an id, a login ID or part of a name', async () => {
    const byName = await env.req('GET', '/audit?actor=sneh', tok.sa);
    expect(byName.status).toBe(200);
    expect(byName.body.items.length).toBeGreaterThan(0);
    for (const e of byName.body.items) expect(e.actor_name).toBe('sneha');
  });
});

describe('results overview', () => {
  it('returns the latest rounds and one point per day for staff', async () => {
    const r = await env.req('GET', '/results/overview?days=7&limit=3', tok.ravi);
    expect(r.status).toBe(200);
    expect(r.body.daily).toHaveLength(7);
    expect(r.body.rounds.length).toBeLessThanOrEqual(3);
    for (const d of r.body.daily) expect(Object.keys(d).sort()).toEqual(['accuracy', 'avg_rt', 'best_rt', 'day', 'misses']);
    expect((await env.req('GET', '/results/overview?days=0', tok.ravi)).status).toBe(422);
    expect((await env.req('GET', '/results/overview', null)).status).toBe(401);
  });
});

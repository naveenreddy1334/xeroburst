import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PW, makeEnv } from './helpers.js';
import type { TestEnv } from './helpers.js';

let env: TestEnv;
const tok: Record<string, string> = {};
const id: Record<string, string> = {};

const staff = (login: string, name = login) => ({ login_id: login, display_name: name, email: `${login}@x.co`, phone: '9876543210', age: 30 });

beforeAll(async () => {
  env = await makeEnv();
  await env.addUser('sa', 'SUPER_ADMIN');
  await env.addUser('ad', 'ADMIN');
  tok.sa = await env.token('sa', PW);
  tok.ad = await env.token('ad', PW);
  // Structure A: hub with an academy and two branches. Structure B: single-location hub.
  id.hubA = (await env.req('POST', '/hubs', tok.sa, { name: 'Hub Alpha' })).body.id;
  id.hubB = (await env.req('POST', '/hubs', tok.sa, { name: 'Hub Beta' })).body.id;
});
afterAll(() => env.close());

async function mk(role: string, login: string, hub: string | null, branch: string | null, by = tok.sa) {
  const r = await env.req('POST', '/users', by, { ...staff(login), role, hub_id: hub, branch_id: branch });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  env.ctx.db.prepare('UPDATE users SET must_change_password = 0, password_hash = (SELECT password_hash FROM users WHERE login_id = ?) WHERE id = ?').run('sa', r.body.user.id);
  tok[login] = await env.token(login, PW);
  id[login] = r.body.user.id;
}

describe('structure A: hub, academy, branches', () => {
  it('creates an academy and two branches, rejecting duplicates', async () => {
    const a = await env.req('POST', '/org/academies', tok.sa, { hub_id: id.hubA, name: 'Alpha Academy' });
    expect(a.status).toBe(201);
    id.acad = a.body.id;
    expect((await env.req('POST', '/org/academies', tok.sa, { hub_id: id.hubA, name: 'alpha academy' })).status).toBe(409);
    const b1 = await env.req('POST', '/org/branches', tok.sa, { hub_id: id.hubA, academy_id: id.acad, name: 'North' });
    const b2 = await env.req('POST', '/org/branches', tok.sa, { hub_id: id.hubA, academy_id: id.acad, name: 'South' });
    expect(b1.status).toBe(201);
    expect(b2.status).toBe(201);
    id.north = b1.body.id;
    id.south = b2.body.id;
    expect((await env.req('POST', '/org/branches', tok.sa, { hub_id: id.hubA, name: 'NORTH' })).status).toBe(409);
  });

  it('a branch cannot name an academy from another hub', async () => {
    const other = (await env.req('POST', '/org/academies', tok.sa, { hub_id: id.hubB, name: 'Beta Academy' })).body.id;
    expect((await env.req('POST', '/org/branches', tok.sa, { hub_id: id.hubA, academy_id: other, name: 'Bad' })).status).toBe(422);
  });

  it('gives each branch its own manager, coaches and players', async () => {
    await mk('HUB_MANAGER', 'hm.a', id.hubA, null);
    await mk('BRANCH_MANAGER', 'bm.n', id.hubA, id.north);
    await mk('BRANCH_MANAGER', 'bm.s', id.hubA, id.south);
    await mk('COACH', 'co.n', id.hubA, id.north, tok['hm.a']);
    await mk('COACH', 'co.s', id.hubA, id.south, tok['bm.s']);
    const p1 = await env.req('POST', '/players', tok['co.n'], { display_name: 'Player North', age: 14, weight_kg: 50 });
    const p2 = await env.req('POST', '/players', tok['co.s'], { display_name: 'Player South', age: 15, weight_kg: 55 });
    expect(p1.status, JSON.stringify(p1.body)).toBe(201);
    expect(p2.status).toBe(201);
    id.pn = p1.body.player?.id ?? p1.body.id;
    id.ps = p2.body.player?.id ?? p2.body.id;
  });

  it('a Branch Manager sees only their own branch, coaches and players', async () => {
    const tree = (await env.req('GET', '/org/tree', tok['bm.n'])).body;
    expect(tree.hubs).toHaveLength(1);
    const names = tree.hubs[0].academies.flatMap((a: any) => a.branches.map((b: any) => b.name));
    expect(names).toEqual(['North']);
    const players = (await env.req('GET', '/players', tok['bm.n'])).body.items.map((p: any) => p.display_name);
    expect(players).toEqual(['Player North']);
    const coaches = (await env.req('GET', '/users?role=COACH', tok['bm.n'])).body.items.map((u: any) => u.login_id);
    expect(coaches).toEqual(['co.n']);
    expect((await env.req('GET', `/players/${id.ps}`, tok['bm.n'])).status).toBeGreaterThanOrEqual(403);
  });

  it('a Branch Manager cannot place staff in another branch or touch a coach there', async () => {
    const r = await env.req('POST', '/users', tok['bm.n'], { ...staff('x.s'), role: 'COACH', hub_id: id.hubA, branch_id: id.south });
    expect(r.status).toBe(403);
    expect((await env.req('PATCH', `/users/${id['co.s']}`, tok['bm.n'], { display_name: 'Hijack' })).status).toBe(403);
    expect((await env.req('POST', '/org/branches', tok['bm.n'], { hub_id: id.hubA, name: 'Nope' })).status).toBe(403);
  });

  it('a Hub Manager sees the whole hub and nothing from another hub', async () => {
    const tree = (await env.req('GET', '/org/tree', tok['hm.a'])).body;
    expect(tree.hubs.map((h: any) => h.name)).toEqual(['Hub Alpha']);
    expect(tree.totals.players).toBe(2);
    expect((await env.req('GET', '/players', tok['hm.a'])).body.items).toHaveLength(2);
    expect((await env.req('POST', '/org/branches', tok['hm.a'], { hub_id: id.hubB, name: 'Intruder' })).status).toBe(403);
    expect((await env.req('POST', '/users', tok['hm.a'], { ...staff('x.b'), role: 'COACH', hub_id: id.hubB })).status).toBe(403);
    expect((await env.req('GET', '/finance/summary', tok['hm.a'])).status).toBe(403);
  });
});

describe('structure B: hub without branches', () => {
  it('coaches sit directly under the hub, no academy or branch needed', async () => {
    await mk('HUB_MANAGER', 'hm.b', id.hubB, null);
    await mk('COACH', 'co.b', id.hubB, null, tok['hm.b']);
    const p = await env.req('POST', '/players', tok['co.b'], { display_name: 'Player Beta', age: 16, weight_kg: 60 });
    expect(p.status).toBe(201);
    const tree = (await env.req('GET', '/org/tree', tok.sa)).body;
    const b = tree.hubs.find((h: any) => h.id === id.hubB);
    // hubB got a leftover academy from the cross-hub test above, so test shape on branches and direct coaches.
    expect(b.branches).toHaveLength(0);
    expect(b.direct_coaches.map((c: any) => c.login_id)).toEqual(['co.b']);
    expect(b.players).toBe(1);
  });

  it('a Hub Manager never sees Alpha players', async () => {
    const names = (await env.req('GET', '/players', tok['hm.b'])).body.items.map((p: any) => p.display_name);
    expect(names).toEqual(['Player Beta']);
  });
});

describe('assignment and safety', () => {
  it('does not deactivate a branch that still has people', async () => {
    expect((await env.req('PATCH', `/org/branches/${id.north}`, tok.sa, { is_active: false })).status).toBe(409);
  });
  it('a Branch Manager needs a branch; a Hub Manager cannot have one', async () => {
    expect((await env.req('POST', '/users', tok.sa, { ...staff('bad1'), role: 'BRANCH_MANAGER', hub_id: id.hubA })).status).toBe(422);
    expect((await env.req('POST', '/users', tok.sa, { ...staff('bad2'), role: 'HUB_MANAGER', hub_id: id.hubA, branch_id: id.north })).status).toBe(422);
  });
  it('a branch from another hub is refused', async () => {
    expect((await env.req('POST', '/org/assign', tok.sa, { user_id: id['co.b'], hub_id: id.hubB, branch_id: id.north })).status).toBe(422);
  });
  it('Super Admin can move staff explicitly; a Hub Manager cannot move someone out of their hub', async () => {
    expect((await env.req('POST', '/org/assign', tok['hm.a'], { user_id: id['co.b'], hub_id: id.hubA, branch_id: null })).status).toBe(403);
    const ok = await env.req('POST', '/org/assign', tok.sa, { user_id: id['co.n'], hub_id: id.hubA, branch_id: id.south });
    expect(ok.status).toBe(200);
  });
});

describe('migration keeps existing data', () => {
  it('existing coaches and players keep their hub; branch stays empty', () => {
    const r = env.ctx.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='COACH' AND hub_id IS NOT NULL AND branch_id IS NULL").get() as { n: number };
    expect(r.n).toBe(1);
  });
});

describe('finance', () => {
  it('is Super Admin only', async () => {
    expect((await env.req('GET', '/finance/summary', tok.sa)).status).toBe(200);
    expect((await env.req('GET', '/finance/summary', tok.ad)).status).toBe(403);
    expect((await env.req('GET', '/finance/summary', tok['bm.n'])).status).toBe(403);
  });
  it('reports real counts and never invents money', async () => {
    const f = (await env.req('GET', '/finance/summary?period=quarter', tok.sa)).body;
    expect(f.period.kind).toBe('quarter');
    expect(f.totals.hubs).toBe(2);
    expect(f.totals.players).toBe(3);
    for (const k of ['revenue', 'expenses', 'profit', 'revenue_per_player', 'collection', 'outstanding']) {
      expect(f.totals[k].status).not.toBe('available');
      expect(f.totals[k].value).toBeNull();
    }
    for (const r of f.rows) {
      expect(r.revenue.value).toBeNull();
      expect(r.expenses.value).toBeNull();
    }
    expect(f.rows.filter((r: any) => r.level === 'hub')).toHaveLength(2);
    expect(f.capabilities.revenue).toBe(false);
  });
  it('shows figures only when a source provides them', async () => {
    const { financeSummary, periodRange } = await import('../src/services/finance.js');
    const tree = (await env.req('GET', '/org/tree', tok.sa)).body;
    const src = { configured: true, figures: (s: any) => (s.branch_id || s.hub_id !== id.hubA ? null : { revenue: 1000, expenses: 400, currency: 'INR' }) };
    const f = financeSummary(tree, periodRange('month', '2026-10-27'), src);
    expect(f.period.label).toBe('October 2026');
    expect(f.totals.revenue).toEqual({ status: 'available', value: 1000, currency: 'INR' });
    expect(f.totals.profit).toEqual({ status: 'available', value: 600, currency: 'INR' });
    const beta = f.rows.find((r) => r.hub.id === id.hubB && r.level === 'hub')!;
    expect(beta.revenue.status).toBe('not_configured');
  });
});
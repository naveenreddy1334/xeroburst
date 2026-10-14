import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PW, makeEnv } from './helpers.js';
import type { TestEnv } from './helpers.js';

let env: TestEnv;
const tok: Record<string, string> = {};
let hubA = '';
let hubB = '';
let playerA = '';
let playerB = '';

beforeAll(async () => {
  env = await makeEnv();
  await env.addUser('sa', 'SUPER_ADMIN');
  await env.addUser('ad', 'ADMIN');
  await env.addUser('c.one', 'COACH');
  await env.addUser('c.two', 'COACH');
  for (const n of ['sa', 'ad', 'c.one', 'c.two']) tok[n] = await env.token(n, PW);
});
afterAll(() => env.close());

describe('hubs', () => {
  it('Super Admin and Admin create hubs; a Coach cannot', async () => {
    const a = await env.req('POST', '/hubs', tok.sa, { name: 'Kredo Center – Bellandur', city: 'Bengaluru' });
    expect(a.status).toBe(201);
    hubA = a.body.id;
    const b = await env.req('POST', '/hubs', tok.ad, { name: 'CC Cricket Academy – Sarjapur' });
    expect(b.status).toBe(201);
    hubB = b.body.id;
    expect((await env.req('POST', '/hubs', tok['c.one'], { name: 'Nope hub' })).status).toBe(403);
    expect((await env.req('POST', '/hubs', tok.sa, { name: 'kredo center – bellandur' })).status).toBe(409);
  });

  it('puts coaches and their players in hubs, and a coach sees only their own hub', async () => {
    const list = await env.req('GET', '/users?role=COACH', tok.sa);
    const one = list.body.items.find((u: any) => u.login_id === 'c.one').id;
    const two = list.body.items.find((u: any) => u.login_id === 'c.two').id;
    expect((await env.req('PATCH', `/users/${one}`, tok.sa, { hub_id: hubA })).body.hub.id).toBe(hubA);
    await env.req('PATCH', `/users/${two}`, tok.sa, { hub_id: hubB });
    tok['c.one'] = await env.token('c.one', PW);
    tok['c.two'] = await env.token('c.two', PW);

    const a = await env.req('POST', '/players', tok['c.one'], { age: 20, weight_kg: 65, display_name: 'Hub A Player' });
    const b = await env.req('POST', '/players', tok['c.two'], { age: 21, weight_kg: 70, display_name: 'Hub B Player' });
    expect(a.body.player.hub.id).toBe(hubA);
    expect(b.body.player.hub.id).toBe(hubB);
    playerA = a.body.player.id;
    playerB = b.body.player.id;

    const mine = await env.req('GET', '/players', tok['c.one']);
    expect(mine.body.items.map((p: any) => p.id)).toEqual([playerA]);
    expect((await env.req('GET', `/players/${playerB}`, tok['c.one'])).status).toBe(403);
    const all = await env.req('GET', '/players', tok.ad);
    expect(all.body.items).toHaveLength(2);
    const hubs = await env.req('GET', '/hubs', tok['c.one']);
    expect(hubs.body.items).toHaveLength(1);
  });

  it('new players must change their PIN at first sign-in', async () => {
    const mk = await env.req('POST', '/players', tok['c.one'], { age: 19, weight_kg: 60, display_name: 'Fresh' });
    const l = await env.login(mk.body.credentials.login_id, mk.body.credentials.pin);
    expect(l.body.must_change_password).toBe(true);
    const ch = await env.req('POST', '/me/password', l.body.access_token, { current_secret: mk.body.credentials.pin, new_secret: '482915' });
    expect(ch.status).toBe(200);
    expect(ch.body.must_change_password).toBe(false);
  });

  it('records attendance on sign-in and reports it per hub, and compares hubs', async () => {
    const s = await env.req('GET', `/hubs/${hubA}/summary?days=7`, tok.sa);
    expect(s.status).toBe(200);
    expect(s.body.coaches.length).toBe(1);
    expect(s.body.coaches[0].days_present).toBe(1);
    expect(s.body.sources.auto).toBeGreaterThan(0);
    expect(s.body.players_active).toBeGreaterThan(0);
    const cmp = await env.req('GET', '/hubs/compare?days=7', tok.sa);
    expect(cmp.body.items).toHaveLength(2);
    expect((await env.req('GET', `/hubs/${hubA}/summary`, tok['c.one'])).status).toBe(403);
  });

  it('assigns people with no hub in one step', async () => {
    await env.addUser('legacy', 'COACH');
    const r = await env.req('POST', `/hubs/${hubB}/assign-unassigned`, tok.sa);
    expect(r.body.assigned).toBeGreaterThanOrEqual(1);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PW, makeEnv } from './helpers.js';
import type { TestEnv } from './helpers.js';

let env: TestEnv;
beforeAll(async () => {
  env = await makeEnv();
  await env.addUser('sa', 'SUPER_ADMIN');
  await env.addUser('coach1', 'COACH');
});
afterAll(() => env.close());

describe('login', () => {
  it('signs in and returns tokens, user and permissions', async () => {
    const r = await env.login('sa', PW);
    expect(r.status).toBe(200);
    expect(r.body.access_token).toBeTruthy();
    expect(r.body.refresh_token).toBeTruthy();
    expect(r.body.user.role).toBe('SUPER_ADMIN');
    expect(r.body.permissions).toContain('MANAGE_SYSTEM');
  });

  it('login ID is case-insensitive', async () => {
    expect((await env.login('SA', PW)).status).toBe(200);
  });

  it('gives the same generic error for an unknown ID and a wrong secret', async () => {
    const a = await env.login('nobody', 'whatever-123');
    const b = await env.login('sa', 'wrong-secret-1');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(a.body.error).toEqual(b.body.error);
  });

  it('rejects a protected route without a token', async () => {
    const r = await env.req('GET', '/me');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('returns the documented error shape for bad bodies', async () => {
    const r = await env.req('POST', '/auth/login', null, { login_id: '' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION');
    expect(r.body.error.details.fields.login_id).toBeTruthy();
  });
});

describe('lockout', () => {
  it('locks after 5 failures, even for the right secret, and reports the wait', async () => {
    await env.addUser('lockme', 'COACH');
    for (let i = 0; i < 4; i++) {
      expect((await env.login('lockme', 'bad-guess-1')).body.error.code).toBe('INVALID_CREDENTIALS');
    }
    const fifth = await env.login('lockme', 'bad-guess-1');
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(fifth.body.error.details.retry_after).toBeGreaterThan(200);
    const right = await env.login('lockme', PW);
    expect(right.status).toBe(423);
  });

  it('doubles the wait on a repeated lockout, capped at one hour', async () => {
    const { lockDurationMs } = await import('../src/auth/lockout.js');
    expect(lockDurationMs(0)).toBe(5 * 60_000);
    expect(lockDurationMs(1)).toBe(10 * 60_000);
    expect(lockDurationMs(2)).toBe(20 * 60_000);
    expect(lockDurationMs(9)).toBe(60 * 60_000);
  });

  it('a successful login clears the counters', async () => {
    await env.addUser('fumble', 'COACH');
    for (let i = 0; i < 3; i++) await env.login('fumble', 'bad-guess-1');
    expect((await env.login('fumble', PW)).status).toBe(200);
    for (let i = 0; i < 4; i++) await env.login('fumble', 'bad-guess-1');
    expect((await env.login('fumble', PW)).status).toBe(200);
  });
});

describe('refresh tokens', () => {
  it('rotates on every use', async () => {
    const l = await env.login('coach1', PW);
    const r1 = await env.req('POST', '/auth/refresh', null, { refresh_token: l.body.refresh_token });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(l.body.refresh_token);
    const me = await env.req('GET', '/me', r1.body.access_token);
    expect(me.status).toBe(200);
  });

  it('reuse of an old token revokes the whole chain', async () => {
    const l = await env.login('coach1', PW);
    const r1 = await env.req('POST', '/auth/refresh', null, { refresh_token: l.body.refresh_token });
    const replay = await env.req('POST', '/auth/refresh', null, { refresh_token: l.body.refresh_token });
    expect(replay.status).toBe(401);
    // The legitimate newest token is now dead too, and so is the access token.
    const next = await env.req('POST', '/auth/refresh', null, { refresh_token: r1.body.refresh_token });
    expect(next.status).toBe(401);
    expect((await env.req('GET', '/me', r1.body.access_token)).status).toBe(401);
  });

  it('logout revokes the device; logout all revokes every device', async () => {
    const a = await env.login('coach1', PW);
    const b = await env.login('coach1', PW);
    await env.req('POST', '/auth/logout', a.body.access_token);
    expect((await env.req('GET', '/me', a.body.access_token)).status).toBe(401);
    expect((await env.req('GET', '/me', b.body.access_token)).status).toBe(200);
    await env.req('POST', '/auth/logout?all=1', b.body.access_token);
    expect((await env.req('GET', '/me', b.body.access_token)).status).toBe(401);
  });
});

describe('per-request checks', () => {
  it('deactivation and credential reset take effect immediately', async () => {
    const sa = await env.token('sa', PW);
    const coach = await env.req('POST', '/users', sa, { email: 'staff@xeroburst.test', phone: '+91 98450 11122', age: 35, login_id: 'temp.coach', display_name: 'Temp Coach', role: 'COACH' });
    expect(coach.status).toBe(201);
    const temp = coach.body.temp_password as string;
    expect(temp.length).toBeGreaterThanOrEqual(10);
    const l = await env.login('temp.coach', temp);
    expect(l.body.must_change_password).toBe(true);

    // Nothing but /me, /me/password and logout is reachable until the password is changed.
    const blocked = await env.req('GET', '/players', l.body.access_token);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await env.req('GET', '/me', l.body.access_token)).status).toBe(200);

    const weak = await env.req('POST', '/me/password', l.body.access_token, { current_secret: temp, new_secret: 'short1' });
    expect(weak.status).toBe(422);
    const ok = await env.req('POST', '/me/password', l.body.access_token, { current_secret: temp, new_secret: 'A-better-pass-77' });
    expect(ok.status).toBe(200);
    expect(ok.body.must_change_password).toBe(false);
    expect((await env.req('GET', '/players', ok.body.access_token)).status).toBe(200);
    // The old temporary secret no longer works.
    expect((await env.login('temp.coach', temp)).status).toBe(401);

    // Deactivate: the live token stops at once.
    const id = coach.body.user.id as string;
    await env.req('PATCH', `/users/${id}`, sa, { is_active: false });
    expect((await env.req('GET', '/me', ok.body.access_token)).status).toBe(401);
    expect((await env.login('temp.coach', 'A-better-pass-77')).status).toBe(401);
  });

  it('a reset invalidates tokens issued before it', async () => {
    const sa = await env.token('sa', PW);
    const id = await env.addUser('victim', 'COACH');
    const old = await env.token('victim', PW);
    const r = await env.req('POST', `/users/${id}/reset-credentials`, sa);
    expect(r.status).toBe(200);
    expect(r.body.temp_password).toBeTruthy();
    expect((await env.req('GET', '/me', old)).status).toBe(401);
  });
});

describe('audit log', () => {
  it('records sign-ins without secrets and refuses edits and deletes', async () => {
    const sa = await env.token('sa', PW);
    const log = await env.req('GET', '/audit?limit=200', sa);
    expect(log.status).toBe(200);
    const actions = log.body.items.map((i: any) => i.action);
    expect(actions).toContain('LOGIN');
    expect(actions).toContain('LOGIN_FAILED');
    expect(JSON.stringify(log.body)).not.toContain(PW);
    expect(() => env.ctx.db.prepare("UPDATE audit_log SET action = 'x'").run()).toThrow(/append-only/);
    expect(() => env.ctx.db.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/);
  });
});

describe('player ID shortcuts', () => {
  it('accepts a bare number, NB7 and the full ID', async () => {
    const mk = await env.req('POST', '/players', await env.token('coach1', PW), { age: 20, weight_kg: 65, display_name: 'Short Id', pin: '482915' });
    expect(mk.status).toBe(201);
    const code = mk.body.credentials.login_id as string; // nb-000N
    const n = String(Number(code.slice(3)));
    for (const id of [code, code.toUpperCase(), n, `NB${n}`]) {
      const r = await env.login(id, '482915');
      expect(r.status, id).toBe(200);
    }
    expect((await env.login(n, '111111')).status).toBe(401);
  });
});

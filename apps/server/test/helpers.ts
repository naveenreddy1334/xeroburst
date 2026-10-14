import { buildApp } from '../src/app.js';
import { hashSecret } from '../src/auth/password.js';
import { newId } from '../src/db/seed.js';
import type { Ctx } from '../src/ctx.js';
import type { FastifyInstance } from 'fastify';
import type { Role } from '@nboard/shared';

export interface TestEnv {
  app: FastifyInstance;
  ctx: Ctx;
  /** Make a request; pass a token to be signed in */
  req(method: string, url: string, token?: string | null, body?: unknown): Promise<{ status: number; body: any }>;
  addUser(login: string, role: Role, password?: string): Promise<string>;
  login(loginId: string, secret: string): Promise<{ status: number; body: any }>;
  token(loginId: string, secret: string): Promise<string>;
  close(): Promise<void>;
}

export const PW = 'Passw0rd-test1';

export async function makeEnv(over: Record<string, unknown> = {}): Promise<TestEnv> {
  const { app, ctx } = await buildApp({ dbFile: ':memory:', test: true, noBoard: true, ...over });
  await app.ready();
  const env: TestEnv = {
    app,
    ctx,
    async req(method, url, token, body) {
      const res = await app.inject({
        method: method as 'GET',
        url: `/api/v1${url}`,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        ...(body !== undefined ? { payload: body as object } : {}),
      });
      let parsed: any = null;
      try {
        parsed = res.body ? JSON.parse(res.body) : null;
      } catch {
        parsed = res.body;
      }
      return { status: res.statusCode, body: parsed };
    },
    async addUser(login, role, password = PW) {
      const id = `u_${newId()}`;
      ctx.db
        .prepare(
          `INSERT INTO users (id, login_id, display_name, role, password_hash, must_change_password, is_active, created_at)
           VALUES (?,?,?,?,?,0,1,?)`,
        )
        .run(id, login, login, role, await hashSecret(password, 1024), new Date().toISOString());
      return id;
    },
    login(loginId, secret) {
      return env.req('POST', '/auth/login', null, { login_id: loginId, secret });
    },
    async token(loginId, secret) {
      const r = await env.login(loginId, secret);
      if (r.status !== 200) throw new Error(`login failed for ${loginId}: ${JSON.stringify(r.body)}`);
      // New players must change their PIN at first sign-in; most tests just want to be signed in as one.
      if (r.body.must_change_password && /^nb-/i.test(loginId)) {
        env.ctx.db.prepare('UPDATE users SET must_change_password = 0 WHERE login_id = ?').run(loginId.toLowerCase());
        return (await env.login(loginId, secret)).body.access_token as string;
      }
      return r.body.access_token as string;
    },
    close: () => app.close(),
  };
  return env;
}

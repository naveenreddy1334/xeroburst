import type { FastifyInstance } from 'fastify';
import { markPresent } from '../services/hubs.js';
import { z } from 'zod';
import {
  changePasswordBody,
  loginBody,
  permissionsFor,
  refreshBody,
  validateSecretFor,
} from '@nboard/shared';
import type { AuthResponse, AuthTokens, DeviceSessionDTO, MeResponse, Permission, Role } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError } from '../errors.js';
import { auditReq, writeAudit } from '../audit.js';
import { dummyVerify, hashSecret, verifySecret } from '../auth/password.js';
import { hashToken, newRefreshToken } from '../auth/tokens.js';
import { clearLock, recordFailure, recordSuccess, secondsLeft } from '../auth/lockout.js';
import { loadGrants } from '../rbac/guard.js';
import type { Guards } from '../rbac/guard.js';
import { USER_COLS, userDTO } from '../services/users.js';
import type { UserRow } from '../services/users.js';
import { parse } from '../util/http.js';
import { newId } from '../db/seed.js';

interface FullUser extends UserRow {
  password_hash: string;
  token_version: number;
  failed_attempts: number;
}

export function revokeAllSessions(ctx: Ctx, userId: string): number {
  return ctx.db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), userId).changes;
}

/** Password reset, deactivation or role change: old tokens stop working at once. */
export function invalidateTokens(ctx: Ctx, userId: string): void {
  ctx.db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
  revokeAllSessions(ctx, userId);
}

export function authRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const signAccess = (u: { id: string; role: Role; token_version: number }, sid: string): string =>
    app.jwt.sign({ sub: u.id, role: u.role, tv: u.token_version, sid }, { expiresIn: ctx.cfg.accessTtlSec });

  function startSession(u: FullUser, device: { label?: string; platform?: string }): AuthTokens & { sid: string } {
    const sid = `as_${newId()}`;
    const refresh = newRefreshToken();
    const now = new Date();
    const exp = new Date(now.getTime() + ctx.cfg.refreshTtlDays * 86400_000);
    ctx.db
      .prepare(
        `INSERT INTO auth_sessions (id, user_id, refresh_hash, device_label, platform, created_at, last_used_at, expires_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(sid, u.id, hashToken(refresh), device.label ?? null, device.platform ?? null, now.toISOString(), now.toISOString(), exp.toISOString());
    return { access_token: signAccess(u, sid), refresh_token: refresh, expires_in: ctx.cfg.accessTtlSec, sid };
  }

  function authResponse(u: FullUser, tokens: AuthTokens): AuthResponse {
    const grants = loadGrants(ctx, u.id);
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      user: userDTO(ctx, u),
      permissions: permissionsFor(u.role, grants),
      must_change_password: !!u.must_change_password,
    };
  }

  const fullUser = (id: string) =>
    ctx.db.prepare(`SELECT ${USER_COLS}, password_hash, token_version, failed_attempts FROM users WHERE id = ?`).get(id) as FullUser | undefined;

  // ---- Login ----------------------------------------------------------------------------------------
  app.post(
    '/auth/login',
    { config: { rateLimit: ctx.cfg.test ? false : { max: 12, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const b = parse(loginBody, req.body);
      const loginId = b.login_id.trim().toLowerCase();
      const findUser = (id: string) =>
        ctx.db
          .prepare(`SELECT ${USER_COLS}, password_hash, token_version, failed_attempts FROM users WHERE login_id = ?`)
          .get(id) as FullUser | undefined;
      let u = findUser(loginId);
      if (!u) {
        // A Player ID may be typed as "7", "NB7" or "nb-0007" (the TV number pad has digits only).
        const m = /^(?:nb-?)?(\d{1,6})$/.exec(loginId);
        if (m) u = findUser(`nb-${m[1]!.padStart(4, '0')}`);
      }
      if (!u) {
        await dummyVerify(b.secret, ctx.hashN);
        writeAudit(ctx.db, { actorId: null, action: 'LOGIN_FAILED', detail: { reason: 'unknown_id' }, ip: req.ip });
        throw new ApiError('INVALID_CREDENTIALS');
      }
      const wait = secondsLeft(u.locked_until);
      if (wait > 0) {
        writeAudit(ctx.db, { actorId: u.id, action: 'LOGIN_BLOCKED', targetType: 'user', targetId: u.id, ip: req.ip });
        throw new ApiError('ACCOUNT_LOCKED', { retry_after: wait });
      }
      const ok = await verifySecret(b.secret, u.password_hash);
      if (!ok || !u.is_active) {
        const lockedUntil = ok ? null : recordFailure(ctx.db, u.id);
        writeAudit(ctx.db, {
          actorId: u.id,
          action: lockedUntil ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
          targetType: 'user',
          targetId: u.id,
          detail: { reason: ok ? 'inactive' : 'bad_secret' },
          ip: req.ip,
        });
        if (lockedUntil) throw new ApiError('ACCOUNT_LOCKED', { retry_after: secondsLeft(lockedUntil) });
        throw new ApiError('INVALID_CREDENTIALS');
      }
      recordSuccess(ctx.db, u.id);
      ctx.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), u.id);
      markPresent(ctx, u.id);
      const tokens = startSession(u, { label: b.device_label, platform: b.platform });
      writeAudit(ctx.db, { actorId: u.id, action: 'LOGIN', targetType: 'user', targetId: u.id, detail: { platform: b.platform ?? null }, ip: req.ip });
      reply.send(authResponse(fullUser(u.id)!, tokens));
    },
  );

  // ---- Forgot password -----------------------------------------------------------------------------
  // A player (NB code) asks the coach for a new PIN; the request shows on the roster. Staff are told to ask a Super Admin or Admin.
  // The answer never says whether the ID exists.
  app.post('/auth/forgot', { config: { rateLimit: ctx.cfg.test ? false : { max: 6, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(z.object({ login_id: z.string().trim().min(1).max(64) }), req.body);
    const raw = b.login_id.trim().toLowerCase();
    const m = /^(?:nb-?)?(\d{1,6})$/.exec(raw);
    if (m) {
      const code = `nb-${m[1]!.padStart(4, '0')}`;
      const u = ctx.db.prepare("SELECT id FROM users WHERE login_id = ? AND role = 'PLAYER' AND is_active = 1").get(code) as { id: string } | undefined;
      if (u) {
        ctx.db.prepare('UPDATE player_profiles SET pin_reset_requested = 1 WHERE user_id = ?').run(u.id);
        writeAudit(ctx.db, { actorId: u.id, action: 'PIN_RESET_REQUESTED', targetType: 'player', targetId: u.id, ip: req.ip });
      }
      return { kind: 'player' as const };
    }
    return { kind: 'staff' as const };
  });

  // ---- Refresh with rotation and reuse detection ---------------------------------------------------------
  app.post('/auth/refresh', { config: { rateLimit: ctx.cfg.test ? false : { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { refresh_token } = parse(refreshBody, req.body);
    const h = hashToken(refresh_token);
    const s = ctx.db.prepare('SELECT * FROM auth_sessions WHERE refresh_hash = ?').get(h) as
      | { id: string; user_id: string; revoked_at: string | null; expires_at: string }
      | undefined;
    if (!s) {
      // An old token that was already rotated: someone is replaying it. Revoke the whole chain.
      const old = ctx.db.prepare('SELECT id, user_id FROM auth_sessions WHERE prev_refresh_hash = ?').get(h) as
        | { id: string; user_id: string }
        | undefined;
      if (old) {
        ctx.db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(new Date().toISOString(), old.id);
        writeAudit(ctx.db, { actorId: old.user_id, action: 'REFRESH_REUSE', targetType: 'auth_session', targetId: old.id, ip: req.ip });
      }
      throw new ApiError('AUTH_REQUIRED');
    }
    if (s.revoked_at || s.expires_at <= new Date().toISOString()) throw new ApiError('AUTH_REQUIRED');
    const u = fullUser(s.user_id);
    if (!u || !u.is_active) throw new ApiError('AUTH_REQUIRED');
    const next = newRefreshToken();
    ctx.db
      .prepare('UPDATE auth_sessions SET prev_refresh_hash = refresh_hash, refresh_hash = ?, last_used_at = ? WHERE id = ?')
      .run(hashToken(next), new Date().toISOString(), s.id);
    const out: AuthTokens = { access_token: signAccess(u, s.id), refresh_token: next, expires_in: ctx.cfg.accessTtlSec };
    return out;
  });

  // ---- Logout ----------------------------------------------------------------------------------------------
  app.post('/auth/logout', { preHandler: g.signedIn, config: { allowMustChange: true } }, async (req) => {
    const all = (req.query as { all?: string }).all === '1';
    if (all) revokeAllSessions(ctx, req.auth.id);
    else ctx.db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(new Date().toISOString(), req.auth.sid);
    auditReq(ctx.db, req, 'LOGOUT', 'user', req.auth.id, { all });
    return { ok: true };
  });

  // ---- Me ---------------------------------------------------------------------------------------------------------
  app.get('/me', { preHandler: g.signedIn, config: { allowMustChange: true } }, async (req) => {
    const u = fullUser(req.auth.id)!;
    const prof = ctx.db
      .prepare(
        `SELECT p.player_code, c.id AS coach_id, c.display_name AS coach_name FROM player_profiles p
           JOIN users c ON c.id = p.coach_id WHERE p.user_id = ?`,
      )
      .get(u.id) as { player_code: string; coach_id: string; coach_name: string } | undefined;
    const out: MeResponse = {
      user: userDTO(ctx, u),
      permissions: req.auth.permissions,
      must_change_password: req.auth.must_change,
      player: prof ? { player_code: prof.player_code, coach: { id: prof.coach_id, name: prof.coach_name } } : null,
      settings: ctx.settings(),
    };
    return out;
  });

  app.post('/me/password', { preHandler: g.signedIn, config: { allowMustChange: true } }, async (req) => {
    const b = parse(changePasswordBody, req.body);
    const u = fullUser(req.auth.id)!;
    if (!(await verifySecret(b.current_secret, u.password_hash))) {
      throw new ApiError('VALIDATION', { fields: { current_secret: 'That is not your current secret.' } });
    }
    if (b.new_secret === b.current_secret) {
      throw new ApiError('VALIDATION', { fields: { new_secret: 'Choose a different one.' } });
    }
    const bad = validateSecretFor(u.role, b.new_secret);
    if (bad) throw new ApiError('VALIDATION', { fields: { new_secret: bad } });
    const hash = await hashSecret(b.new_secret, ctx.hashN);
    ctx.db.transaction(() => {
      ctx.db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?').run(hash, u.id);
      // Every other device signs out; this one continues with fresh tokens.
      ctx.db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL').run(new Date().toISOString(), u.id, req.auth.sid);
    })();
    const fresh = fullUser(u.id)!;
    const next = newRefreshToken();
    ctx.db
      .prepare('UPDATE auth_sessions SET prev_refresh_hash = refresh_hash, refresh_hash = ?, last_used_at = ? WHERE id = ?')
      .run(hashToken(next), new Date().toISOString(), req.auth.sid);
    auditReq(ctx.db, req, 'PASSWORD_CHANGED', 'user', u.id);
    return authResponse(fresh, { access_token: signAccess(fresh, req.auth.sid), refresh_token: next, expires_in: ctx.cfg.accessTtlSec });
  });

  // ---- Devices ---------------------------------------------------------------------------------------------
  app.get('/me/sessions', { preHandler: g.signedIn }, async (req) => {
    const rows = ctx.db
      .prepare(
        `SELECT a.id, a.user_id, u.display_name, a.device_label, a.platform, a.created_at, a.last_used_at, a.expires_at
           FROM auth_sessions a JOIN users u ON u.id = a.user_id
          WHERE a.user_id = ? AND a.revoked_at IS NULL AND a.expires_at > ? ORDER BY a.last_used_at DESC`,
      )
      .all(req.auth.id, new Date().toISOString()) as Record<string, string | null>[];
    const items: DeviceSessionDTO[] = rows.map((r) => ({
      id: r.id!,
      user_id: r.user_id!,
      user_name: r.display_name!,
      device_label: r.device_label ?? null,
      platform: r.platform ?? null,
      created_at: r.created_at!,
      last_used_at: r.last_used_at ?? null,
      expires_at: r.expires_at!,
      current: r.id === req.auth.sid,
    }));
    return { items, next_cursor: null };
  });

  app.delete('/me/sessions/:id', { preHandler: g.signedIn }, async (req) => {
    const { id } = parse(z.object({ id: z.string().max(64) }), req.params);
    const r = ctx.db
      .prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), id, req.auth.id);
    if (!r.changes) throw new ApiError('NOT_FOUND');
    auditReq(ctx.db, req, 'SESSION_REVOKED', 'auth_session', id);
    return { ok: true };
  });

  void clearLock;
}

export type { Permission };

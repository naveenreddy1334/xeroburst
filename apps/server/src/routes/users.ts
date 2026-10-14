import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ROLE_RANK,
  can,
  canCreateRole,
  createUserBody,
  outranks,
  patchUserBody,
  permissionsBody,
} from '@nboard/shared';
import type { CreatedStaffResponse, Role } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError, conflict, notFound } from '../errors.js';
import { auditReq } from '../audit.js';
import { generateTempPassword, hashSecret } from '../auth/password.js';
import { clearLock } from '../auth/lockout.js';
import type { Guards } from '../rbac/guard.js';
import type { Actor } from '../rbac/guard.js';
import { assertCanManage } from '../rbac/scope.js';
import { USER_COLS, userDTO } from '../services/users.js';
import type { UserRow } from '../services/users.js';
import { hubExists } from '../services/hubs.js';
import { newId } from '../db/seed.js';
import { parse, pagingQuery } from '../util/http.js';
import { invalidateTokens, revokeAllSessions } from './auth.js';

const idParam = z.object({ id: z.string().min(1).max(64) });

export function userRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const load = (id: string) => ctx.db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as UserRow | undefined;

  /** A staff target the actor may act on. Players are managed through /players. */
  function staffTarget(actor: Actor, id: string): UserRow {
    const t = load(id);
    if (!t || t.role === 'PLAYER') throw notFound('User');
    assertCanManage(actor, t.role);
    return t;
  }

  const manageableRoles = (actor: Actor): Role[] =>
    (['SUPER_ADMIN', 'ADMIN', 'COACH'] as Role[]).filter(
      (r) => r !== 'SUPER_ADMIN' && outranks(actor.role, r) && (r === 'ADMIN' ? can(actor, 'MANAGE_ADMINS') : can(actor, 'MANAGE_COACHES')),
    );

  app.get('/users', { preHandler: g.need('MANAGE_COACHES', 'MANAGE_ADMINS') }, async (req) => {
    const q = parse(
      pagingQuery.extend({ role: z.enum(['ADMIN', 'COACH']).optional(), q: z.string().max(60).optional(), active: z.enum(['0', '1']).optional() }),
      req.query,
    );
    const allowed = manageableRoles(req.auth);
    const roles = q.role ? allowed.filter((r) => r === q.role) : allowed;
    if (!roles.length) return { items: [], next_cursor: null };
    const where = [`role IN (${roles.map(() => '?').join(',')})`];
    const params: (string | number)[] = [...roles];
    if (q.q) {
      where.push('(display_name LIKE ? OR login_id LIKE ?)');
      params.push(`%${q.q}%`, `%${q.q}%`);
    }
    if (q.active) {
      where.push('is_active = ?');
      params.push(Number(q.active));
    }
    const offset = q.cursor ? Number(q.cursor) || 0 : 0;
    const rows = ctx.db
      .prepare(`SELECT ${USER_COLS} FROM users WHERE ${where.join(' AND ')} ORDER BY role, display_name COLLATE NOCASE LIMIT ? OFFSET ?`)
      .all(...params, q.limit + 1, offset) as UserRow[];
    const more = rows.length > q.limit;
    return { items: rows.slice(0, q.limit).map((r) => userDTO(ctx, r)), next_cursor: more ? String(offset + q.limit) : null };
  });

  app.post('/users', { preHandler: g.need('MANAGE_ADMINS', 'MANAGE_COACHES', 'CREATE_COACHES') }, async (req, reply) => {
    const b = parse(createUserBody, req.body);
    if (b.role === 'PLAYER') {
      throw new ApiError('VALIDATION', { fields: { role: 'Players are created from the Players screen.' } });
    }
    if (!canCreateRole(req.auth, b.role)) {
      const rankProblem = !outranks(req.auth.role, b.role) && !(b.role === 'COACH' && can(req.auth, 'CREATE_COACHES'));
      throw new ApiError(rankProblem ? 'ROLE_RANK' : 'FORBIDDEN');
    }
    if (ctx.db.prepare('SELECT 1 FROM users WHERE login_id = ?').get(b.login_id)) {
      throw conflict('That login ID is already taken.', { field: 'login_id' });
    }
    const hubId = b.role === 'COACH' ? (b.hub_id ?? null) : null;
    if (hubId && !hubExists(ctx, hubId)) throw new ApiError('VALIDATION', { fields: { hub_id: 'Choose an active hub.' } });
    const temp = generateTempPassword();
    const id = `u_${newId()}`;
    ctx.db
      .prepare(
        `INSERT INTO users (id, login_id, display_name, role, password_hash, must_change_password, is_active, created_by, created_at, email, phone, age, hub_id)
         VALUES (?,?,?,?,?,1,1,?,?,?,?,?,?)`,
      )
      .run(id, b.login_id, b.display_name, b.role, await hashSecret(temp, ctx.hashN), req.auth.id, new Date().toISOString(), b.email ?? null, b.phone ?? null, b.age ?? null, hubId);
    auditReq(ctx.db, req, 'USER_CREATED', 'user', id, { role: b.role, login_id: b.login_id });
    const out: CreatedStaffResponse = { user: userDTO(ctx, load(id)!), temp_password: temp };
    reply.code(201).send(out);
  });

  app.get('/users/:id', { preHandler: g.need('MANAGE_COACHES', 'MANAGE_ADMINS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    return userDTO(ctx, staffTarget(req.auth, id));
  });

  app.patch('/users/:id', { preHandler: g.need('MANAGE_COACHES', 'MANAGE_ADMINS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const t = staffTarget(req.auth, id);
    const b = parse(patchUserBody, req.body);
    if (b.role && b.role !== t.role) {
      // Only a Super Admin changes roles, and only between Admin and Coach.
      if (req.auth.role !== 'SUPER_ADMIN') throw new ApiError('FORBIDDEN', undefined, 'Only a Super Admin can change a role.');
      if (t.role === 'COACH' && b.role === 'ADMIN') {
        // allowed
      }
    }
    ctx.db.transaction(() => {
      if (b.display_name !== undefined) ctx.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(b.display_name, id);
      if (b.email !== undefined) ctx.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(b.email, id);
      if (b.phone !== undefined) ctx.db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(b.phone, id);
      if (b.age !== undefined) ctx.db.prepare('UPDATE users SET age = ? WHERE id = ?').run(b.age, id);
      if (b.hub_id !== undefined && t.role === 'COACH') {
        if (b.hub_id && !hubExists(ctx, b.hub_id)) throw new ApiError('VALIDATION', { fields: { hub_id: 'Choose an active hub.' } });
        ctx.db.prepare('UPDATE users SET hub_id = ? WHERE id = ?').run(b.hub_id, id);
      }
      if (b.role !== undefined && b.role !== t.role) {
        ctx.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, id);
        if (b.role !== 'COACH') ctx.db.prepare('DELETE FROM user_permission_grants WHERE user_id = ?').run(id);
        invalidateTokens(ctx, id);
      }
      if (b.is_active !== undefined && b.is_active !== !!t.is_active) {
        ctx.db
          .prepare('UPDATE users SET is_active = ?, inactive_reason = ? WHERE id = ?')
          .run(b.is_active ? 1 : 0, b.is_active ? null : b.reason || null, id);
        if (!b.is_active) invalidateTokens(ctx, id);
      }
    })();
    const changed = Object.keys(b);
    auditReq(ctx.db, req, b.is_active === false ? 'USER_DEACTIVATED' : 'USER_UPDATED', 'user', id, { fields: changed, role: b.role });
    return userDTO(ctx, load(id)!);
  });

  app.post('/users/:id/reset-credentials', { preHandler: g.need('MANAGE_COACHES', 'MANAGE_ADMINS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    staffTarget(req.auth, id);
    const temp = generateTempPassword();
    ctx.db
      .prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
      .run(await hashSecret(temp, ctx.hashN), id);
    invalidateTokens(ctx, id);
    clearLock(ctx.db, id);
    auditReq(ctx.db, req, 'CREDENTIALS_RESET', 'user', id);
    return { temp_password: temp };
  });

  app.put('/users/:id/permissions', { preHandler: g.need('MANAGE_COACHES') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const t = staffTarget(req.auth, id);
    if (t.role !== 'COACH') throw new ApiError('VALIDATION', { fields: { _: 'Grants apply to Coaches only.' } });
    const b = parse(permissionsBody, req.body);
    if (b.create_coaches) {
      ctx.db
        .prepare('INSERT OR IGNORE INTO user_permission_grants (user_id, permission, granted_by, granted_at) VALUES (?,?,?,?)')
        .run(id, 'CREATE_COACHES', req.auth.id, new Date().toISOString());
    } else {
      ctx.db.prepare(`DELETE FROM user_permission_grants WHERE user_id = ? AND permission = 'CREATE_COACHES'`).run(id);
    }
    auditReq(ctx.db, req, 'GRANTS_CHANGED', 'user', id, { create_coaches: b.create_coaches });
    return userDTO(ctx, load(id)!);
  });

  app.post('/users/:id/revoke-sessions', { preHandler: g.need('MANAGE_COACHES', 'MANAGE_ADMINS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    staffTarget(req.auth, id);
    const n = revokeAllSessions(ctx, id);
    ctx.db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(id);
    auditReq(ctx.db, req, 'SESSIONS_REVOKED', 'user', id, { count: n });
    return { revoked: n };
  });

  void ROLE_RANK;
}

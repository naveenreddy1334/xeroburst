// Organization: the hub -> academy -> branch tree and the actions that change it.
// Academies and branches are optional. Nothing here moves a person without an explicit request.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { academyBody, academyPatchBody, assignBody, branchBody, branchPatchBody } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError, conflict, notFound } from '../errors.js';
import { auditReq } from '../audit.js';
import type { Actor, Guards } from '../rbac/guard.js';
import { newId } from '../db/seed.js';
import { parse } from '../util/http.js';
import { assertCanManage, inOrgScope, orgScope } from '../rbac/scope.js';
import { buildOrgTree, placementFor } from '../services/org.js';
import { hubExists } from '../services/hubs.js';

const idParam = z.object({ id: z.string().min(1).max(64) });

/** A Hub Manager may change only their own hub. Admin and Super Admin may change any. */
function assertHubReach(actor: Actor, hubId: string) {
  const sc = orgScope(actor);
  if (sc.kind === 'all') return;
  if (sc.kind === 'hub' && sc.id === hubId) return;
  throw new ApiError('OUT_OF_SCOPE');
}

export function orgRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  app.get('/org/tree', { preHandler: g.need('VIEW_ORG') }, async (req) => buildOrgTree(ctx, req.auth));

  // ---- academies ----
  app.post('/org/academies', { preHandler: g.need('MANAGE_ORG') }, async (req, reply) => {
    const b = parse(academyBody, req.body);
    if (!hubExists(ctx, b.hub_id)) throw new ApiError('VALIDATION', { fields: { hub_id: 'Choose an active hub.' } });
    assertHubReach(req.auth, b.hub_id);
    if (ctx.db.prepare('SELECT 1 FROM academies WHERE hub_id = ? AND name = ? COLLATE NOCASE').get(b.hub_id, b.name)) {
      throw conflict('This hub already has an academy with that name.', { field: 'name' });
    }
    const id = `a_${newId()}`;
    ctx.db.prepare('INSERT INTO academies (id, hub_id, name, is_active, created_by, created_at) VALUES (?,?,?,1,?,?)').run(id, b.hub_id, b.name, req.auth.id, new Date().toISOString());
    auditReq(ctx.db, req, 'ACADEMY_CREATED', 'academy', id, { name: b.name, hub_id: b.hub_id });
    reply.code(201).send({ id, hub_id: b.hub_id, name: b.name, is_active: true });
  });

  app.patch('/org/academies/:id', { preHandler: g.need('MANAGE_ORG') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const row = ctx.db.prepare('SELECT id, hub_id, name, is_active FROM academies WHERE id = ?').get(id) as { id: string; hub_id: string; name: string; is_active: number } | undefined;
    if (!row) throw notFound('Academy');
    assertHubReach(req.auth, row.hub_id);
    const b = parse(academyPatchBody, req.body);
    if (b.name !== undefined && ctx.db.prepare('SELECT 1 FROM academies WHERE hub_id = ? AND name = ? COLLATE NOCASE AND id <> ?').get(row.hub_id, b.name, id)) {
      throw conflict('This hub already has an academy with that name.', { field: 'name' });
    }
    if (b.is_active === false) {
      const n = ctx.db.prepare('SELECT COUNT(*) AS n FROM branches WHERE academy_id = ? AND is_active = 1').get(id) as { n: number };
      if (n.n > 0) throw conflict('Deactivate or move this academy\'s branches first.', { branches: n.n });
    }
    if (b.name !== undefined) ctx.db.prepare('UPDATE academies SET name = ? WHERE id = ?').run(b.name, id);
    if (b.is_active !== undefined) ctx.db.prepare('UPDATE academies SET is_active = ? WHERE id = ?').run(b.is_active ? 1 : 0, id);
    auditReq(ctx.db, req, 'ACADEMY_UPDATED', 'academy', id, { fields: Object.keys(b) });
    return ctx.db.prepare('SELECT id, hub_id, name, is_active FROM academies WHERE id = ?').get(id);
  });

  // ---- branches ----
  const academyOk = (academyId: string | null | undefined, hubId: string) => {
    if (!academyId) return;
    const a = ctx.db.prepare('SELECT hub_id FROM academies WHERE id = ? AND is_active = 1').get(academyId) as { hub_id: string } | undefined;
    if (!a || a.hub_id !== hubId) throw new ApiError('VALIDATION', { fields: { academy_id: 'Choose an active academy of this hub.' } });
  };

  app.post('/org/branches', { preHandler: g.need('MANAGE_ORG') }, async (req, reply) => {
    const b = parse(branchBody, req.body);
    if (!hubExists(ctx, b.hub_id)) throw new ApiError('VALIDATION', { fields: { hub_id: 'Choose an active hub.' } });
    assertHubReach(req.auth, b.hub_id);
    academyOk(b.academy_id, b.hub_id);
    if (ctx.db.prepare('SELECT 1 FROM branches WHERE hub_id = ? AND name = ? COLLATE NOCASE').get(b.hub_id, b.name)) {
      throw conflict('This hub already has a branch with that name.', { field: 'name' });
    }
    const id = `b_${newId()}`;
    ctx.db
      .prepare('INSERT INTO branches (id, hub_id, academy_id, name, city, is_active, created_by, created_at) VALUES (?,?,?,?,?,1,?,?)')
      .run(id, b.hub_id, b.academy_id ?? null, b.name, b.city ?? null, req.auth.id, new Date().toISOString());
    auditReq(ctx.db, req, 'BRANCH_CREATED', 'branch', id, { name: b.name, hub_id: b.hub_id, academy_id: b.academy_id ?? null });
    reply.code(201).send({ id, hub_id: b.hub_id, academy_id: b.academy_id ?? null, name: b.name, city: b.city ?? null, is_active: true });
  });

  app.patch('/org/branches/:id', { preHandler: g.need('MANAGE_ORG') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const row = ctx.db.prepare('SELECT id, hub_id FROM branches WHERE id = ?').get(id) as { id: string; hub_id: string } | undefined;
    if (!row) throw notFound('Branch');
    assertHubReach(req.auth, row.hub_id);
    const b = parse(branchPatchBody, req.body);
    if (b.name !== undefined && ctx.db.prepare('SELECT 1 FROM branches WHERE hub_id = ? AND name = ? COLLATE NOCASE AND id <> ?').get(row.hub_id, b.name, id)) {
      throw conflict('This hub already has a branch with that name.', { field: 'name' });
    }
    if (b.academy_id !== undefined) academyOk(b.academy_id, row.hub_id);
    if (b.is_active === false) {
      const n = ctx.db.prepare('SELECT COUNT(*) AS n FROM users WHERE branch_id = ? AND is_active = 1').get(id) as { n: number };
      if (n.n > 0) throw conflict('Move or deactivate the people in this branch first.', { people: n.n });
    }
    if (b.name !== undefined) ctx.db.prepare('UPDATE branches SET name = ? WHERE id = ?').run(b.name, id);
    if (b.city !== undefined) ctx.db.prepare('UPDATE branches SET city = ? WHERE id = ?').run(b.city, id);
    if (b.academy_id !== undefined) ctx.db.prepare('UPDATE branches SET academy_id = ? WHERE id = ?').run(b.academy_id, id);
    if (b.is_active !== undefined) ctx.db.prepare('UPDATE branches SET is_active = ? WHERE id = ?').run(b.is_active ? 1 : 0, id);
    auditReq(ctx.db, req, 'BRANCH_UPDATED', 'branch', id, { fields: Object.keys(b) });
    return ctx.db.prepare('SELECT id, hub_id, academy_id, name, city, is_active FROM branches WHERE id = ?').get(id);
  });

  // ---- assignment ----
  // Moves one staff member to a hub and, optionally, a branch. The person must already be inside the actor's reach, and the
  // destination must be too, so nobody can be pulled out of (or pushed into) a hub that is not the actor's.
  app.post('/org/assign', { preHandler: g.need('MANAGE_ORG') }, async (req) => {
    const b = parse(assignBody, req.body);
    const t = ctx.db.prepare('SELECT id, role, hub_id, branch_id FROM users WHERE id = ?').get(b.user_id) as
      | { id: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'HUB_MANAGER' | 'BRANCH_MANAGER' | 'COACH' | 'PLAYER'; hub_id: string | null; branch_id: string | null }
      | undefined;
    if (!t || !['HUB_MANAGER', 'BRANCH_MANAGER', 'COACH'].includes(t.role)) throw notFound('Staff member');
    assertCanManage(req.auth, t.role);
    const unplaced = !t.hub_id && !t.branch_id;
    if (orgScope(req.auth).kind !== 'all' && !unplaced && !inOrgScope(req.auth, t)) throw new ApiError('OUT_OF_SCOPE');
    const place = placementFor(ctx, req.auth, t.role, b.hub_id, b.branch_id ?? null);
    ctx.db.prepare('UPDATE users SET hub_id = ?, branch_id = ? WHERE id = ?').run(place.hub_id, place.branch_id, t.id);
    auditReq(ctx.db, req, 'STAFF_ASSIGNED', 'user', t.id, { from: { hub_id: t.hub_id, branch_id: t.branch_id }, to: place });
    return { id: t.id, ...place };
  });
}
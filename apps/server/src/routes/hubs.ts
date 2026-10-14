import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hubBody, hubPatchBody } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError, conflict, notFound } from '../errors.js';
import { auditReq } from '../audit.js';
import type { Guards } from '../rbac/guard.js';
import { newId } from '../db/seed.js';
import { parse } from '../util/http.js';
import { compareHubs, hubById, hubSummary, listHubs } from '../services/hubs.js';

const idParam = z.object({ id: z.string().min(1).max(64) });
const daysQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

export function hubRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  // Everyone signed in as staff can read the list (the forms need it); a Coach sees only their own hub.
  app.get('/hubs', { preHandler: g.need('MANAGE_PLAYERS', 'MANAGE_HUBS', 'VIEW_RESULTS') }, async (req) => {
    const all = listHubs(ctx);
    return { items: req.auth.role === 'COACH' && req.auth.hub_id ? all.filter((h) => h.id === req.auth.hub_id) : all };
  });

  app.post('/hubs', { preHandler: g.need('MANAGE_HUBS') }, async (req, reply) => {
    const b = parse(hubBody, req.body);
    if (ctx.db.prepare('SELECT 1 FROM hubs WHERE name = ? COLLATE NOCASE').get(b.name)) {
      throw conflict('A hub with that name already exists.', { field: 'name' });
    }
    const id = `h_${newId()}`;
    ctx.db.prepare('INSERT INTO hubs (id, name, city, is_active, created_by, created_at) VALUES (?,?,?,1,?,?)').run(id, b.name, b.city ?? null, req.auth.id, new Date().toISOString());
    auditReq(ctx.db, req, 'HUB_CREATED', 'hub', id, { name: b.name });
    reply.code(201).send(hubById(ctx, id));
  });

  app.patch('/hubs/:id', { preHandler: g.need('MANAGE_HUBS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    if (!hubById(ctx, id)) throw notFound('Hub');
    const b = parse(hubPatchBody, req.body);
    if (b.name !== undefined && ctx.db.prepare('SELECT 1 FROM hubs WHERE name = ? COLLATE NOCASE AND id <> ?').get(b.name, id)) {
      throw conflict('A hub with that name already exists.', { field: 'name' });
    }
    if (b.name !== undefined) ctx.db.prepare('UPDATE hubs SET name = ? WHERE id = ?').run(b.name, id);
    if (b.city !== undefined) ctx.db.prepare('UPDATE hubs SET city = ? WHERE id = ?').run(b.city, id);
    if (b.is_active !== undefined) ctx.db.prepare('UPDATE hubs SET is_active = ? WHERE id = ?').run(b.is_active ? 1 : 0, id);
    auditReq(ctx.db, req, 'HUB_UPDATED', 'hub', id, { fields: Object.keys(b) });
    return hubById(ctx, id);
  });

  // Registered before /hubs/:id so "compare" is not read as an id.
  app.get('/hubs/compare', { preHandler: g.need('MANAGE_HUBS') }, async (req) => {
    const q = parse(daysQuery, req.query);
    return { days: q.days, items: compareHubs(ctx, q.days) };
  });

  app.get('/hubs/:id/summary', { preHandler: g.need('MANAGE_HUBS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const q = parse(daysQuery, req.query);
    const hub = hubById(ctx, id);
    if (!hub) throw notFound('Hub');
    return hubSummary(ctx, hub, q.days);
  });

  // One click to put every person who has no hub yet (accounts from before hubs) into this one.
  app.post('/hubs/:id/assign-unassigned', { preHandler: g.need('MANAGE_HUBS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    if (!hubById(ctx, id)) throw notFound('Hub');
    const r = ctx.db.prepare(`UPDATE users SET hub_id = ? WHERE hub_id IS NULL AND role IN ('COACH','PLAYER')`).run(id);
    ctx.db.prepare('UPDATE attendance SET hub_id = ? WHERE hub_id IS NULL').run(id);
    auditReq(ctx.db, req, 'HUB_ASSIGNED', 'hub', id, { people: r.changes });
    return { assigned: r.changes };
  });

  void ApiError;
}

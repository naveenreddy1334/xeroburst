import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { patchProgramBody, programBody } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError, conflict, notFound } from '../errors.js';
import { auditReq } from '../audit.js';
import type { Guards } from '../rbac/guard.js';
import type { Actor } from '../rbac/guard.js';
import { applyProgram } from '../services/access.js';
import { createProgram, getProgram, listPrograms, writeStages } from '../services/programs.js';
import { parse } from '../util/http.js';

const idParam = z.object({ id: z.string().min(1).max(64) });

export function programRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const visible = (actor: Actor, ownerId: string | null) => actor.role !== 'COACH' || ownerId === null || ownerId === actor.id;
  /** Coaches edit only their own programs; Admins and Super Admins edit any. */
  const editable = (actor: Actor, ownerId: string | null) => actor.role !== 'COACH' || ownerId === actor.id;

  app.get('/programs', { preHandler: g.need('MANAGE_PROGRAMS', 'VIEW_RESULTS') }, async (req) => ({
    items: listPrograms(ctx, req.auth.role === 'COACH' ? req.auth.id : null),
    next_cursor: null,
  }));

  app.get('/programs/:id', { preHandler: g.need('MANAGE_PROGRAMS', 'VIEW_RESULTS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const p = getProgram(ctx, id);
    if (!p) throw notFound('Program');
    if (!visible(req.auth, p.owner_id)) throw new ApiError('OUT_OF_SCOPE');
    return p;
  });

  app.post('/programs', { preHandler: g.need('MANAGE_PROGRAMS') }, async (req, reply) => {
    const b = parse(programBody, req.body);
    // A Coach's program belongs to them. Admin programs are shared templates.
    const isCoach = req.auth.role === 'COACH';
    const id = ctx.db.transaction(() =>
      createProgram(ctx, { ...b, is_template: isCoach ? false : (b.is_template ?? true) }, isCoach ? req.auth.id : null, req.auth.id),
    )();
    auditReq(ctx.db, req, 'PROGRAM_CREATED', 'program', id, { name: b.name });
    reply.code(201).send(getProgram(ctx, id));
  });

  app.patch('/programs/:id', { preHandler: g.need('MANAGE_PROGRAMS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const p = getProgram(ctx, id);
    if (!p) throw notFound('Program');
    if (!editable(req.auth, p.owner_id)) throw new ApiError('OUT_OF_SCOPE');
    const b = parse(patchProgramBody, req.body);
    ctx.db.transaction(() => {
      if (b.name !== undefined) ctx.db.prepare('UPDATE programs SET name = ? WHERE id = ?').run(b.name, id);
      if (b.retired !== undefined) ctx.db.prepare('UPDATE programs SET retired = ? WHERE id = ?').run(b.retired ? 1 : 0, id);
      if (b.is_template !== undefined && req.auth.role !== 'COACH') {
        ctx.db.prepare('UPDATE programs SET is_template = ? WHERE id = ?').run(b.is_template ? 1 : 0, id);
      }
      if (b.stages) {
        writeStages(ctx, id, b.stages);
        // Players on this program: keep their stage in range and re-apply (manual rows are untouched).
        const users = ctx.db.prepare('SELECT player_id FROM player_programs WHERE program_id = ?').all(id) as { player_id: string }[];
        for (const u of users) {
          ctx.db.prepare('UPDATE player_programs SET current_stage = MIN(current_stage, ?) WHERE player_id = ?').run(b.stages.length, u.player_id);
          applyProgram(ctx, u.player_id, req.auth.id);
        }
      }
    })();
    auditReq(ctx.db, req, 'PROGRAM_UPDATED', 'program', id, { fields: Object.keys(b) });
    return getProgram(ctx, id);
  });

  app.delete('/programs/:id', { preHandler: g.need('MANAGE_PROGRAMS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const p = getProgram(ctx, id);
    if (!p) throw notFound('Program');
    if (!editable(req.auth, p.owner_id)) throw new ApiError('OUT_OF_SCOPE');
    if (p.players_using > 0) {
      throw conflict('Players are using this program. Retire it instead.', { players_using: p.players_using });
    }
    ctx.db.prepare('DELETE FROM programs WHERE id = ?').run(id);
    auditReq(ctx.db, req, 'PROGRAM_DELETED', 'program', id, { name: p.name });
    return { ok: true };
  });
}

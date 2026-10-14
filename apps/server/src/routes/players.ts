import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  accessBody,
  assignProgramBody,
  createPlayerBody,
  isSimplePin,
  patchPlayerBody,
  reassignBody,
  resetPlayerBody,
  stageBody,
  validatePin,
  GAME_SLUGS,
} from '@nboard/shared';
import type { CreatedPlayerResponse, GameSlug, ResetPlayerResponse } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError, notFound } from '../errors.js';
import { auditReq } from '../audit.js';
import { generatePin, hashSecret } from '../auth/password.js';
import { clearLock } from '../auth/lockout.js';
import type { Guards } from '../rbac/guard.js';
import type { Actor } from '../rbac/guard.js';
import { playerInScope, scopeSql } from '../rbac/scope.js';
import { PLAYER_LIST_SQL, playerDetail, playerListItem } from '../services/users.js';
import { accessItems, applyProgram, ensureAccessRows, setAccess } from '../services/access.js';
import { gameBySlug } from '../services/games.js';
import { getProgram, playerProgram } from '../services/programs.js';
import { newId } from '../db/seed.js';
import { hubExists } from '../services/hubs.js';
import { pagingQuery, parse } from '../util/http.js';
import { invalidateTokens } from './auth.js';

const idParam = z.object({ id: z.string().min(1).max(64) });
const accessParam = z.object({ id: z.string().min(1).max(64), game: z.enum(GAME_SLUGS) });

export function playerRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  /** A program this actor may assign: any for staff above Coach; for a Coach their own and shared ones. */
  function usableProgram(actor: Actor, programId: string) {
    const p = getProgram(ctx, programId);
    if (!p) throw notFound('Program');
    if (actor.role === 'COACH' && p.owner_id !== null && p.owner_id !== actor.id) throw new ApiError('OUT_OF_SCOPE');
    return p;
  }

  function activeCoach(id: string) {
    const c = ctx.db.prepare(`SELECT id, display_name FROM users WHERE id = ? AND role = 'COACH' AND is_active = 1`).get(id) as
      | { id: string; display_name: string }
      | undefined;
    if (!c) throw new ApiError('VALIDATION', { fields: { coach_id: 'Choose an active Coach.' } });
    return c;
  }

  // ---- Players ---------------------------------------------------------------------------------------------
  app.get('/players', { preHandler: g.need('MANAGE_PLAYERS', 'VIEW_RESULTS') }, async (req) => {
    const q = parse(
      pagingQuery.extend({
        q: z.string().max(60).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        coach: z.string().max(64).optional(),
        hub: z.string().max(64).optional(),
      }),
      req.query,
    );
    const sc = scopeSql(req.auth, 'p');
    const where: string[] = [];
    const params: (string | number)[] = [...sc.params];
    if (q.q) {
      where.push('(u.display_name LIKE ? OR p.player_code LIKE ?)');
      params.push(`%${q.q}%`, `%${q.q}%`);
    }
    if (q.status) {
      where.push('p.status = ?');
      params.push(q.status);
    }
    if (q.hub) {
      where.push('u.hub_id = ?');
      params.push(q.hub);
    }
    if (q.coach) {
      where.push('p.coach_id = ?');
      params.push(q.coach);
    }
    const offset = q.cursor ? Number(q.cursor) || 0 : 0;
    const rows = ctx.db
      .prepare(`${PLAYER_LIST_SQL}${sc.sql}${where.length ? ' AND ' + where.join(' AND ') : ''} ORDER BY u.display_name COLLATE NOCASE LIMIT ? OFFSET ?`)
      .all(...params, q.limit + 1, offset) as Record<string, unknown>[];
    const more = rows.length > q.limit;
    return { items: rows.slice(0, q.limit).map((r) => playerListItem(ctx, r)), next_cursor: more ? String(offset + q.limit) : null };
  });

  app.post('/players', { preHandler: g.need('MANAGE_PLAYERS') }, async (req, reply) => {
    const b = parse(createPlayerBody, req.body);
    let coachId: string;
    if (req.auth.role === 'COACH') {
      if (b.coach_id && b.coach_id !== req.auth.id) throw new ApiError('OUT_OF_SCOPE');
      coachId = req.auth.id;
    } else {
      if (!b.coach_id) throw new ApiError('VALIDATION', { fields: { coach_id: 'Choose a Coach for this player.' } });
      coachId = activeCoach(b.coach_id).id;
    }
    if (b.pin) {
      const bad = validatePin(b.pin);
      if (bad) throw new ApiError('VALIDATION', { fields: { pin: bad } });
    }
    // The hub: a Coach's players join the Coach's hub; an Admin or Super Admin picks one (default: the chosen Coach's hub).
    let hubId: string | null;
    if (req.auth.role === 'COACH') hubId = req.auth.hub_id;
    else if (b.hub_id !== undefined) hubId = b.hub_id;
    else hubId = (ctx.db.prepare('SELECT hub_id FROM users WHERE id = ?').get(coachId) as { hub_id: string | null }).hub_id;
    if (hubId && !hubExists(ctx, hubId)) throw new ApiError('VALIDATION', { fields: { hub_id: 'Choose an active hub.' } });
    const program = b.program_id ? usableProgram(req.auth, b.program_id) : null;
    const pin = b.pin ?? generatePin(isSimplePin);
    const hash = await hashSecret(pin, ctx.hashN);
    const id = `u_${newId()}`;
    const now = new Date().toISOString();

    let code = '';
    ctx.db.transaction(() => {
      const next = (ctx.db.prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(player_code, 4) AS INTEGER)), 0) + 1 AS n FROM player_profiles`).get() as { n: number }).n;
      code = `NB-${String(next).padStart(4, '0')}`;
      ctx.db
        .prepare(
          `INSERT INTO users (id, login_id, display_name, role, password_hash, must_change_password, is_active, created_by, created_at, hub_id)
           VALUES (?,?,?,'PLAYER',?,1,1,?,?,?)`,
        )
        .run(id, code.toLowerCase(), b.display_name, hash, req.auth.id, now, hubId);
      ctx.db
        .prepare('INSERT INTO player_profiles (user_id, player_code, coach_id, age, weight_kg, notes, status) VALUES (?,?,?,?,?,?,?)')
        .run(id, code, coachId, b.age, b.weight_kg, b.notes ?? null, 'active');
      ensureAccessRows(ctx, id);
      if (program) {
        ctx.db.prepare('INSERT INTO player_programs (player_id, program_id, current_stage, started_at, updated_by) VALUES (?,?,1,?,?)').run(id, program.id, now, req.auth.id);
        applyProgram(ctx, id, req.auth.id);
      } else {
        // Section 17.4: Quick Reaction unlocked, the rest locked, unless the Coach chose a starting point.
        const start = new Set<GameSlug>(b.starting_games?.length ? b.starting_games : ['quick']);
        for (const slug of GAME_SLUGS) {
          setAccess(ctx, id, slug, { state: start.has(slug) ? 'unlocked' : 'locked' }, req.auth.id);
          ctx.db.prepare('UPDATE player_game_access SET manual = ? WHERE player_id = ? AND game_id = (SELECT id FROM games WHERE slug = ?)').run(b.starting_games?.length ? 1 : 0, id, slug);
        }
      }
      if (program && b.starting_games?.length) {
        for (const slug of b.starting_games) setAccess(ctx, id, slug, { state: 'unlocked' }, req.auth.id);
      }
    })();
    auditReq(ctx.db, req, 'PLAYER_CREATED', 'player', id, { player_code: code, coach_id: coachId, hub_id: hubId, program_id: program?.id ?? null });
    const out: CreatedPlayerResponse = { player: playerDetail(ctx, id)!, credentials: { login_id: code, pin } };
    reply.code(201).send(out);
  });

  app.get('/players/:id', { preHandler: g.need('MANAGE_PLAYERS', 'VIEW_RESULTS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    playerInScope(ctx, req.auth, id);
    return playerDetail(ctx, id)!;
  });

  app.patch('/players/:id', { preHandler: g.need('MANAGE_PLAYERS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const p = playerInScope(ctx, req.auth, id);
    const b = parse(patchPlayerBody, req.body);
    ctx.db.transaction(() => {
      if (b.display_name !== undefined) ctx.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(b.display_name, id);
      const set = (col: string, v: unknown) => ctx.db.prepare(`UPDATE player_profiles SET ${col} = ? WHERE user_id = ?`).run(v, id);
      if (b.hub_id !== undefined) {
        if (req.auth.role === 'COACH') throw new ApiError('FORBIDDEN', undefined, 'Only an Admin can move a player to another hub.');
        if (b.hub_id && !hubExists(ctx, b.hub_id)) throw new ApiError('VALIDATION', { fields: { hub_id: 'Choose an active hub.' } });
        ctx.db.prepare('UPDATE users SET hub_id = ? WHERE id = ?').run(b.hub_id, id);
      }
      if (b.age !== undefined) set('age', b.age);
      if (b.weight_kg !== undefined) set('weight_kg', b.weight_kg);
      if (b.notes !== undefined) set('notes', b.notes);
      if (b.status !== undefined && b.status !== p.status) {
        set('status', b.status);
        ctx.db
          .prepare('UPDATE users SET is_active = ?, inactive_reason = ? WHERE id = ?')
          .run(b.status === 'active' ? 1 : 0, b.status === 'inactive' ? b.reason || null : null, id);
        if (b.status === 'inactive') invalidateTokens(ctx, id);
      }
    })();
    auditReq(ctx.db, req, b.status === 'inactive' ? 'PLAYER_DEACTIVATED' : 'PLAYER_UPDATED', 'player', id, { fields: Object.keys(b) });
    return playerDetail(ctx, id)!;
  });

  app.post('/players/:id/reset-credentials', { preHandler: g.need('MANAGE_PLAYERS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const p = playerInScope(ctx, req.auth, id);
    const b = parse(resetPlayerBody, req.body);
    if (b.pin) {
      const bad = validatePin(b.pin);
      if (bad) throw new ApiError('VALIDATION', { fields: { pin: bad } });
    }
    const pin = b.pin ?? generatePin(isSimplePin);
    ctx.db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(await hashSecret(pin, ctx.hashN), id);
    invalidateTokens(ctx, id);
    clearLock(ctx.db, id);
    ctx.db.prepare('UPDATE player_profiles SET pin_reset_requested = 0 WHERE user_id = ?').run(id);
    auditReq(ctx.db, req, 'CREDENTIALS_RESET', 'player', id, { player_code: p.player_code });
    const out: ResetPlayerResponse = { credentials: { login_id: p.player_code, pin } };
    return out;
  });

  app.put('/players/:id/coach', { preHandler: g.need('MANAGE_COACHES') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const p = playerInScope(ctx, req.auth, id);
    const b = parse(reassignBody, req.body);
    const coach = activeCoach(b.coach_id);
    ctx.db.prepare('UPDATE player_profiles SET coach_id = ? WHERE user_id = ?').run(coach.id, id);
    auditReq(ctx.db, req, 'PLAYER_REASSIGNED', 'player', id, { from: p.coach_id, to: coach.id });
    return playerDetail(ctx, id)!;
  });

  // ---- Game access -------------------------------------------------------------------------------------------
  app.get('/players/:id/access', { preHandler: g.need('MANAGE_GAME_ACCESS', 'VIEW_RESULTS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    playerInScope(ctx, req.auth, id);
    return { items: accessItems(ctx, id) };
  });

  app.put('/players/:id/access/:game', { preHandler: g.need('MANAGE_GAME_ACCESS', 'MANAGE_GAME_PROGRESS') }, async (req) => {
    const { id, game } = parse(accessParam, req.params);
    playerInScope(ctx, req.auth, id);
    const b = parse(accessBody, req.body);
    const info = gameBySlug(ctx, game);
    if (!info) throw notFound('Game');
    for (const k of ['level_cap', 'target_level'] as const) {
      const v = b[k];
      if (v !== undefined && v !== null && (v < info.min_level || v > info.max_level)) {
        throw new ApiError('VALIDATION', { fields: { [k]: `Use ${info.min_level} to ${info.max_level}.` } });
      }
    }
    setAccess(ctx, id, game, b, req.auth.id);
    auditReq(ctx.db, req, 'ACCESS_CHANGED', 'player', id, { game, ...b });
    return { items: accessItems(ctx, id) };
  });

  // ---- Program for a player ----------------------------------------------------------------------------------------
  app.get('/players/:id/program', { preHandler: g.need('VIEW_RESULTS', 'MANAGE_PROGRAMS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    playerInScope(ctx, req.auth, id);
    return { assignment: playerProgram(ctx, id) };
  });

  app.put('/players/:id/program', { preHandler: g.need('MANAGE_PROGRAMS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    playerInScope(ctx, req.auth, id);
    const b = parse(assignProgramBody, req.body);
    const prog = usableProgram(req.auth, b.program_id);
    if (prog.retired) throw new ApiError('CONFLICT', undefined, 'That program is retired.');
    if (!prog.stages.length) throw new ApiError('CONFLICT', undefined, 'That program has no stages.');
    ctx.db.transaction(() => {
      ctx.db
        .prepare(
          `INSERT INTO player_programs (player_id, program_id, current_stage, started_at, updated_by) VALUES (?,?,1,?,?)
           ON CONFLICT(player_id) DO UPDATE SET program_id = excluded.program_id, current_stage = 1,
                                                started_at = excluded.started_at, updated_by = excluded.updated_by`,
        )
        .run(id, prog.id, new Date().toISOString(), req.auth.id);
      applyProgram(ctx, id, req.auth.id);
    })();
    auditReq(ctx.db, req, 'PROGRAM_ASSIGNED', 'player', id, { program_id: prog.id });
    return playerDetail(ctx, id)!;
  });

  function moveStage(actorId: string, id: string, to: (cur: number, count: number) => number) {
    const pp = playerProgram(ctx, id);
    if (!pp) throw new ApiError('CONFLICT', undefined, 'Assign a program first.');
    const next = to(pp.current_stage, pp.stage_count);
    ctx.db.transaction(() => {
      ctx.db.prepare('UPDATE player_programs SET current_stage = ?, updated_by = ? WHERE player_id = ?').run(next, actorId, id);
      applyProgram(ctx, id, actorId);
    })();
    return { from: pp.current_stage, to: next };
  }

  app.post('/players/:id/program/advance', { preHandler: g.need('MANAGE_GAME_PROGRESS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    playerInScope(ctx, req.auth, id);
    const r = moveStage(req.auth.id, id, (cur, count) => {
      if (cur >= count) throw new ApiError('CONFLICT', undefined, 'This player is already on the last stage.');
      return cur + 1;
    });
    auditReq(ctx.db, req, 'STAGE_ADVANCED', 'player', id, r);
    return playerDetail(ctx, id)!;
  });

  app.put('/players/:id/program/stage', { preHandler: g.need('MANAGE_GAME_PROGRESS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    playerInScope(ctx, req.auth, id);
    const b = parse(stageBody, req.body);
    const r = moveStage(req.auth.id, id, (_cur, count) => {
      if (b.stage > count) throw new ApiError('VALIDATION', { fields: { stage: `This program has ${count} stages.` } });
      return b.stage;
    });
    auditReq(ctx.db, req, 'STAGE_SET', 'player', id, r);
    return playerDetail(ctx, id)!;
  });
}

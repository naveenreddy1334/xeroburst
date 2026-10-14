import { markPresent } from './hubs.js';
import { PRIMARY_METRIC, isBetter, normalizeSummary, primaryValue, summarize } from '@nboard/shared';
import type {
  CreateSessionResponse,
  FinishResponse,
  FinishSessionBody,
  GameSlug,
  MetricDelta,
  SessionDTO,
  SessionStatus,
  Summary,
} from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError, conflict, notFound } from '../errors.js';
import type { Actor } from '../rbac/guard.js';
import { getAccess, targetProgress } from './access.js';
import { gameBySlug } from './games.js';
import { newTicket } from '../auth/tokens.js';
import { playerInScope } from '../rbac/scope.js';

const SESSION_SQL = `
  SELECT s.id, s.user_id, u.display_name, p.player_code, g.slug, g.id AS game_id, s.level, s.transport, s.board_fw,
         s.started_at, s.ended_at, s.status, s.score, s.summary_json, s.is_pb, s.module_key
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN games g ON g.id = s.game_id
    LEFT JOIN player_profiles p ON p.user_id = s.user_id`;

export interface SessionRow {
  id: string;
  user_id: string;
  display_name: string;
  player_code: string | null;
  slug: GameSlug;
  game_id: number;
  level: number;
  transport: string | null;
  board_fw: string | null;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  score: number | null;
  summary_json: string | null;
  is_pb: number;
  module_key?: string;
}

export function loadSession(ctx: Ctx, id: string): SessionRow | undefined {
  return ctx.db.prepare(`${SESSION_SQL} WHERE s.id = ?`).get(id) as SessionRow | undefined;
}

export function sessionDTO(r: SessionRow, withPlayer = true): SessionDTO {
  const dto: SessionDTO = {
    id: r.id,
    user_id: r.user_id,
    game: r.slug,
    level: r.level,
    module_key: r.module_key ?? 'nboard',
    transport: r.transport,
    board_fw: r.board_fw,
    started_at: r.started_at,
    ended_at: r.ended_at,
    status: r.status,
    score: r.score,
    summary: r.summary_json ? normalizeSummary(JSON.parse(r.summary_json) as Summary) : null,
    is_pb: !!r.is_pb,
  };
  if (withPlayer) {
    dto.player_name = r.display_name;
    if (r.player_code) dto.player_code = r.player_code;
  }
  return dto;
}

export function levelCapFor(ctx: Ctx, actor: { id: string; role: string }, slug: GameSlug, maxLevel: number): number {
  if (actor.role !== 'PLAYER') return maxLevel;
  const a = getAccess(ctx, actor.id, slug);
  return Math.min(maxLevel, a?.level_cap ?? maxLevel);
}

export function createSession(
  ctx: Ctx,
  actor: Actor,
  body: { id: string; game: GameSlug; level: number; transport: 'ble' | 'bridge' | 'mock'; module_key?: string; player_id?: string },
): CreateSessionResponse {
  const game = gameBySlug(ctx, body.game);
  if (!game) throw notFound('Game');
  if (body.level < game.min_level || body.level > game.max_level) {
    throw new ApiError('VALIDATION', { fields: { level: `Level must be ${game.min_level} to ${game.max_level}.` } });
  }
  const moduleKey = body.module_key ?? 'nboard';
  // Assess: staff record a round for one of their players. The round belongs to the player, recorded_by is the staff member.
  let ownerId = actor.id;
  let recordedBy: string | null = null;
  if (body.player_id && body.player_id !== actor.id) {
    if (actor.role === 'PLAYER') throw new ApiError('FORBIDDEN', { assess: true });
    const owner = ctx.db.prepare('SELECT role FROM users WHERE id = ?').get(body.player_id) as { role: string } | undefined;
    if (!owner || owner.role !== 'PLAYER') throw notFound('Player');
    playerInScope(ctx, actor, body.player_id);
    ownerId = body.player_id;
    recordedBy = actor.id;
  }
  if (moduleKey !== 'nboard' && actor.role === 'PLAYER') throw new ApiError('FORBIDDEN', { module: moduleKey });
  if (actor.role === 'PLAYER') {
    const a = getAccess(ctx, actor.id, body.game);
    if (!a || a.state === 'locked') throw new ApiError('GAME_LOCKED', { game: body.game });
  }
  const cap = levelCapFor(ctx, actor, body.game, game.max_level);
  if (body.level > cap) throw new ApiError('GAME_LOCKED', { game: body.game, level_cap: cap });

  const existing = loadSession(ctx, body.id);
  if (existing) {
    if (existing.user_id !== ownerId) throw conflict('That session id is already in use.');
    if (existing.status !== 'started') throw conflict('That session has already ended.');
  }
  // The board is only shared through the server in bridge mode.
  if (body.transport === 'bridge' && ctx.hub.isHeldByOther(actor.id, body.id)) {
    throw new ApiError('BOARD_BUSY', { held_by: ctx.hub.holderName() });
  }
  const now = new Date().toISOString();
  if (!existing) {
    ctx.db
      .prepare(
        `INSERT INTO sessions (id, user_id, game_id, level, transport, started_at, status, created_server_at, module_key, recorded_by)
         VALUES (?,?,?,?,?,?, 'started', ?, ?, ?)`,
      )
      .run(body.id, ownerId, game.id, body.level, body.transport, now, now, moduleKey, recordedBy);
  }
  const ticket = newTicket();
  ctx.tickets.set(ticket, {
    sessionId: body.id,
    userId: actor.id,
    userName: actor.display_name,
    game: body.game,
    level: body.level,
    levelCap: cap,
    expires: Date.now() + 60_000,
  });
  const s = existing ?? loadSession(ctx, body.id)!;
  return {
    session: { id: s.id, game: s.slug, level: s.level, started_at: s.started_at },
    level_cap: cap,
    board_ticket: ticket,
    ticket_expires_in: 60,
    board: ctx.hub.status(true),
  };
}

function previousCompleted(ctx: Ctx, s: SessionRow): SessionRow | undefined {
  return ctx.db
    .prepare(
      `${SESSION_SQL} WHERE s.user_id = ? AND s.game_id = ? AND s.level = ? AND s.status = 'completed'
          AND s.id <> ? AND s.started_at <= ? AND s.summary_json IS NOT NULL
        ORDER BY s.started_at DESC LIMIT 1`,
    )
    .get(s.user_id, s.game_id, s.level, s.id, s.started_at) as SessionRow | undefined;
}

function bestBefore(ctx: Ctx, s: SessionRow): number | null {
  const rows = ctx.db
    .prepare(
      `SELECT summary_json FROM sessions
        WHERE user_id = ? AND game_id = ? AND level = ? AND status = 'completed' AND id <> ? AND summary_json IS NOT NULL`,
    )
    .all(s.user_id, s.game_id, s.level, s.id) as { summary_json: string }[];
  let best: number | null = null;
  for (const r of rows) {
    const v = primaryValue(JSON.parse(r.summary_json) as Summary);
    if (v !== null && isBetter(s.slug, v, best)) best = v;
  }
  return best;
}

function buildFinish(ctx: Ctx, s: SessionRow, stateChange: FinishResponse['state_change']): FinishResponse {
  const prev = s.status === 'completed' ? previousCompleted(ctx, s) : undefined;
  const info = PRIMARY_METRIC[s.slug];
  const value = s.summary_json ? primaryValue(JSON.parse(s.summary_json) as Summary) : null;
  const prevValue = prev?.summary_json ? primaryValue(JSON.parse(prev.summary_json) as Summary) : null;
  let delta: MetricDelta | null = null;
  if (s.status === 'completed') {
    const change = value !== null && prevValue !== null ? Math.round((value - prevValue) * 10) / 10 : null;
    delta = {
      key: info.key,
      label: info.label,
      unit: info.unit,
      lower_is_better: info.lowerIsBetter,
      value,
      previous: prevValue,
      change,
      better: change === null || change === 0 ? null : info.lowerIsBetter ? change < 0 : change > 0,
    };
  }
  return { session: sessionDTO(s, false), previous: prev ? sessionDTO(prev, false) : null, is_pb: !!s.is_pb, delta, state_change: stateChange };
}

function recordedByOf(ctx: Ctx, id: string): string | null {
  const r = ctx.db.prepare('SELECT recorded_by FROM sessions WHERE id = ?').get(id) as { recorded_by: string | null } | undefined;
  return r?.recorded_by ?? null;
}

export function finishSession(ctx: Ctx, actor: Actor, id: string, body: FinishSessionBody): FinishResponse {
  const s = loadSession(ctx, id);
  if (!s) throw notFound('Session');
  if (s.user_id !== actor.id && recordedByOf(ctx, id) !== actor.id) throw new ApiError('OUT_OF_SCOPE');
  // Uploading twice is safe: the stored result comes back.
  if (s.summary_json) return buildFinish(ctx, s, null);

  const started = Date.parse(body.started_at);
  const ended = Date.parse(body.ended_at);
  const clientMs = Number.isFinite(started) && Number.isFinite(ended) ? ended - started : 0;
  const duration = Math.min(Math.max(0, clientMs), 4 * 3600_000);
  const status: SessionStatus = (body.status === 'completed' || body.status === 'interrupted') && body.hits.length === 0 ? 'aborted' : body.status;
  const summary = summarize(s.slug, body.hits, { duration_ms: duration });
  const endedAt = new Date().toISOString();

  let stateChange: FinishResponse['state_change'] = null;
  ctx.db.transaction(() => {
    const ins = ctx.db.prepare(
      `INSERT INTO hits (session_id, seq, target_btn, pressed_btn, rt_ms, correct, distractor, t_ms, len, step)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const h of body.hits) {
      ins.run(id, h.seq, h.target_btn, h.pressed_btn, h.rt_ms, h.correct ? 1 : 0, h.distractor ? 1 : 0, h.t_ms, h.len ?? null, h.step ?? null);
    }
    ctx.db
      .prepare('UPDATE sessions SET status=?, ended_at=?, score=?, summary_json=?, board_fw=COALESCE(?, board_fw), is_pb=0 WHERE id=?')
      .run(status, endedAt, summary.score, JSON.stringify(summary), body.board_fw ?? null, id);

    if (status === 'completed') {
      const value = primaryValue(summary);
      const fresh = loadSession(ctx, id)!;
      const pb = value !== null && isBetter(s.slug, value, bestBefore(ctx, fresh));
      if (pb) ctx.db.prepare('UPDATE sessions SET is_pb = 1 WHERE id = ?').run(id);

      if (actor.role === 'PLAYER' && !recordedByOf(ctx, id)) {
        const a = getAccess(ctx, actor.id, s.slug);
        if (a && a.state === 'unlocked') {
          const tp = targetProgress(ctx, actor.id, a);
          if (tp && tp.done >= tp.sessions) {
            // A met target is a signal; it marks the game Completed but does not unlock the next one.
            ctx.db
              .prepare(`UPDATE player_game_access SET state='completed', completed_at=? WHERE player_id=? AND game_id=?`)
              .run(endedAt, actor.id, a.game_id);
            stateChange = 'completed';
          }
        }
      }
    }
  })();
  ctx.hub.release(id);
  if (actor.role === 'PLAYER') markPresent(ctx, actor.id);
  return buildFinish(ctx, loadSession(ctx, id)!, stateChange);
}

export function abortSession(ctx: Ctx, actor: Actor, id: string): SessionDTO {
  const s = loadSession(ctx, id);
  if (!s) throw notFound('Session');
  if (s.user_id !== actor.id && recordedByOf(ctx, id) !== actor.id) throw new ApiError('OUT_OF_SCOPE');
  if (s.status === 'started') {
    ctx.db.prepare(`UPDATE sessions SET status='aborted', ended_at=? WHERE id=?`).run(new Date().toISOString(), id);
  }
  ctx.hub.release(id);
  return sessionDTO(loadSession(ctx, id)!, false);
}

/** Marks a session interrupted (heartbeat lost, sweeper). Never overwrites an uploaded result. */
export function markInterrupted(ctx: Ctx, id: string): void {
  ctx.db.prepare(`UPDATE sessions SET status='interrupted', ended_at=? WHERE id=? AND status='started'`).run(new Date().toISOString(), id);
}

/** A round that never reported back (app killed, phone off) is closed after 30 minutes. */
export function sweepStaleSessions(ctx: Ctx, olderThanMs = 30 * 60_000): number {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const r = ctx.db
    .prepare(`UPDATE sessions SET status='interrupted', ended_at=? WHERE status='started' AND started_at < ?`)
    .run(new Date().toISOString(), cutoff);
  return r.changes;
}


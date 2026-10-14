import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  GAMES,
  GAME_SLUGS,
  createSessionBody,
  finishSessionBody,
  isServerStatus,
  parseAppLine,
  BOARD_ERROR,
} from '@nboard/shared';
import type { GameDTO, HowToDTO, ModuleDTO, SystemInfo } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError, notFound } from '../errors.js';
import type { Guards } from '../rbac/guard.js';
import { gamesForUser } from '../services/games.js';
import { abortSession, createSession, finishSession, loadSession, sessionDTO } from '../services/sessions.js';
import { playerInScope } from '../rbac/scope.js';
import { parse } from '../util/http.js';

const slugParam = z.object({ slug: z.enum(GAME_SLUGS) });
const idParam = z.object({ id: z.string().min(1).max(64) });

export function gameRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  app.get('/modules', { preHandler: g.signedIn }, async (req) => {
    const rows = ctx.db.prepare('SELECT key, name, enabled FROM modules ORDER BY sort_order').all() as { key: string; name: string; enabled: number }[];
    // Every module is open to staff (Super Admin, Admin, Coach). Players keep the module switch as configured.
    const staff = req.auth.role !== 'PLAYER';
    const items: ModuleDTO[] = rows.map((r) => ({ key: r.key, name: r.name, enabled: staff || !!r.enabled, coming_soon: !staff && !r.enabled }));
    return { items };
  });

  app.get('/games', { preHandler: g.need('PLAY_GAME') }, async (req) => ({ items: gamesForUser(ctx, req.auth) }));

  function gameFor(req: { auth: { id: string; role: string } }, slug: string): GameDTO {
    const game = gamesForUser(ctx, req.auth).find((x) => x.slug === slug);
    if (!game) throw notFound('Game');
    // Every role can see every game and read how it works. A locked game cannot be STARTED: that is
    // enforced in createSession, so hiding or showing a card never decides who may play.
    return game;
  }

  app.get('/games/:slug', { preHandler: g.need('PLAY_GAME') }, async (req) => {
    const { slug } = parse(slugParam, req.params);
    return gameFor(req, slug);
  });

  app.get('/games/:slug/howto', { preHandler: g.need('PLAY_GAME') }, async (req) => {
    const { slug } = parse(slugParam, req.params);
    gameFor(req, slug);
    const info = GAMES[slug];
    const out: HowToDTO = { slug, name: info.name, steps: info.howto };
    return out;
  });

  // ---- Sessions -----------------------------------------------------------------------------------------
  app.post('/sessions', { preHandler: g.need('PLAY_GAME') }, async (req, reply) => {
    const b = parse(createSessionBody, req.body);
    reply.code(201).send(createSession(ctx, req.auth, b));
  });

  app.post('/sessions/:id/finish', { preHandler: g.need('PLAY_GAME'), bodyLimit: 2 * 1024 * 1024 }, async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(finishSessionBody, req.body);
    return finishSession(ctx, req.auth, id, b);
  });

  app.post('/sessions/:id/abort', { preHandler: g.need('PLAY_GAME') }, async (req) => {
    const { id } = parse(idParam, req.params);
    return abortSession(ctx, req.auth, id);
  });

  app.get('/sessions/:id', { preHandler: g.need('VIEW_OWN_RESULTS', 'VIEW_RESULTS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const s = loadSession(ctx, id);
    if (!s) throw notFound('Session');
    if (s.user_id !== req.auth.id) {
      if (!req.auth.permissions.includes('VIEW_RESULTS')) throw new ApiError('OUT_OF_SCOPE');
      const owner = ctx.db.prepare('SELECT role FROM users WHERE id = ?').get(s.user_id) as { role: string } | undefined;
      if (owner?.role === 'PLAYER') playerInScope(ctx, req.auth, s.user_id);
      else if (req.auth.role === 'COACH') throw new ApiError('OUT_OF_SCOPE');
    }
    return sessionDTO(s);
  });

  // Per-target rows of a stored round, for the reaction-time-through-the-round chart. Same access rules as the round itself.
  app.get('/sessions/:id/hits', { preHandler: g.need('VIEW_OWN_RESULTS', 'VIEW_RESULTS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const s = loadSession(ctx, id);
    if (!s) throw notFound('Session');
    if (s.user_id !== req.auth.id) {
      if (!req.auth.permissions.includes('VIEW_RESULTS')) throw new ApiError('OUT_OF_SCOPE');
      const owner = ctx.db.prepare('SELECT role FROM users WHERE id = ?').get(s.user_id) as { role: string } | undefined;
      if (owner?.role === 'PLAYER') playerInScope(ctx, req.auth, s.user_id);
      else if (req.auth.role === 'COACH') throw new ApiError('OUT_OF_SCOPE');
    }
    const rows = ctx.db
      .prepare('SELECT seq, rt_ms, correct, distractor, t_ms FROM hits WHERE session_id = ? ORDER BY seq')
      .all(id) as { seq: number; rt_ms: number | null; correct: number; distractor: number; t_ms: number }[];
    return { hits: rows.map((r) => ({ seq: r.seq, rt_ms: r.rt_ms, correct: !!r.correct, distractor: !!r.distractor, t_ms: r.t_ms })) };
  });

  // ---- Board ------------------------------------------------------------------------------------------------
  app.get('/board/status', { preHandler: g.need('PLAY_GAME') }, async (req) => ctx.hub.status(req.auth.role !== 'PLAYER'));

  // The WebSocket relay. Authentication is the single-use ticket from POST /sessions.
  app.get('/board', { websocket: true }, (socket, req) => {
    const ticketId = (req.query as { ticket?: string }).ticket ?? '';
    const t = ctx.tickets.get(ticketId);
    ctx.tickets.delete(ticketId); // one use
    const reject = (code: number, text: string) => {
      try {
        socket.send(JSON.stringify({ t: 'err', code, msg: text }));
      } finally {
        socket.close(code === BOARD_ERROR.BUSY ? 4409 : 4401, text);
      }
    };
    if (!t || t.expires < Date.now()) return reject(BOARD_ERROR.NOT_ALLOWED, 'Invalid or expired ticket.');
    const session = loadSession(ctx, t.sessionId);
    if (!session || session.status !== 'started') return reject(BOARD_ERROR.NOT_ALLOWED, 'That session is not open.');

    const ok = ctx.hub.acquire({
      sessionId: t.sessionId,
      userId: t.userId,
      userName: t.userName,
      game: t.game as never,
      level: t.level,
      levelCap: t.levelCap,
      sink: {
        send: (m) => {
          if (socket.readyState === 1) socket.send(JSON.stringify(m));
        },
        close: () => {
          try {
            socket.close(1000, 'released');
          } catch {
            /* closed */
          }
        },
      },
    });
    if (!ok) return reject(BOARD_ERROR.BUSY, 'The board is being used by someone else.');

    socket.on('message', (raw: Buffer) => {
      // One JSON object per message; a trailing newline is allowed.
      for (const line of raw.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        const msg = parseAppLine(line);
        if (!msg) {
          socket.send(JSON.stringify({ t: 'err', code: BOARD_ERROR.NOT_ALLOWED, msg: 'Unknown command.' }));
          continue;
        }
        ctx.hub.fromApp(t.sessionId, msg);
      }
    });
    socket.on('close', () => {
      // The app went away. Stop the board and free the lock; the session stays open so the app can
      // still upload what it has (or the sweeper closes it as interrupted).
      ctx.hub.release(t.sessionId);
    });
  });

  void isServerStatus;
}

export type { SystemInfo };

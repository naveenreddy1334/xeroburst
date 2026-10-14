import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GAME_SLUGS, permissionsFor } from '@nboard/shared';
import type { MyProgressResponse, SessionDTO } from '@nboard/shared';
import { pbsFor, streakFor, userAnalytics, overview, activity } from '../services/analytics.js';
import type { Ctx } from '../ctx.js';
import { ApiError } from '../errors.js';
import type { Guards } from '../rbac/guard.js';
import { playerInScope, scopeSql } from '../rbac/scope.js';
import { gamesForUser } from '../services/games.js';
import { playerProgram } from '../services/programs.js';
import { sessionDTO, loadSession } from '../services/sessions.js';
import { insightsForSessionId, orgPerformance, performanceFor } from '../services/performance.js';
import { notFound } from '../errors.js';
import type { SessionRow } from '../services/sessions.js';
import { decodeCursor, encodeCursor, page, pagingQuery, parse } from '../util/http.js';
import { iso, rangeWindow } from '../util/time.js';

const idParam = z.object({ id: z.string().min(1).max(64) });
const analyticsQuery = z.object({
  range: z.enum(['day', 'week', 'month']).default('week'),
  offset: z.coerce.number().int().min(-120).max(0).default(0),
  game: z.enum(GAME_SLUGS).optional(),
});
const resultsQuery = pagingQuery.extend({
  game: z.enum(GAME_SLUGS).optional(),
  range: z.enum(['day', 'week', 'month', 'all']).default('all'),
  offset: z.coerce.number().int().min(-120).max(0).default(0),
  status: z.enum(['completed', 'played', 'any']).default('any'),
});

export function resultRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  function resultsFor(userId: string, q: z.infer<typeof resultsQuery>, withPlayer: boolean) {
    const where = ["s.user_id = ?", "s.status <> 'started'"];
    const params: (string | number)[] = [userId];
    if (q.status === 'completed') where.push("s.status = 'completed'");
    // 'played' = finished or stopped by the player with at least one result; aborted rounds and rounds still running are left out.
    if (q.status === 'played') where.push("s.status IN ('completed','interrupted') AND s.summary_json IS NOT NULL");
    if (q.game) {
      where.push('g.slug = ?');
      params.push(q.game);
    }
    if (q.range !== 'all') {
      const { timezone, week_start } = ctx.settings();
      const w = rangeWindow(q.range, q.offset, Date.now(), timezone, week_start);
      where.push('s.started_at >= ? AND s.started_at < ?');
      params.push(iso(w.from), iso(w.to));
    }
    const cur = decodeCursor<{ t: string; id: string }>(q.cursor);
    if (cur) {
      where.push('(s.started_at < ? OR (s.started_at = ? AND s.id < ?))');
      params.push(cur.t, cur.t, cur.id);
    }
    const rows = ctx.db
      .prepare(
        `SELECT s.id, s.user_id, u.display_name, p.player_code, g.slug, g.id AS game_id, s.level, s.transport, s.board_fw,
                s.started_at, s.ended_at, s.status, s.score, s.summary_json, s.is_pb, s.module_key
           FROM sessions s JOIN users u ON u.id = s.user_id JOIN games g ON g.id = s.game_id
           LEFT JOIN player_profiles p ON p.user_id = s.user_id
          WHERE ${where.join(' AND ')} ORDER BY s.started_at DESC, s.id DESC LIMIT ?`,
      )
      .all(...params, q.limit + 1) as SessionRow[];
    const items: SessionDTO[] = rows.map((r) => sessionDTO(r, withPlayer));
    return page(items, q.limit, (s) => encodeCursor({ t: s.started_at, id: s.id }));
  }

  // ---- Own data -------------------------------------------------------------------------------------------
  app.get('/me/results', { preHandler: g.need('VIEW_OWN_RESULTS') }, async (req) =>
    resultsFor(req.auth.id, parse(resultsQuery, req.query), false),
  );

  app.get('/me/analytics', { preHandler: g.need('VIEW_OWN_RESULTS') }, async (req) => {
    const q = parse(analyticsQuery, req.query);
    return userAnalytics(ctx, req.auth.id, q.range, q.offset, q.game ?? null);
  });

  app.get('/me/performance', { preHandler: g.need('VIEW_OWN_RESULTS') }, async (req) => performanceFor(ctx, req.auth.id));

  app.get('/me/progress', { preHandler: g.need('VIEW_OWN_PROGRESS') }, async (req) => {
    const games = gamesForUser(ctx, req.auth);
    const out: MyProgressResponse = {
      games,
      program: playerProgram(ctx, req.auth.id),
      bests: pbsFor(ctx, req.auth.id),
      streak: streakFor(ctx, req.auth.id),
    };
    return out;
  });

  // ---- A player's data, seen by staff in scope -------------------------------------------------------------------
  app.get('/players/:id/results', { preHandler: g.need('VIEW_RESULTS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    playerInScope(ctx, req.auth, id);
    return resultsFor(id, parse(resultsQuery, req.query), false);
  });

  app.get('/players/:id/analytics', { preHandler: g.need('VIEW_RESULTS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    playerInScope(ctx, req.auth, id);
    const q = parse(analyticsQuery, req.query);
    return userAnalytics(ctx, id, q.range, q.offset, q.game ?? null);
  });

  app.get('/players/:id/performance', { preHandler: g.need('VIEW_RESULTS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    playerInScope(ctx, req.auth, id);
    return performanceFor(ctx, id);
  });

  // Every measured reaction time of a player's completed rounds in one game within the last N days, for the distribution chart.
  function rtsFor(userId: string, game: string, days: number) {
    const cut = iso(Date.now() - days * 86_400_000);
    const rows = ctx.db
      .prepare(
        `SELECT h.rt_ms FROM hits h JOIN sessions s ON s.id = h.session_id JOIN games g ON g.id = s.game_id
          WHERE s.user_id = ? AND s.status = 'completed' AND g.slug = ? AND s.started_at >= ? AND h.rt_ms IS NOT NULL
          ORDER BY s.started_at DESC, h.seq LIMIT 4000`,
      )
      .all(userId, game, cut) as { rt_ms: number }[];
    return { rts: rows.map((r) => r.rt_ms) };
  }
  const rtsQuery = z.object({ game: z.enum(GAME_SLUGS), days: z.coerce.number().int().min(1).max(90).default(7) });
  app.get('/me/rts', { preHandler: g.need('VIEW_OWN_RESULTS') }, async (req) => {
    const q = parse(rtsQuery, req.query);
    return rtsFor(req.auth.id, q.game, q.days);
  });
  app.get('/players/:id/rts', { preHandler: g.need('VIEW_RESULTS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    playerInScope(ctx, req.auth, id);
    const q = parse(rtsQuery, req.query);
    return rtsFor(id, q.game, q.days);
  });

  // Each active player's latest completed round in a game, with the five headline figures. Feeds the Leaderboard
  // and the "vs average" comparison, so both use the same numbers.
  app.get('/analytics/board', { preHandler: g.need('VIEW_RESULTS') }, async (req) => {
    const q = parse(z.object({ game: z.enum(GAME_SLUGS) }), req.query);
    const hubSql = req.auth.role === 'COACH' && req.auth.hub_id ? ' AND u.hub_id = ?' : '';
    const hubArgs = hubSql ? [req.auth.hub_id as string] : [];
    const rows = ctx.db
      .prepare(
        `SELECT u.id, u.display_name, p.player_code, s.summary_json, s.started_at
           FROM users u JOIN player_profiles p ON p.user_id = u.id AND p.status = 'active'
           JOIN sessions s ON s.user_id = u.id AND s.status = 'completed' AND s.summary_json IS NOT NULL
           JOIN games g ON g.id = s.game_id AND g.slug = ?
          WHERE u.role = 'PLAYER' AND u.is_active = 1${hubSql}
            AND s.started_at = (SELECT MAX(s2.started_at) FROM sessions s2 WHERE s2.user_id = u.id AND s2.game_id = s.game_id AND s2.status = 'completed' AND s2.summary_json IS NOT NULL)
          GROUP BY u.id ORDER BY u.display_name`,
      )
      .all(q.game, ...hubArgs) as { id: string; display_name: string; player_code: string; summary_json: string; started_at: string }[];
    const sparkSql = ctx.db.prepare(
      `SELECT s.summary_json FROM sessions s JOIN games g ON g.id = s.game_id
        WHERE s.user_id = ? AND g.slug = ? AND s.status = 'completed' AND s.summary_json IS NOT NULL
        ORDER BY s.started_at DESC LIMIT 6`,
    );
    const items = rows.map((r) => {
      const spark = (sparkSql.all(r.id, q.game) as { summary_json: string }[])
        .map((x) => (JSON.parse(x.summary_json) as { avg_rt: number | null }).avg_rt)
        .filter((v): v is number => v !== null)
        .reverse();
      const sm = JSON.parse(r.summary_json) as { avg_rt: number | null; accuracy: number; sd_rt: number | null; events: number; duration_ms: number };
      const avg = sm.avg_rt;
      const cv = avg && sm.sd_rt !== null ? (sm.sd_rt / avg) * 100 : null;
      const rcs = cv === null ? null : Math.max(0, 1 - cv / 100);
      const speed = sm.duration_ms > 0 ? sm.events / (sm.duration_ms / 1000) : null;
      const score = avg === null ? null : Math.round(sm.accuracy * 10 - avg / 2 + (rcs ?? 0) * 100);
      return { id: r.id, name: r.display_name, code: r.player_code, avg_rt: avg, accuracy: sm.accuracy, cv, rcs, speed, score, at: r.started_at, spark };
    });
    return { game: q.game, items };
  });

  // Insights for one finished round. Same access rule as reading the session itself: your own, or a player in scope.
  app.get('/sessions/:id/insights', { preHandler: g.need('VIEW_OWN_RESULTS', 'VIEW_RESULTS') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const s = loadSession(ctx, id);
    if (!s) throw notFound('Session');
    if (s.user_id !== req.auth.id) {
      if (!req.auth.permissions.includes('VIEW_RESULTS')) throw new ApiError('OUT_OF_SCOPE');
      const owner = ctx.db.prepare('SELECT role FROM users WHERE id = ?').get(s.user_id) as { role: string } | undefined;
      if (owner?.role === 'PLAYER') playerInScope(ctx, req.auth, s.user_id);
      else if (req.auth.role === 'COACH') throw new ApiError('OUT_OF_SCOPE');
    }
    return insightsForSessionId(ctx, s.user_id, id);
  });

  app.get('/analytics/performance', { preHandler: g.need('VIEW_RESULTS') }, async (req) => orgPerformance(ctx, req.auth));

  app.get('/analytics/overview', { preHandler: g.need('VIEW_RESULTS') }, async (req) => overview(ctx, req.auth));

  // Staff: the latest completed rounds of every player in scope, and one point per day over the last N days
  // (average reaction, fastest reaction, accuracy and misses, each averaged over that day's rounds).
  app.get('/results/overview', { preHandler: g.need('VIEW_RESULTS') }, async (req) => {
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(90).default(14), limit: z.coerce.number().int().min(1).max(50).default(8) }), req.query);
    const sc = scopeSql(req.auth, 'p');
    const base = `SELECT s.id, s.user_id, u.display_name, p.player_code, g.slug, g.id AS game_id, s.level, s.transport, s.board_fw,
                s.started_at, s.ended_at, s.status, s.score, s.summary_json, s.is_pb, s.module_key
           FROM sessions s JOIN users u ON u.id = s.user_id JOIN games g ON g.id = s.game_id
           JOIN player_profiles p ON p.user_id = s.user_id
          WHERE s.status IN ('completed','interrupted') AND s.summary_json IS NOT NULL${sc.sql}`;
    const rows = ctx.db.prepare(`${base} ORDER BY s.started_at DESC, s.id DESC LIMIT ?`).all(...sc.params, q.limit) as SessionRow[];
    const cut = iso(Date.now() - q.days * 86_400_000);
    const all = ctx.db.prepare(`${base} AND s.started_at >= ?`).all(...sc.params, cut) as SessionRow[];
    const byDay = new Map<string, { rt: number[]; best: number[]; acc: number[]; miss: number[] }>();
    for (const r of all) {
      const sm = JSON.parse(r.summary_json as string) as { avg_rt: number | null; best_rt: number | null; accuracy: number; misses: number };
      const k = r.started_at.slice(0, 10);
      const d = byDay.get(k) ?? { rt: [], best: [], acc: [], miss: [] };
      if (sm.avg_rt !== null) d.rt.push(sm.avg_rt);
      if (sm.best_rt !== null) d.best.push(sm.best_rt);
      d.acc.push(sm.accuracy);
      d.miss.push(sm.misses);
      byDay.set(k, d);
    }
    const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const daily = [];
    for (let i = q.days - 1; i >= 0; i--) {
      const day = iso(Date.now() - i * 86_400_000).slice(0, 10);
      const d = byDay.get(day);
      const r0 = (v: number | null) => (v === null ? null : Math.round(v));
      daily.push({
        day,
        avg_rt: d ? r0(mean(d.rt)) : null,
        best_rt: d && d.best.length ? Math.min(...d.best) : null,
        accuracy: d ? (mean(d.acc) === null ? null : Math.round((mean(d.acc) as number) * 10) / 10) : null,
        misses: d ? r0(mean(d.miss)) : null,
      });
    }
    return { rounds: rows.map((r) => sessionDTO(r, true)), daily };
  });

  app.get('/activity', { preHandler: g.need('VIEW_RESULTS') }, async (req) => {
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }), req.query);
    return { items: activity(ctx, req.auth, limit), next_cursor: null };
  });

  void ApiError;
  void permissionsFor;
}

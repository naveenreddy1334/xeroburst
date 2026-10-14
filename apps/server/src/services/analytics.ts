// Analytics (section 28.4). Completed rounds and rounds the player stopped (interrupted, with at least one hit) count in the figures.
// Aborted rounds are excluded; personal bests, streaks and targets use completed rounds only. All days and weeks are local days
// in the organisation time zone; weeks start on the configured day (default Monday).

import { PRIMARY_METRIC, aggregate, median as medianOf, normalizeSummary } from '@nboard/shared';
import type {
  ActivityItem,
  AnalyticsRange,
  AnalyticsResponse,
  GameSlug,
  OverviewResponse,
  Summary,
} from '@nboard/shared';
import { primaryValue } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { iso, dayNumber, rangeWindow } from '../util/time.js';
import { bestsFor, enabledGames } from './games.js';
import { scopeSql } from '../rbac/scope.js';
import type { Actor } from '../rbac/guard.js';

interface Row {
  started_at: string;
  level: number;
  slug: GameSlug;
  summary: Summary;
}

function sessionsIn(ctx: Ctx, userIds: { sql: string; params: string[] }, from: number, to: number, game: GameSlug | null): Row[] {
  const rows = ctx.db
    .prepare(
      `SELECT s.started_at, s.level, g.slug, s.summary_json
         FROM sessions s JOIN games g ON g.id = s.game_id
        WHERE ${userIds.sql} AND s.status IN ('completed','interrupted') AND s.summary_json IS NOT NULL
          AND s.started_at >= ? AND s.started_at < ? ${game ? 'AND g.slug = ?' : ''}
        ORDER BY s.started_at`,
    )
    .all(...userIds.params, iso(from), iso(to), ...(game ? [game] : [])) as { started_at: string; level: number; slug: GameSlug; summary_json: string }[];
  return rows.map((r) => ({ started_at: r.started_at, level: r.level, slug: r.slug, summary: normalizeSummary(JSON.parse(r.summary_json) as Summary) }));
}

function agg(rows: Row[]) {
  // One definition of totals for statistics, reports, profiles and recommendations (see @nboard/shared insights).
  const x = aggregate(rows);
  return { sessions: x.sessions, hits: x.hits, misses: x.misses, events: x.events, avg_rt: x.avg_rt, time_ms: x.time_ms };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function streakFor(ctx: Ctx, userId: string): { current: number; longest: number } {
  const { timezone: tz } = ctx.settings();
  const rows = ctx.db
    .prepare(`SELECT started_at FROM sessions WHERE user_id = ? AND status = 'completed'`)
    .all(userId) as { started_at: string }[];
  const days = [...new Set(rows.map((r) => dayNumber(Date.parse(r.started_at), tz)))].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1]! + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const set = new Set(days);
  let d = dayNumber(Date.now(), tz);
  if (!set.has(d)) d -= 1;
  let current = 0;
  while (set.has(d)) {
    current++;
    d--;
  }
  return { current, longest };
}

export function pbsFor(ctx: Ctx, userId: string): AnalyticsResponse['pbs'] {
  const out: AnalyticsResponse['pbs'] = [];
  for (const g of enabledGames(ctx)) {
    for (const b of bestsFor(ctx, userId, g.id, g.slug)) {
      out.push({ game: g.slug, level: b.level, value: b.value, metric: b.metric, achieved_at: b.achieved_at });
    }
  }
  return out;
}

export function userAnalytics(
  ctx: Ctx,
  userId: string,
  range: AnalyticsRange,
  offset: number,
  game: GameSlug | null,
): AnalyticsResponse {
  const { timezone: tz, week_start: ws } = ctx.settings();
  const now = Date.now();
  const win = rangeWindow(range, offset, now, tz, ws);
  const prev = rangeWindow(range, offset - 1, now, tz, ws);
  const who = { sql: 's.user_id = ?', params: [userId] };
  const cur = sessionsIn(ctx, who, win.from, win.to, game);
  const before = sessionsIn(ctx, who, prev.from, prev.to, game);
  const a = agg(cur);
  const b = agg(before);

  const series = win.buckets.map((bk) => {
    const inB = cur.filter((r) => {
      const t = Date.parse(r.started_at);
      return t >= bk.from && t < bk.to;
    });
    const x = agg(inB);
    return { key: bk.key, label: bk.label, sessions: x.sessions, hits: x.hits, misses: x.misses, avg_rt: x.avg_rt, time_ms: x.time_ms };
  });

  const per_game: AnalyticsResponse['per_game'] = [];
  for (const g of enabledGames(ctx)) {
    if (game && g.slug !== game) continue;
    const rows = cur.filter((r) => r.slug === g.slug);
    if (!rows.length) continue;
    const prevRows = before.filter((r) => r.slug === g.slug);
    const med = (rs: Row[]) => medianOf(rs.map((r) => r.summary.median_rt).filter((x): x is number => x !== null));
    const mc = med(rows);
    const mp = med(prevRows);
    const vals = rows.map((r) => primaryValue(r.summary)).filter((x): x is number => x !== null);
    const info = PRIMARY_METRIC[g.slug];
    const best = vals.length ? (info.lowerIsBetter ? Math.min(...vals) : Math.max(...vals)) : null;
    const fat = rows
      .map((r) => (r.summary.game === 'endure' ? r.summary.degradation_pct : null))
      .filter((x): x is number => x !== null);
    per_game.push({
      game: g.slug,
      sessions: rows.length,
      avg_rt: agg(rows).avg_rt,
      best_value: best,
      metric: info.key,
      improvement_pct: mc !== null && mp !== null && mp > 0 ? r1(((mc - mp) / mp) * 100) : null,
      fatigue_pct: g.slug === 'endure' && fat.length ? r1(fat.reduce((p, c) => p + c, 0) / fat.length) : null,
    });
  }
  // "Best game": the one that got faster the most, else the one played the most.
  const improved = per_game.filter((p) => p.improvement_pct !== null).sort((x, y) => x.improvement_pct! - y.improvement_pct!)[0];
  const mostPlayed = [...per_game].sort((x, y) => y.sessions - x.sessions)[0];
  const bestGame = improved && improved.improvement_pct! < 0 ? improved.game : (mostPlayed?.game ?? null);

  return {
    range,
    offset,
    label: win.label,
    from: iso(win.from),
    to: iso(win.to),
    timezone: tz,
    game,
    totals: {
      sessions: a.sessions,
      hits: a.hits,
      misses: a.misses,
      avg_rt: a.avg_rt,
      best_game: bestGame,
      time_trained_ms: a.time_ms,
      accuracy: a.events ? r1((a.hits / a.events) * 100) : null,
    },
    previous: { sessions: b.sessions, hits: b.hits, misses: b.misses, avg_rt: b.avg_rt, time_trained_ms: b.time_ms },
    series,
    per_game,
    streak: streakFor(ctx, userId),
    pbs: pbsFor(ctx, userId),
  };
}

/** Players this actor may see, as a SQL fragment on sessions.user_id. */
function scopedUsers(actor: Actor): { sql: string; params: string[] } {
  const sc = scopeSql(actor, 'p');
  return {
    sql: `s.user_id IN (SELECT p.user_id FROM player_profiles p WHERE 1=1${sc.sql})`,
    params: sc.params,
  };
}

export function overview(ctx: Ctx, actor: Actor): OverviewResponse {
  const { timezone: tz, week_start: ws } = ctx.settings();
  const now = Date.now();
  const wk = rangeWindow('week', 0, now, tz, ws);
  const pw = rangeWindow('week', -1, now, tz, ws);
  const who = scopedUsers(actor);
  const sc = scopeSql(actor, 'p');
  const total = (ctx.db.prepare(`SELECT COUNT(*) c FROM player_profiles p WHERE 1=1${sc.sql}`).get(...sc.params) as { c: number }).c;

  const cur = sessionsIn(ctx, who, wk.from, wk.to, null);
  const prev = sessionsIn(ctx, who, pw.from, pw.to, null);
  const active = (
    ctx.db
      .prepare(
        `SELECT COUNT(DISTINCT s.user_id) c FROM sessions s
          WHERE ${who.sql} AND s.status IN ('completed','interrupted') AND s.started_at >= ? AND s.started_at < ?`,
      )
      .get(...who.params, iso(wk.from), iso(wk.to)) as { c: number }
  ).c;
  const a = agg(cur);
  const b = agg(prev);
  const by_game = enabledGames(ctx).map((g) => ({ game: g.slug, sessions: cur.filter((r) => r.slug === g.slug).length }));
  return {
    total_players: total,
    active_players_week: active,
    sessions_week: a.sessions,
    sessions_prev_week: b.sessions,
    hits_week: a.hits,
    avg_rt_week: a.avg_rt,
    avg_rt_prev_week: b.avg_rt,
    series: wk.buckets.map((bk) => ({
      key: bk.key,
      label: bk.label,
      sessions: cur.filter((r) => {
        const t = Date.parse(r.started_at);
        return t >= bk.from && t < bk.to;
      }).length,
    })),
    by_game,
  };
}

export function activity(ctx: Ctx, actor: Actor, limit: number): ActivityItem[] {
  const sc = scopeSql(actor, 'p');
  const rows = ctx.db
    .prepare(
      `SELECT s.id, s.user_id, u.display_name, p.player_code, g.slug, s.level, s.status, s.score, s.summary_json, s.ended_at, s.started_at, s.is_pb
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN player_profiles p ON p.user_id = s.user_id
         JOIN games g ON g.id = s.game_id
        WHERE s.status <> 'started'${sc.sql}
        ORDER BY s.started_at DESC LIMIT ?`,
    )
    .all(...sc.params, limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    player_id: r.user_id as string,
    player_name: r.display_name as string,
    player_code: r.player_code as string,
    game: r.slug as GameSlug,
    level: r.level as number,
    status: r.status as ActivityItem['status'],
    score: (r.score as number | null) ?? null,
    primary: r.summary_json ? primaryValue(JSON.parse(r.summary_json as string) as Summary) : null,
    ended_at: ((r.ended_at as string | null) ?? (r.started_at as string)) || null,
    is_pb: !!r.is_pb,
  }));
}

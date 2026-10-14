// Performance profile and insights. Everything here is derived from completed and stopped (interrupted) rounds' stored summaries
// (normalised to the single miss definition), with the aggregation code that lives in @nboard/shared, so the
// profile, the dashboards, the reports and the recommendations all read the same numbers.

import {
  accuracyOf,
  aggregate,
  insightsForPlayer,
  insightsForSession,
  levelPerformance,
  normalizeSummary,
  perfSummary,
  playersNeedingAttention,
} from '@nboard/shared';
import type {
  GameSlug,
  Insight,
  InsightSession,
  InsightsResult,
  OrgPerformanceResponse,
  PerfSummary,
  PerformancePoint,
  PerformanceResponse,
  Summary,
} from '@nboard/shared';
import { GAMES, GAME_SLUGS } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import type { Actor } from '../rbac/guard.js';
import { scopeSql } from '../rbac/scope.js';

interface RoundRow {
  id: string;
  user_id: string;
  started_at: string;
  level: number;
  slug: GameSlug;
  summary_json: string;
}

function toRound(r: RoundRow): InsightSession {
  return { id: r.id, game: r.slug, level: r.level, started_at: r.started_at, summary: normalizeSummary(JSON.parse(r.summary_json) as Summary) };
}

const ROUND_SQL = `SELECT s.id, s.user_id, s.started_at, s.level, g.slug, s.summary_json
                     FROM sessions s JOIN games g ON g.id = s.game_id
                    WHERE s.status IN ('completed','interrupted') AND s.summary_json IS NOT NULL`;

/** Every completed round of one user, oldest first. */
export function roundsOf(ctx: Ctx, userId: string): InsightSession[] {
  const rows = ctx.db.prepare(`${ROUND_SQL} AND s.user_id = ? ORDER BY s.started_at, s.id`).all(userId) as RoundRow[];
  return rows.map(toRound);
}

export function perfOf(ctx: Ctx, userId: string): PerfSummary {
  return perfSummary(roundsOf(ctx, userId));
}

function meanAcc(rs: InsightSession[]) {
  return accuracyOf(aggregate(rs));
}

export function performanceFor(ctx: Ctx, userId: string): PerformanceResponse {
  const rounds = roundsOf(ctx, userId);
  const trend: PerformancePoint[] = rounds.slice(-80).map((r) => ({
    id: r.id,
    started_at: r.started_at,
    game: r.game,
    level: r.level,
    accuracy: r.summary.accuracy,
    hits: r.summary.correct_hits,
    misses: r.summary.misses,
    avg_rt: r.summary.avg_rt,
    best_rt: r.summary.best_rt,
  }));
  let comparison: PerformanceResponse['comparison'] = null;
  if (rounds.length >= 6) {
    const recent = rounds.slice(-5);
    const previous = rounds.slice(-10, -5);
    const shape = (rs: InsightSession[]) => ({ rounds: rs.length, accuracy: meanAcc(rs), avg_rt: aggregate(rs).avg_rt });
    comparison = { recent: shape(recent), previous: shape(previous) };
  }
  return {
    summary: perfSummary(rounds),
    trend,
    levels: levelPerformance(rounds),
    comparison,
    insights: insightsForPlayer(rounds),
  };
}

export function insightsForPlayerId(ctx: Ctx, userId: string): InsightsResult {
  return insightsForPlayer(roundsOf(ctx, userId));
}

/** Insights for one finished round, against the same player's earlier rounds. */
export function insightsForSessionId(ctx: Ctx, userId: string, sessionId: string): InsightsResult {
  return insightsForSession(sessionId, roundsOf(ctx, userId));
}

/** Roster-level view for the players this actor may see: Coach, Admin and Super Admin see every player. */
export function orgPerformance(ctx: Ctx, actor: Actor): OrgPerformanceResponse {
  const sc = scopeSql(actor, 'p');
  const players = ctx.db
    .prepare(
      `SELECT u.id, u.display_name, p.player_code, p.status
         FROM users u JOIN player_profiles p ON p.user_id = u.id
        WHERE u.role = 'PLAYER'${sc.sql}`,
    )
    .all(...sc.params) as { id: string; display_name: string; player_code: string; status: 'active' | 'inactive' }[];
  const ids = players.map((p) => p.id);
  const byUser = new Map<string, InsightSession[]>(ids.map((id) => [id, []]));
  if (ids.length) {
    const rows = ctx.db
      .prepare(`${ROUND_SQL} AND s.user_id IN (${ids.map(() => '?').join(',')}) ORDER BY s.started_at, s.id`)
      .all(...ids) as RoundRow[];
    for (const r of rows) byUser.get(r.user_id)?.push(toRound(r));
  }
  const now = Date.now();
  const since = now - 30 * 86_400_000;
  const recent: InsightSession[] = [];
  let active = 0;
  for (const p of players) {
    const mine = (byUser.get(p.id) ?? []).filter((r) => Date.parse(r.started_at) >= since);
    if (mine.length) active++;
    recent.push(...mine);
  }
  const total = aggregate(recent);
  const by_game = GAME_SLUGS.map((game) => {
    const rs = recent.filter((r) => r.game === game);
    const a = aggregate(rs);
    return { game, rounds: rs.length, accuracy: accuracyOf(a), avg_rt: a.avg_rt };
  }).filter((g) => g.rounds > 0);
  const attention = playersNeedingAttention(
    players.map((p) => ({ id: p.id, name: p.display_name, code: p.player_code, status: p.status, rounds: byUser.get(p.id) ?? [] })),
    now,
  );

  const insights: Insight[] = [];
  const scoped = false; // a Coach reaches every player, like an Admin
  const who = 'all players';
  if (attention.length) {
    const names = attention.slice(0, 3).map((a) => a.name).join(', ');
    insights.push({
      id: 'org-attention',
      kind: 'focus',
      game: null,
      title: `${attention.length} ${attention.length === 1 ? 'player needs' : 'players need'} attention`,
      observation: `${attention.length} of ${players.filter((p) => p.status === 'active').length} active ${who === 'all players' ? 'players' : 'players of yours'} are inactive, below 75% accuracy or trending down.`,
      evidence: `${names}${attention.length > 3 ? ` and ${attention.length - 3} more` : ''}.`,
      action: 'Open their profiles and plan a short session around the suggestions shown there.',
      goal: null,
    });
  }
  const rated = by_game.filter((g) => g.rounds >= 5 && g.accuracy !== null).sort((a, b) => a.accuracy! - b.accuracy!);
  if (rated.length >= 2 && rated[0]!.accuracy! < rated[rated.length - 1]!.accuracy! - 5) {
    const low = rated[0]!;
    const high = rated[rated.length - 1]!;
    insights.push({
      id: 'org-weak-game',
      kind: 'focus',
      game: low.game,
      title: `${GAMES[low.game].name} has the lowest accuracy`,
      observation: `Across ${who} in the last 30 days, accuracy is lowest in ${GAMES[low.game].name}.`,
      evidence: `${low.accuracy}% over ${low.rounds} rounds, against ${high.accuracy}% in ${GAMES[high.game].name} (${high.rounds} rounds).`,
      action: `Plan more ${GAMES[low.game].name} practice at manageable levels.`,
      goal: null,
    });
  }
  return {
    players: players.length,
    active_players_30d: active,
    rounds_30d: recent.length,
    accuracy_30d: accuracyOf(total),
    avg_rt_30d: total.avg_rt,
    by_game,
    attention,
    insights,
    scoped,
  };
}

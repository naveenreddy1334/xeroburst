import { GAMES, PRIMARY_METRIC, isBetter, primaryValue } from '@nboard/shared';
import type { BestDTO, GameDTO, GameSlug, GameState, Summary } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { accessRows, targetProgress } from './access.js';

interface GameRow {
  id: number;
  slug: GameSlug;
  min_level: number;
  max_level: number;
}

export function enabledGames(ctx: Ctx): GameRow[] {
  return ctx.db.prepare('SELECT id, slug, min_level, max_level FROM games WHERE enabled = 1 ORDER BY sort_order').all() as GameRow[];
}

export function gameBySlug(ctx: Ctx, slug: string): GameRow | undefined {
  return ctx.db.prepare('SELECT id, slug, min_level, max_level FROM games WHERE slug = ? AND enabled = 1').get(slug) as GameRow | undefined;
}

/** Personal best per level, from completed sessions only. */
export function bestsFor(ctx: Ctx, userId: string, gameId: number, slug: GameSlug): BestDTO[] {
  const rows = ctx.db
    .prepare(
      `SELECT level, started_at, summary_json FROM sessions
        WHERE user_id = ? AND game_id = ? AND status = 'completed' AND summary_json IS NOT NULL
        ORDER BY started_at, id`,
    )
    .all(userId, gameId) as { level: number; started_at: string; summary_json: string }[];
  const best = new Map<number, BestDTO>();
  for (const r of rows) {
    const v = primaryValue(JSON.parse(r.summary_json) as Summary);
    if (v === null) continue;
    const cur = best.get(r.level);
    if (!cur || isBetter(slug, v, cur.value)) {
      best.set(r.level, { level: r.level, value: v, metric: PRIMARY_METRIC[slug].key, achieved_at: r.started_at });
    }
  }
  return [...best.values()].sort((a, b) => a.level - b.level);
}

/** Games as one user sees them. Staff see every game as unlocked. */
export function gamesForUser(ctx: Ctx, user: { id: string; role: string }): GameDTO[] {
  const isPlayer = user.role === 'PLAYER';
  const access = isPlayer ? new Map(accessRows(ctx, user.id).map((a) => [a.slug, a])) : null;
  return enabledGames(ctx).map((g) => {
    const info = GAMES[g.slug];
    const a = access?.get(g.slug);
    const state: GameState = isPlayer ? (a?.state ?? 'locked') : 'unlocked';
    const cap = isPlayer ? Math.min(g.max_level, a?.level_cap ?? g.max_level) : g.max_level;
    const stats = ctx.db
      .prepare(
        `SELECT COUNT(*) c, MAX(started_at) last FROM sessions WHERE user_id = ? AND game_id = ? AND status = 'completed'`,
      )
      .get(user.id, g.id) as { c: number; last: string | null };
    return {
      slug: g.slug,
      name: info.name,
      tagline: info.tagline,
      accent: info.accent,
      min_level: g.min_level,
      max_level: g.max_level,
      state,
      level_cap: cap,
      sessions_count: stats.c,
      bests: state === 'locked' ? [] : bestsFor(ctx, user.id, g.id, g.slug),
      last_played_at: stats.last,
      target: a ? targetProgress(ctx, user.id, { ...a, slug: g.slug }) : null,
    };
  });
}

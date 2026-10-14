// Game access and progress (sections 17 and 18). `manual` marks rows set by hand: a program stage
// change never touches them ("manual changes always win").

import type { AccessItem, GameSlug, GameState } from '@nboard/shared';
import type { Ctx } from '../ctx.js';

interface AccessRow {
  slug: GameSlug;
  game_id: number;
  state: GameState;
  level_cap: number | null;
  target_sessions: number | null;
  target_level: number | null;
  target_accuracy: number | null;
  manual: number;
  unlocked_at: string | null;
  completed_at: string | null;
}

export function ensureAccessRows(ctx: Ctx, playerId: string): void {
  ctx.db
    .prepare(
      `INSERT OR IGNORE INTO player_game_access (player_id, game_id, state)
       SELECT ?, id, 'locked' FROM games WHERE enabled = 1`,
    )
    .run(playerId);
}

export function accessRows(ctx: Ctx, playerId: string): AccessRow[] {
  ensureAccessRows(ctx, playerId);
  return ctx.db
    .prepare(
      `SELECT g.slug, a.game_id, a.state, a.level_cap, a.target_sessions, a.target_level, a.target_accuracy,
              a.manual, a.unlocked_at, a.completed_at
         FROM player_game_access a JOIN games g ON g.id = a.game_id
        WHERE a.player_id = ? AND g.enabled = 1 ORDER BY g.sort_order`,
    )
    .all(playerId) as AccessRow[];
}

export function accessItems(ctx: Ctx, playerId: string): AccessItem[] {
  return accessRows(ctx, playerId).map((r) => ({
    game: r.slug,
    state: r.state,
    level_cap: r.level_cap,
    target_sessions: r.target_sessions,
    target_level: r.target_level,
    target_accuracy: r.target_accuracy,
    manual: !!r.manual,
    unlocked_at: r.unlocked_at,
    completed_at: r.completed_at,
  }));
}

export function getAccess(ctx: Ctx, playerId: string, slug: GameSlug): AccessRow | undefined {
  return accessRows(ctx, playerId).find((r) => r.slug === slug);
}

export interface AccessPatch {
  state?: GameState;
  level_cap?: number | null;
  target_sessions?: number | null;
  target_level?: number | null;
  target_accuracy?: number | null;
}

/** Hand-made change: the row becomes manual when the state is set. */
export function setAccess(ctx: Ctx, playerId: string, slug: GameSlug, patch: AccessPatch, byId: string): void {
  const cur = getAccess(ctx, playerId, slug);
  if (!cur) return;
  const now = new Date().toISOString();
  let { state, unlocked_at, completed_at } = { state: cur.state, unlocked_at: cur.unlocked_at, completed_at: cur.completed_at };
  let manual = cur.manual;
  if (patch.state && patch.state !== cur.state) {
    state = patch.state;
    manual = 1;
    if (state === 'locked') {
      completed_at = null;
    } else if (state === 'unlocked') {
      if (cur.state === 'locked' || !unlocked_at) unlocked_at = now;
      completed_at = null;
    } else {
      if (!unlocked_at) unlocked_at = now;
      completed_at = now;
    }
  } else if (patch.state) {
    manual = 1;
  }
  const pick = <T>(v: T | undefined, old: T): T => (v === undefined ? old : v);
  ctx.db
    .prepare(
      `UPDATE player_game_access SET state=?, level_cap=?, target_sessions=?, target_level=?, target_accuracy=?,
              manual=?, unlocked_at=?, unlocked_by=?, completed_at=? WHERE player_id=? AND game_id=?`,
    )
    .run(
      state,
      pick(patch.level_cap, cur.level_cap),
      pick(patch.target_sessions, cur.target_sessions),
      pick(patch.target_level, cur.target_level),
      pick(patch.target_accuracy, cur.target_accuracy),
      manual,
      unlocked_at,
      byId,
      completed_at,
      playerId,
      cur.game_id,
    );
}

/** Games available at a stage: everything listed on that stage and the stages before it. */
export function gamesAtStage(ctx: Ctx, programId: string, stage: number): Set<GameSlug> {
  const rows = ctx.db
    .prepare(
      `SELECT DISTINCT g.slug FROM program_stages s
         JOIN program_stage_games sg ON sg.stage_id = s.id
         JOIN games g ON g.id = sg.game_id
        WHERE s.program_id = ? AND s.stage_no <= ?`,
    )
    .all(programId, stage) as { slug: GameSlug }[];
  return new Set(rows.map((r) => r.slug));
}

/** Applies the player's current stage to every row that was not set by hand. */
export function applyProgram(ctx: Ctx, playerId: string, byId: string): void {
  const pp = ctx.db.prepare('SELECT program_id, current_stage FROM player_programs WHERE player_id = ?').get(playerId) as
    | { program_id: string; current_stage: number }
    | undefined;
  if (!pp) return;
  const available = gamesAtStage(ctx, pp.program_id, pp.current_stage);
  const now = new Date().toISOString();
  const upd = ctx.db.prepare(
    'UPDATE player_game_access SET state=?, unlocked_at=?, unlocked_by=?, completed_at=? WHERE player_id=? AND game_id=?',
  );
  for (const r of accessRows(ctx, playerId)) {
    if (r.manual) continue;
    if (available.has(r.slug)) {
      if (r.state === 'locked') upd.run('unlocked', now, byId, null, playerId, r.game_id);
    } else if (r.state !== 'locked') {
      upd.run('locked', r.unlocked_at, byId, null, playerId, r.game_id);
    }
  }
}

/** Sessions that count towards a game's target, since it was last unlocked. */
export function targetProgress(
  ctx: Ctx,
  playerId: string,
  row: { slug: GameSlug; game_id: number; target_sessions: number | null; target_level: number | null; target_accuracy: number | null; unlocked_at: string | null },
): { sessions: number; level: number; accuracy: number; done: number } | null {
  if (row.target_sessions === null && row.target_level === null && row.target_accuracy === null) return null;
  const sessions = row.target_sessions ?? 1;
  const level = row.target_level ?? 1;
  const accuracy = row.target_accuracy ?? 0;
  const rows = ctx.db
    .prepare(
      `SELECT summary_json FROM sessions
        WHERE user_id = ? AND game_id = ? AND status = 'completed' AND level >= ? AND started_at >= ?`,
    )
    .all(playerId, row.game_id, level, row.unlocked_at ?? '') as { summary_json: string | null }[];
  let done = 0;
  for (const r of rows) {
    if (!r.summary_json) continue;
    const s = JSON.parse(r.summary_json) as { accuracy: number };
    if (s.accuracy >= accuracy) done++;
  }
  return { sessions, level, accuracy, done };
}

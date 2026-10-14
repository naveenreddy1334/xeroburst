import type { AccessItem, PlayerDetail, PlayerListItem, PlayerProgramDTO, ProgramDTO, UserDTO, Permission, Role, GameSlug } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { loadGrants } from '../rbac/guard.js';
import { getProgram, playerProgram } from './programs.js';
import { accessItems } from './access.js';
import { perfOf } from './performance.js';
import { hubRef } from './hubs.js';

export interface UserRow {
  id: string;
  login_id: string;
  display_name: string;
  role: Role;
  is_active: number;
  must_change_password: number;
  created_at: string;
  last_login_at: string | null;
  locked_until: string | null;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  inactive_reason?: string | null;
  hub_id?: string | null;
}

export const USER_COLS =
  'id, login_id, display_name, role, is_active, must_change_password, created_at, last_login_at, locked_until, email, phone, age, inactive_reason, hub_id';

export function userDTO(ctx: Ctx, u: UserRow): UserDTO {
  const dto: UserDTO = {
    id: u.id,
    login_id: u.login_id,
    display_name: u.display_name,
    role: u.role,
    is_active: !!u.is_active,
    must_change_password: !!u.must_change_password,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
    grants: loadGrants(ctx, u.id) as Permission[],
    email: u.email ?? null,
    phone: u.phone ?? null,
    age: u.age ?? null,
    inactive_reason: u.is_active ? null : u.inactive_reason ?? null,
    hub: hubRef(ctx, u.hub_id),
  };
  if (u.role === 'COACH') {
    dto.players_count = (ctx.db.prepare('SELECT COUNT(*) c FROM player_profiles WHERE coach_id = ?').get(u.id) as { c: number }).c;
  }
  if (u.locked_until && Date.parse(u.locked_until) > Date.now()) dto.locked_until = u.locked_until;
  return dto;
}

export function playerListItem(ctx: Ctx, row: Record<string, unknown>): PlayerListItem {
  const stageCount = row.stage_count as number | null;
  const stage = row.stage as number | null;
  return {
    id: row.id as string,
    hub: hubRef(ctx, row.hub_id as string | null),
    player_code: row.player_code as string,
    display_name: row.display_name as string,
    age: (row.age as number | null) ?? null,
    status: row.status as 'active' | 'inactive',
    pin_reset_requested: !!row.pin_reset_requested,
    inactive_reason: row.status === 'inactive' ? ((row.inactive_reason as string | null) ?? null) : null,
    coach: row.coach_id ? { id: row.coach_id as string, name: row.coach_name as string } : null,
    games_unlocked: (row.games_unlocked as number) ?? 0,
    games_total: (row.games_total as number) ?? 0,
    stage: stage ?? null,
    stage_count: stageCount ?? null,
    progress_pct: stage && stageCount ? Math.round((stage / stageCount) * 100) : null,
    program_name: (row.program_name as string | null) ?? null,
    last_session_at: (row.last_session_at as string | null) ?? null,
    perf: perfOf(ctx, row.id as string),
  };
}

export const PLAYER_LIST_SQL = `
  SELECT u.id, u.hub_id, u.display_name, p.player_code, p.age, p.status, u.inactive_reason, p.pin_reset_requested, p.coach_id, c.display_name AS coach_name,
         (SELECT COUNT(*) FROM player_game_access a JOIN games g ON g.id = a.game_id
           WHERE a.player_id = u.id AND g.enabled = 1 AND a.state IN ('unlocked','completed')) AS games_unlocked,
         (SELECT COUNT(*) FROM games WHERE enabled = 1) AS games_total,
         pp.current_stage AS stage,
         (SELECT COUNT(*) FROM program_stages s WHERE s.program_id = pp.program_id) AS stage_count,
         pr.name AS program_name,
         (SELECT MAX(s.started_at) FROM sessions s WHERE s.user_id = u.id AND s.status <> 'started') AS last_session_at
    FROM users u
    JOIN player_profiles p ON p.user_id = u.id
    JOIN users c ON c.id = p.coach_id
    LEFT JOIN player_programs pp ON pp.player_id = u.id
    LEFT JOIN programs pr ON pr.id = pp.program_id
   WHERE u.role = 'PLAYER'`;

export function playerDetail(ctx: Ctx, id: string): PlayerDetail | null {
  const row = ctx.db.prepare(`${PLAYER_LIST_SQL} AND u.id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const extra = ctx.db
    .prepare(
      `SELECT p.weight_kg, p.notes, u.created_at, u.locked_until FROM users u JOIN player_profiles p ON p.user_id = u.id WHERE u.id = ?`,
    )
    .get(id) as { weight_kg: number | null; notes: string | null; created_at: string; locked_until: string | null };
  const program: PlayerProgramDTO | null = playerProgram(ctx, id);
  const access: AccessItem[] = accessItems(ctx, id);
  return {
    ...playerListItem(ctx, row),
    weight_kg: extra.weight_kg,
    notes: extra.notes,
    created_at: extra.created_at,
    access,
    program,
    is_locked: !!extra.locked_until && Date.parse(extra.locked_until) > Date.now(),
  };
}

export type { ProgramDTO, GameSlug };
export { getProgram };

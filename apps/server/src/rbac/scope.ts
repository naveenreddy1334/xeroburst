// Scope: which data an actor may reach. Super Admins and Admins reach every player; a Coach reaches the players of their own hub; a Player reaches nobody but themselves. Rank: only strictly lower roles can be managed.

import { canManageRole, outranks } from '@nboard/shared';
import type { Role } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError, notFound } from '../errors.js';
import type { Actor } from './guard.js';

export interface PlayerRow {
  id: string;
  login_id: string;
  display_name: string;
  is_active: number;
  player_code: string;
  coach_id: string;
  age: number | null;
  weight_kg: number | null;
  notes: string | null;
  status: 'active' | 'inactive';
  created_at: string;
}

export function loadPlayer(ctx: Ctx, id: string): PlayerRow | undefined {
  return ctx.db
    .prepare(
      `SELECT u.id, u.login_id, u.display_name, u.is_active, u.created_at,
              p.player_code, p.coach_id, p.age, p.weight_kg, p.notes, p.status
         FROM users u JOIN player_profiles p ON p.user_id = u.id
        WHERE u.id = ? AND u.role = 'PLAYER'`,
    )
    .get(id) as PlayerRow | undefined;
}

/** Throws NOT_FOUND or OUT_OF_SCOPE. Returns the player row. */
export function playerInScope(ctx: Ctx, actor: Actor, id: string): PlayerRow {
  const p = loadPlayer(ctx, id);
  if (!p) throw notFound('Player');
  if (actor.role === 'PLAYER') throw new ApiError('OUT_OF_SCOPE');
  if (actor.role === 'COACH' && actor.hub_id) {
    const h = ctx.db.prepare('SELECT hub_id FROM users WHERE id = ?').get(id) as { hub_id: string | null } | undefined;
    if (h?.hub_id !== actor.hub_id) throw new ApiError('OUT_OF_SCOPE');
  }
  return p;
}

/** SQL for "players this actor may see", with the alias of player_profiles. */
export function scopeSql(actor: Actor, alias = 'p'): { sql: string; params: string[] } {
  if (actor.role === 'PLAYER') return { sql: ' AND 0', params: [] };
  // A Coach who belongs to a hub sees that hub's players only. Admins and Super Admins see every hub. A Coach with no hub yet
  // (accounts from before hubs) keeps seeing everyone until a Super Admin assigns them.
  if (actor.role === 'COACH' && actor.hub_id) {
    return { sql: ` AND EXISTS (SELECT 1 FROM users hu WHERE hu.id = ${alias}.user_id AND hu.hub_id = ?)`, params: [actor.hub_id] };
  }
  return { sql: '', params: [] };
}

/** The target account must be of strictly lower rank, and the actor must hold the MANAGE permission. */
export function assertCanManage(actor: Actor, target: Role): void {
  if (!outranks(actor.role, target)) throw new ApiError('ROLE_RANK');
  if (!canManageRole(actor, target)) throw new ApiError('FORBIDDEN');
}

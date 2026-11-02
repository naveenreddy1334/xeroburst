// Scope: which data an actor may reach. Super Admins and Admins reach every player; a Hub Manager their hub; a Branch Manager their branch; a Coach their branch or hub; a Player reaches nobody but themselves. Rank: only strictly lower roles can be managed.

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

/** Roles whose reach is limited to their own part of the organization. Admin and Super Admin are not in this list. */
export type ScopedRole = 'COACH' | 'HUB_MANAGER' | 'BRANCH_MANAGER';
export const isScopedStaff = (role: Role): role is ScopedRole => role === 'COACH' || role === 'HUB_MANAGER' || role === 'BRANCH_MANAGER';

export type OrgScope = { kind: 'all' } | { kind: 'hub'; id: string } | { kind: 'branch'; id: string } | { kind: 'none' };

/**
 * The part of the organization an actor reaches, decided from the stored account, never from anything the client sends.
 *  - Super Admin and Admin: everything.
 *  - Hub Manager: their hub (a manager with no hub yet reaches nothing).
 *  - Branch Manager: their branch (none assigned: nothing).
 *  - Coach: their branch if they have one, else their hub; a Coach with neither (accounts from before hubs) keeps the old reach.
 *  - Player: nothing.
 */
export function orgScope(actor: Actor): OrgScope {
  switch (actor.role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return { kind: 'all' };
    case 'HUB_MANAGER':
      return actor.hub_id ? { kind: 'hub', id: actor.hub_id } : { kind: 'none' };
    case 'BRANCH_MANAGER':
      return actor.branch_id ? { kind: 'branch', id: actor.branch_id } : { kind: 'none' };
    case 'COACH':
      if (actor.branch_id) return { kind: 'branch', id: actor.branch_id };
      return actor.hub_id ? { kind: 'hub', id: actor.hub_id } : { kind: 'all' };
    default:
      return { kind: 'none' };
  }
}

/** SQL fragment limiting a users alias to the actor's scope. */
export function userScopeSql(actor: Actor, userAlias: string): { sql: string; params: string[] } {
  const sc = orgScope(actor);
  if (sc.kind === 'all') return { sql: '', params: [] };
  if (sc.kind === 'none') return { sql: ' AND 0', params: [] };
  return { sql: ` AND ${userAlias}.${sc.kind === 'hub' ? 'hub_id' : 'branch_id'} = ?`, params: [sc.id] };
}

/** Does this user row fall inside the actor's scope? */
export function inOrgScope(actor: Actor, row: { hub_id: string | null; branch_id: string | null }): boolean {
  const sc = orgScope(actor);
  if (sc.kind === 'all') return true;
  if (sc.kind === 'none') return false;
  return (sc.kind === 'hub' ? row.hub_id : row.branch_id) === sc.id;
}

/** Throws NOT_FOUND or OUT_OF_SCOPE. Returns the player row. */
export function playerInScope(ctx: Ctx, actor: Actor, id: string): PlayerRow {
  const p = loadPlayer(ctx, id);
  if (!p) throw notFound('Player');
  if (actor.role === 'PLAYER') throw new ApiError('OUT_OF_SCOPE');
  if (orgScope(actor).kind !== 'all') {
    const h = ctx.db.prepare('SELECT hub_id, branch_id FROM users WHERE id = ?').get(id) as { hub_id: string | null; branch_id: string | null } | undefined;
    if (!h || !inOrgScope(actor, h)) throw new ApiError('OUT_OF_SCOPE');
  }
  return p;
}

/** SQL for "players this actor may see", with the alias of player_profiles. */
export function scopeSql(actor: Actor, alias = 'p'): { sql: string; params: string[] } {
  if (actor.role === 'PLAYER') return { sql: ' AND 0', params: [] };
  const sc = orgScope(actor);
  if (sc.kind === 'all') return { sql: '', params: [] };
  if (sc.kind === 'none') return { sql: ' AND 0', params: [] };
  const col = sc.kind === 'hub' ? 'hub_id' : 'branch_id';
  return { sql: ` AND EXISTS (SELECT 1 FROM users hu WHERE hu.id = ${alias}.user_id AND hu.${col} = ?)`, params: [sc.id] };
}

/** A staff account the actor may manage must be inside their scope as well as below their rank. */
export function staffInScope(actor: Actor, row: { hub_id: string | null; branch_id: string | null }): void {
  if (!inOrgScope(actor, row)) throw new ApiError('OUT_OF_SCOPE');
}

/** The target account must be of strictly lower rank, and the actor must hold the MANAGE permission. */
export function assertCanManage(actor: Actor, target: Role): void {
  if (!outranks(actor.role, target)) throw new ApiError('ROLE_RANK');
  if (!canManageRole(actor, target)) throw new ApiError('FORBIDDEN');
}
// Organization: hub -> (academy) -> (branch) -> coaches -> players.
// Academies and branches are optional. A hub with neither is "single": its coaches sit directly under it. A hub may also have
// branches without an academy. Everything here returns counts and staff names only, never an individual player's data.

import type { OrgAcademy, OrgBranch, OrgHub, OrgPerson, OrgTree, Role } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError } from '../errors.js';
import type { Actor } from '../rbac/guard.js';
import { hubExists } from './hubs.js';
import { orgScope } from '../rbac/scope.js';

export function branchHub(ctx: Ctx, branchId: string): string | null {
  const r = ctx.db.prepare('SELECT hub_id FROM branches WHERE id = ? AND is_active = 1').get(branchId) as { hub_id: string } | undefined;
  return r?.hub_id ?? null;
}

export function academyHub(ctx: Ctx, academyId: string): string | null {
  const r = ctx.db.prepare('SELECT hub_id FROM academies WHERE id = ? AND is_active = 1').get(academyId) as { hub_id: string } | undefined;
  return r?.hub_id ?? null;
}

export function branchRef(ctx: Ctx, id: string | null | undefined): { id: string; name: string } | null {
  if (!id) return null;
  return (ctx.db.prepare('SELECT id, name FROM branches WHERE id = ?').get(id) as { id: string; name: string } | undefined) ?? null;
}

interface StaffRow {
  id: string;
  display_name: string;
  login_id: string;
  role: string;
  is_active: number;
  hub_id: string | null;
  branch_id: string | null;
}

const person = (r: StaffRow): OrgPerson => ({ id: r.id, name: r.display_name, login_id: r.login_id, active: !!r.is_active });

export function buildOrgTree(ctx: Ctx, actor: Actor): OrgTree {
  const sc = orgScope(actor);
  const hubRows = ctx.db.prepare('SELECT id, name, city, is_active FROM hubs ORDER BY is_active DESC, name COLLATE NOCASE').all() as {
    id: string;
    name: string;
    city: string | null;
    is_active: number;
  }[];
  const academyRows = ctx.db.prepare('SELECT id, hub_id, name, is_active FROM academies ORDER BY name COLLATE NOCASE').all() as {
    id: string;
    hub_id: string;
    name: string;
    is_active: number;
  }[];
  const branchRows = ctx.db.prepare('SELECT id, hub_id, academy_id, name, city, is_active FROM branches ORDER BY name COLLATE NOCASE').all() as {
    id: string;
    hub_id: string;
    academy_id: string | null;
    name: string;
    city: string | null;
    is_active: number;
  }[];
  const staff = ctx.db
    .prepare(
      `SELECT id, display_name, login_id, role, is_active, hub_id, branch_id FROM users
        WHERE role IN ('HUB_MANAGER','BRANCH_MANAGER','COACH') ORDER BY display_name COLLATE NOCASE`,
    )
    .all() as StaffRow[];
  const playerRows = ctx.db
    .prepare(
      `SELECT u.hub_id, u.branch_id, COUNT(*) AS total,
              SUM(CASE WHEN p.status = 'active' AND u.is_active = 1 THEN 1 ELSE 0 END) AS active
         FROM users u JOIN player_profiles p ON p.user_id = u.id GROUP BY u.hub_id, u.branch_id`,
    )
    .all() as { hub_id: string | null; branch_id: string | null; total: number; active: number }[];

  const playersIn = (pred: (r: (typeof playerRows)[number]) => boolean) =>
    playerRows.filter(pred).reduce((a, r) => ({ total: a.total + r.total, active: a.active + (r.active ?? 0) }), { total: 0, active: 0 });

  const mkBranch = (b: (typeof branchRows)[number]): OrgBranch => {
    const pl = playersIn((r) => r.branch_id === b.id);
    return {
      id: b.id,
      hub_id: b.hub_id,
      academy_id: b.academy_id,
      name: b.name,
      city: b.city,
      is_active: !!b.is_active,
      managers: staff.filter((s) => s.role === 'BRANCH_MANAGER' && s.branch_id === b.id).map(person),
      coaches: staff.filter((s) => s.role === 'COACH' && s.branch_id === b.id).map(person),
      players: pl.total,
      active_players: pl.active,
    };
  };

  const hubs: OrgHub[] = [];
  for (const h of hubRows) {
    if (sc.kind === 'hub' && sc.id !== h.id) continue;
    const myBranchRows = branchRows.filter((b) => b.hub_id === h.id && (sc.kind !== 'branch' || sc.id === b.id));
    if (sc.kind === 'branch' && !myBranchRows.length) continue;
    const branches = myBranchRows.map(mkBranch);
    const academies: OrgAcademy[] = academyRows
      .filter((a) => a.hub_id === h.id)
      .map((a) => {
        const bs = branches.filter((b) => b.academy_id === a.id);
        return {
          id: a.id,
          hub_id: a.hub_id,
          name: a.name,
          is_active: !!a.is_active,
          branches: bs,
          players: bs.reduce((n, b) => n + b.players, 0),
          coaches: bs.reduce((n, b) => n + b.coaches.filter((c) => c.active).length, 0),
        };
      })
      // A Branch Manager sees only the academy that holds their branch.
      .filter((a) => sc.kind !== 'branch' || a.branches.length > 0);
    const looseBranches = branches.filter((b) => !b.academy_id);
    const whole = sc.kind !== 'branch';
    const direct = whole ? staff.filter((s) => s.role === 'COACH' && s.hub_id === h.id && !s.branch_id).map(person) : [];
    const pl = whole ? playersIn((r) => r.hub_id === h.id) : { total: branches.reduce((n, b) => n + b.players, 0), active: branches.reduce((n, b) => n + b.active_players, 0) };
    const coachCount = whole
      ? staff.filter((s) => s.role === 'COACH' && s.hub_id === h.id && s.is_active).length
      : branches.reduce((n, b) => n + b.coaches.filter((c) => c.active).length, 0);
    hubs.push({
      id: h.id,
      name: h.name,
      city: h.city,
      is_active: !!h.is_active,
      structure: academies.length || branches.length ? 'academies' : 'single',
      managers: whole ? staff.filter((s) => s.role === 'HUB_MANAGER' && s.hub_id === h.id).map(person) : [],
      academies,
      branches: looseBranches,
      direct_coaches: direct,
      players: pl.total,
      active_players: pl.active,
      coaches: coachCount,
    });
  }

  const allBranches = hubs.reduce((n, h) => n + h.branches.length + h.academies.reduce((m, a) => m + a.branches.length, 0), 0);
  return {
    hubs,
    totals: {
      hubs: hubs.length,
      academies: hubs.reduce((n, h) => n + h.academies.length, 0),
      branches: allBranches,
      coaches: hubs.reduce((n, h) => n + h.coaches, 0),
      players: hubs.reduce((n, h) => n + h.players, 0),
      active_players: hubs.reduce((n, h) => n + h.active_players, 0),
    },
  };
}

// ---- placing staff -----------------------------------------------------------------------------------------------------

/**
 * Validates where a staff account may be placed and returns the hub and branch to store. The actor's reach limits the choice
 * (a Hub Manager can only place people in their own hub, a Branch Manager only in their own branch) and the account's role limits
 * the shape: a Hub Manager belongs to a hub only, a Branch Manager must have a branch, a Coach may sit under the hub directly.
 */
export function placementFor(
  ctx: Ctx,
  actor: Actor,
  targetRole: Role,
  hubId: string | null,
  branchId: string | null,
): { hub_id: string | null; branch_id: string | null } {
  const fail = (field: string, msg: string): never => {
    throw new ApiError('VALIDATION', { fields: { [field]: msg } });
  };
  if (!hubId) {
    if (branchId) fail('branch_id', 'Choose a hub before a branch.');
    if (targetRole === 'HUB_MANAGER' || targetRole === 'BRANCH_MANAGER') fail('hub_id', 'Choose a hub.');
    if (orgScope(actor).kind !== 'all') throw new ApiError('OUT_OF_SCOPE');
    return { hub_id: null, branch_id: null };
  }
  if (!hubExists(ctx, hubId)) fail('hub_id', 'Choose an active hub.');
  const sc = orgScope(actor);
  if ((sc.kind === 'hub' && sc.id !== hubId) || (sc.kind === 'branch' && actor.hub_id !== hubId) || sc.kind === 'none') throw new ApiError('OUT_OF_SCOPE');
  if (branchId) {
    const bh = branchHub(ctx, branchId);
    if (!bh || bh !== hubId) fail('branch_id', 'Choose an active branch of this hub.');
    if (sc.kind === 'branch' && sc.id !== branchId) throw new ApiError('OUT_OF_SCOPE');
  }
  if (sc.kind === 'branch' && !branchId) throw new ApiError('OUT_OF_SCOPE');
  if (targetRole === 'HUB_MANAGER' && branchId) fail('branch_id', 'A Hub Manager belongs to the hub, not to one branch.');
  if (targetRole === 'BRANCH_MANAGER' && !branchId) fail('branch_id', 'Choose the branch this manager runs.');
  return { hub_id: hubId, branch_id: branchId };
}
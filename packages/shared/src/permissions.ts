// Roles, permissions and the rules about who may manage whom.
// This file is the single source of truth: the server enforces it and the app mirrors it.
// Code must ask can(user, PERMISSION). It must never write `if (role === "COACH")`.

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'COACH', 'PLAYER'] as const;
export type Role = (typeof ROLES)[number];

/** Rank decides who may manage whom. Scope decides which data a person can see. */
export const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  COACH: 2,
  PLAYER: 1,
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  COACH: 'Coach',
  PLAYER: 'Player',
};

export const PERMISSIONS = [
  'MANAGE_SYSTEM',
  'MANAGE_ADMINS',
  'MANAGE_COACHES',
  'CREATE_COACHES',
  'MANAGE_PLAYERS',
  'MANAGE_GAME_ACCESS',
  'MANAGE_GAME_PROGRESS',
  'MANAGE_PROGRAMS',
  'VIEW_RESULTS',
  'VIEW_AUDIT',
  'MANAGE_HUBS',
  'PLAY_GAME',
  'VIEW_OWN_RESULTS',
  'VIEW_OWN_PROGRESS',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_HELP: Record<Permission, string> = {
  MANAGE_SYSTEM: 'Server settings, backup, system screen',
  MANAGE_ADMINS: 'Create, edit and deactivate Admin accounts',
  MANAGE_COACHES: 'Create, edit and deactivate Coaches, reassign players',
  CREATE_COACHES: 'Create Coach accounts only',
  MANAGE_PLAYERS: 'Create and edit players, reset credentials',
  MANAGE_GAME_ACCESS: 'Set each player\'s state per game and level caps',
  MANAGE_GAME_PROGRESS: 'Advance or step back a player\'s training stage',
  MANAGE_PROGRAMS: 'Create and edit training programs',
  VIEW_RESULTS: 'View results and analytics of players in scope',
  VIEW_AUDIT: 'View the audit log',
  MANAGE_HUBS: 'Create hubs, assign people to them, compare hubs',
  PLAY_GAME: 'Start sessions and play',
  VIEW_OWN_RESULTS: 'View one\'s own results',
  VIEW_OWN_PROGRESS: 'View one\'s own game states and stage',
};

/** Section 12.2. CREATE_COACHES is not here for COACH: it is an individual grant. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Hierarchy: Super Admin (complete control) > Coach (trains and manages their own players) > Player.
  // The Super Admin holds every permission, so nothing operational is hidden from it: it can play, configure
  // games, manage programs and see every player. ADMIN is kept as a legacy tier for existing accounts.
  SUPER_ADMIN: [
    'MANAGE_SYSTEM',
    'MANAGE_ADMINS',
    'MANAGE_COACHES',
    'CREATE_COACHES',
    'MANAGE_PLAYERS',
    'MANAGE_GAME_ACCESS',
    'MANAGE_GAME_PROGRESS',
    'MANAGE_PROGRAMS',
    'VIEW_RESULTS',
    'VIEW_AUDIT',
    'MANAGE_HUBS',
    'PLAY_GAME',
    'VIEW_OWN_RESULTS',
    'VIEW_OWN_PROGRESS',
  ],
  ADMIN: [
    'MANAGE_COACHES',
    'CREATE_COACHES',
    'MANAGE_PLAYERS',
    'MANAGE_GAME_ACCESS',
    'MANAGE_GAME_PROGRESS',
    'MANAGE_PROGRAMS',
    'VIEW_RESULTS',
    'VIEW_AUDIT',
    'MANAGE_HUBS',
    'PLAY_GAME',
    'VIEW_OWN_RESULTS',
  ],
  COACH: [
    'MANAGE_PLAYERS',
    'MANAGE_GAME_ACCESS',
    'MANAGE_GAME_PROGRESS',
    'MANAGE_PROGRAMS',
    'VIEW_RESULTS',
    'PLAY_GAME',
    'VIEW_OWN_RESULTS',
  ],
  PLAYER: ['PLAY_GAME', 'VIEW_OWN_RESULTS', 'VIEW_OWN_PROGRESS'],
};

/** Kept for reference. A Coach now reaches every player: scope is no longer limited to assigned players. */
export const SCOPED_PERMISSIONS: readonly Permission[] = [
  'MANAGE_PLAYERS',
  'MANAGE_GAME_ACCESS',
  'MANAGE_GAME_PROGRESS',
  'MANAGE_PROGRAMS',
  'VIEW_RESULTS',
];

/** Individual grants an Admin may give to a Coach. */
export const GRANTABLE_PERMISSIONS: readonly Permission[] = ['CREATE_COACHES'];

export interface Actor {
  role: Role;
  /** Effective permission list (role permissions plus grants), as returned by the server. */
  permissions?: readonly Permission[];
}

/** Effective permissions for a role plus individually granted ones. */
export function permissionsFor(
  role: Role,
  grants: readonly Permission[] = [],
  roleMap: Record<Role, readonly Permission[]> = ROLE_PERMISSIONS,
): Permission[] {
  const set = new Set<Permission>(roleMap[role]);
  for (const g of grants) if (GRANTABLE_PERMISSIONS.includes(g)) set.add(g);
  return PERMISSIONS.filter((p) => set.has(p));
}

export function can(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor) return false;
  const list = actor.permissions ?? ROLE_PERMISSIONS[actor.role];
  return list.includes(permission);
}

export function canAny(actor: Actor | null | undefined, ...permissions: Permission[]): boolean {
  return permissions.some((p) => can(actor, p));
}

/** Strictly higher rank. */
export function outranks(actor: Role, target: Role): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

/**
 * Section 13.1, "Create an account": the creator must outrank the new role,
 * except that a Coach holding CREATE_COACHES may create Coaches.
 * A Super Admin is never created through the API.
 */
export function canCreateRole(actor: Actor, target: Role): boolean {
  switch (target) {
    case 'SUPER_ADMIN':
      return false;
    case 'ADMIN':
      return can(actor, 'MANAGE_ADMINS') && outranks(actor.role, 'ADMIN');
    case 'COACH':
      return (
        (can(actor, 'MANAGE_COACHES') && outranks(actor.role, 'COACH')) ||
        can(actor, 'CREATE_COACHES')
      );
    case 'PLAYER':
      return can(actor, 'MANAGE_PLAYERS');
  }
}

/** Edit, deactivate or reset: only strictly lower rank, with the matching MANAGE permission. */
export function canManageRole(actor: Actor, target: Role): boolean {
  if (!outranks(actor.role, target)) return false;
  switch (target) {
    case 'SUPER_ADMIN':
      return false;
    case 'ADMIN':
      return can(actor, 'MANAGE_ADMINS');
    case 'COACH':
      return can(actor, 'MANAGE_COACHES');
    case 'PLAYER':
      return can(actor, 'MANAGE_PLAYERS');
  }
}

/** Section 23: menu entries, built from permissions. A convenience for the UI; the server decides. */
export type MenuId =
  | 'dashboard'
  | 'modules'
  | 'players'
  | 'programs'
  | 'results'
  | 'leaderboard'
  | 'coaches'
  | 'admins'
  | 'hubs'
  | 'audit'
  | 'system'
  | 'settings';

export const MENU_ORDER: MenuId[] = [
  'dashboard',
  'modules',
  'players',
  'coaches',
  'admins',
  'hubs',
  'programs',
  'results',
  'leaderboard',
  'audit',
  'system',
  'settings',
];

export function menuFor(actor: Actor | null | undefined): MenuId[] {
  if (!actor) return [];
  return MENU_ORDER.filter((id) => {
    switch (id) {
      case 'dashboard':
      case 'results':
      case 'settings':
        return true;
      case 'modules':
        return can(actor, 'PLAY_GAME');
      case 'players':
        return can(actor, 'MANAGE_PLAYERS');
      case 'programs':
        return can(actor, 'MANAGE_PROGRAMS');
      case 'leaderboard':
        return can(actor, 'VIEW_RESULTS');
      case 'coaches':
        return can(actor, 'MANAGE_COACHES');
      case 'admins':
        return can(actor, 'MANAGE_ADMINS');
      case 'hubs':
        return can(actor, 'MANAGE_HUBS');
      case 'audit':
        return can(actor, 'VIEW_AUDIT');
      case 'system':
        return can(actor, 'MANAGE_SYSTEM');
    }
  });
}

export function isStaff(role: Role): boolean {
  return role !== 'PLAYER';
}

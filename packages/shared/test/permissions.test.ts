import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS, ROLE_PERMISSIONS, can, canCreateRole, canManageRole, menuFor, outranks, permissionsFor,
  isSimplePin, validatePin, validateStaffPassword,
} from '../src';

const sa = { role: 'SUPER_ADMIN' as const };
const ad = { role: 'ADMIN' as const };
const co = { role: 'COACH' as const };
const coGranted = { role: 'COACH' as const, permissions: permissionsFor('COACH', ['CREATE_COACHES']) };
const pl = { role: 'PLAYER' as const };

describe('role to permission matrix (section 12.2)', () => {
  it('Super Admin has complete control: every permission, system and operational', () => {
    for (const p of PERMISSIONS) expect(can(sa, p), p).toBe(true);
  });
  it('Coach cannot do Super Admin-only things', () => {
    for (const p of ['MANAGE_SYSTEM', 'MANAGE_ADMINS', 'MANAGE_COACHES', 'CREATE_COACHES', 'VIEW_AUDIT'] as const) {
      expect(can(co, p), p).toBe(false);
    }
  });
  it('Admin cannot manage the system or other Admins', () => {
    expect(can(ad, 'MANAGE_SYSTEM')).toBe(false);
    expect(can(ad, 'MANAGE_ADMINS')).toBe(false);
    expect(can(ad, 'MANAGE_COACHES')).toBe(true);
    expect(can(ad, 'VIEW_AUDIT')).toBe(true);
  });
  it('Coach has scoped player tools but no staff tools by default', () => {
    expect(can(co, 'MANAGE_PLAYERS')).toBe(true);
    expect(can(co, 'MANAGE_COACHES')).toBe(false);
    expect(can(co, 'CREATE_COACHES')).toBe(false);
    expect(can(co, 'VIEW_AUDIT')).toBe(false);
  });
  it('Player can only play, see own results and own progress', () => {
    expect(ROLE_PERMISSIONS.PLAYER).toEqual(['PLAY_GAME', 'VIEW_OWN_RESULTS', 'VIEW_OWN_PROGRESS']);
    expect(can(pl, 'MANAGE_PLAYERS')).toBe(false);
    expect(can(pl, 'VIEW_RESULTS')).toBe(false);
  });
  it('anything a Coach can do, an Admin can do (inheritance); the Super Admin keeps only the system-level part', () => {
    for (const p of ROLE_PERMISSIONS.COACH) expect(ROLE_PERMISSIONS.ADMIN).toContain(p);
    for (const p of ['MANAGE_PLAYERS', 'VIEW_RESULTS'] as const) expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(p);
  });
});

describe('rank rules (section 13.1)', () => {
  it('outranks is strict', () => {
    expect(outranks('ADMIN', 'COACH')).toBe(true);
    expect(outranks('COACH', 'COACH')).toBe(false);
    expect(outranks('COACH', 'ADMIN')).toBe(false);
  });
  it('who may create whom', () => {
    expect(canCreateRole(sa, 'ADMIN')).toBe(true);
    expect(canCreateRole(sa, 'SUPER_ADMIN')).toBe(false);
    expect(canCreateRole(ad, 'ADMIN')).toBe(false);
    expect(canCreateRole(ad, 'COACH')).toBe(true);
    expect(canCreateRole(co, 'COACH')).toBe(false);
    expect(canCreateRole(coGranted, 'COACH')).toBe(true);
    expect(canCreateRole(coGranted, 'ADMIN')).toBe(false);
    expect(canCreateRole(co, 'PLAYER')).toBe(true);
    expect(canCreateRole(pl, 'PLAYER')).toBe(false);
  });
  it('only lower ranks can be managed', () => {
    expect(canManageRole(ad, 'SUPER_ADMIN')).toBe(false);
    expect(canManageRole(ad, 'ADMIN')).toBe(false);
    expect(canManageRole(ad, 'COACH')).toBe(true);
    expect(canManageRole(co, 'COACH')).toBe(false);
    expect(canManageRole(co, 'PLAYER')).toBe(true);
    expect(canManageRole(coGranted, 'COACH')).toBe(false);
    expect(canManageRole(sa, 'ADMIN')).toBe(true);
  });
});

describe('menu by role (section 23)', () => {
  it('Player sees no staff entries', () => {
    expect(menuFor(pl)).toEqual(['modules', 'results', 'settings']);
  });
  it('Coach sees players and programs', () => {
    expect(menuFor(co)).toEqual(['dashboard', 'modules', 'players', 'programs', 'results', 'settings']);
  });
  it('Admin adds coaches and audit', () => {
    expect(menuFor(ad)).toEqual(['dashboard', 'modules', 'players', 'coaches', 'hubs', 'programs', 'results', 'audit', 'settings']);
  });
  it('Super Admin sees every menu, including Modules and Programs', () => {
    expect(menuFor(sa)).toEqual(['dashboard', 'modules', 'players', 'coaches', 'admins', 'hubs', 'programs', 'results', 'audit', 'system', 'settings']);
  });
  it('Admin, Coach and Player menus are unchanged', () => {
    expect(menuFor(ad)).toEqual(['dashboard', 'modules', 'players', 'coaches', 'hubs', 'programs', 'results', 'audit', 'settings']);
    expect(menuFor(co)).toContain('modules');
    expect(menuFor(co)).toContain('programs');
    expect(menuFor(pl)).toEqual(['modules', 'results', 'settings']);
  });
});

describe('credentials', () => {
  it('rejects simple PINs', () => {
    for (const p of ['000000', '123456', '654321', '121212', '111111']) expect(isSimplePin(p)).toBe(true);
    for (const p of ['482915', '730184']) expect(isSimplePin(p)).toBe(false);
  });
  it('validates PIN and staff password', () => {
    expect(validatePin('12345')).toMatch(/at least 6/);
    expect(validatePin('482915')).toBeNull();
    expect(validateStaffPassword('short1')).toMatch(/10/);
    expect(validateStaffPassword('abcdefghijkl')).toMatch(/number/);
    expect(validateStaffPassword('Coach#Pass2026')).toBeNull();
  });
});
// Request body schemas (zod), shared by the server (validation) and the app (forms).

import { z } from 'zod';
import { GAME_SLUGS } from './games';
import { LOGIN_ID_PATTERN } from './credentials';

const gameSlug = z.enum(GAME_SLUGS);
const idStr = z.string().min(1).max(64);
const isoDate = z.string().min(10).max(40);

// Mandatory-field rules, one place, used by the server and by every form in the app.
export const personName = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(80, 'Name is too long.')
  .refine((s) => s.length < 2 || /\p{L}/u.test(s), 'Enter a real name (letters, at least 2 characters).')
  .refine((s) => s.length < 1 || s.length >= 2, 'Enter a real name (letters, at least 2 characters).');
const MODULE_KEYS = ['nboard', 'nbase', 'ncourt', 'npad'] as const;
export const MODULE_KEY_LIST = MODULE_KEYS;
export type ModuleKey = (typeof MODULE_KEYS)[number];
const emailField = z.string().trim().min(1, 'Email is required.').max(120).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email address.');
const phoneField = z
  .string()
  .trim()
  .min(1, 'Phone is required.')
  .max(30)
  .refine((s) => s.length < 1 || /^\d{7,15}$/.test(s.replace(/[\s()+-]/g, '')), 'Enter a valid phone number.');
const playerAge = z.number({ error: 'Age is required.' }).int('Age must be a whole number.').min(3, 'Age must be 3 to 100.').max(100, 'Age must be 3 to 100.');
const playerWeight = z.number({ error: 'Weight is required.' }).min(10, 'Weight must be 10 to 300 kg.').max(300, 'Weight must be 10 to 300 kg.');
const staffAge = z.number({ error: 'Age is required.' }).int('Age must be a whole number.').min(18, 'Age must be 18 to 80.').max(80, 'Age must be 18 to 80.');

export const loginBody = z.object({
  login_id: z.string().trim().min(1).max(64),
  secret: z.string().min(1).max(128),
  device_label: z.string().trim().max(80).optional(),
  platform: z.string().trim().max(30).optional(),
});

export const refreshBody = z.object({
  refresh_token: z.string().min(20).max(300),
});

export const changePasswordBody = z.object({
  current_secret: z.string().min(1).max(128),
  new_secret: z.string().min(6).max(128),
});

export const createUserBody = z.object({
  login_id: z.string().trim().toLowerCase().regex(LOGIN_ID_PATTERN, 'Use 3 to 32 letters, digits, dot, dash or underscore.'),
  display_name: personName,
  role: z.enum(['ADMIN', 'COACH', 'PLAYER']),
  // Required for staff accounts (Coach, Admin). Players are created from the Players screen.
  email: emailField.optional(),
  phone: phoneField.optional(),
  age: staffAge.optional(),
  hub_id: idStr.nullable().optional(),
}).superRefine((b, ctx) => {
  if (b.role === 'PLAYER') return;
  for (const [k, msg] of [['email', 'Email is required.'], ['phone', 'Phone is required.'], ['age', 'Age is required.']] as const) {
    if (b[k] === undefined) ctx.addIssue({ code: 'custom', path: [k], message: msg });
  }
});

export const patchUserBody = z.object({
  display_name: personName.optional(),
  email: emailField.optional(),
  phone: phoneField.optional(),
  age: staffAge.optional(),
  is_active: z.boolean().optional(),
  reason: z.string().trim().max(300).optional(),
  role: z.enum(['ADMIN', 'COACH']).optional(),
  hub_id: idStr.nullable().optional(),
});

export const permissionsBody = z.object({
  create_coaches: z.boolean(),
});

const pinField = z.string().regex(/^\d{6,12}$/, 'A PIN is 6 to 12 digits.');

export const createPlayerBody = z.object({
  display_name: personName,
  age: playerAge,
  weight_kg: playerWeight,
  notes: z.string().trim().max(1000).nullable().optional(),
  pin: pinField.optional(),
  coach_id: idStr.optional(),
  program_id: idStr.nullable().optional(),
  starting_games: z.array(gameSlug).max(4).optional(),
  hub_id: idStr.nullable().optional(),
});

export const patchPlayerBody = z.object({
  display_name: personName.optional(),
  age: playerAge.optional(),
  weight_kg: playerWeight.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  reason: z.string().trim().max(300).optional(),
  hub_id: idStr.nullable().optional(),
});

export const resetPlayerBody = z.object({
  pin: pinField.optional(),
});

export const reassignBody = z.object({
  coach_id: idStr,
});

export const accessBody = z.object({
  state: z.enum(['locked', 'unlocked', 'completed']).optional(),
  level_cap: z.number().int().min(1).max(10).nullable().optional(),
  target_sessions: z.number().int().min(1).max(100).nullable().optional(),
  target_level: z.number().int().min(1).max(10).nullable().optional(),
  target_accuracy: z.number().min(0).max(100).nullable().optional(),
});

export const assignProgramBody = z.object({
  program_id: idStr,
});

export const stageBody = z.object({
  stage: z.number().int().min(1).max(50),
});

export const programBody = z.object({
  name: z.string().trim().min(1).max(80),
  is_template: z.boolean().optional(),
  retired: z.boolean().optional(),
  stages: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        games: z.array(gameSlug).max(4),
      }),
    )
    .min(1)
    .max(12),
});

export const patchProgramBody = programBody.partial();

export const createSessionBody = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid session id.'),
  game: gameSlug,
  level: z.number().int().min(1).max(10),
  transport: z.enum(['ble', 'bridge', 'mock']),
  /** Which module the round belongs to. Only staff may use a module other than nboard. */
  module_key: z.enum(MODULE_KEYS).optional(),
  /** Assess: staff record the round for this player. */
  player_id: z.string().min(1).max(64).optional(),
});

export const hitRowSchema = z.object({
  seq: z.number().int().min(0).max(100000),
  target_btn: z.number().int().min(0).max(64).nullable(),
  pressed_btn: z.number().int().min(0).max(64).nullable(),
  rt_ms: z.number().int().min(0).max(600000).nullable(),
  correct: z.boolean(),
  distractor: z.boolean(),
  t_ms: z.number().int().min(0).max(36000000),
  len: z.number().int().min(0).max(100).nullable().optional(),
  step: z.number().int().min(0).max(100).nullable().optional(),
});

export const finishSessionBody = z.object({
  status: z.enum(['completed', 'interrupted', 'aborted']),
  started_at: isoDate,
  ended_at: isoDate,
  board_fw: z.string().max(40).nullable().optional(),
  hits: z.array(hitRowSchema).max(5000),
});

export const settingsBody = z.object({
  org_name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().min(1).max(60).optional(),
  week_start: z.enum(['monday', 'sunday']).optional(),
  idle_timeout_min: z.number().int().min(1).max(240).optional(),
  player_logout_after_result: z.boolean().optional(),
});

export type LoginBody = z.infer<typeof loginBody>;
export const hubBody = z.object({
  name: z.string().trim().min(2, 'Give the hub a name.').max(80),
  city: z.string().trim().max(60).nullable().optional(),
  is_active: z.boolean().optional(),
});
export const hubPatchBody = hubBody.partial();

export type CreatePlayerBody = z.infer<typeof createPlayerBody>;
export type FinishSessionBody = z.infer<typeof finishSessionBody>;
export type ProgramBody = z.infer<typeof programBody>;

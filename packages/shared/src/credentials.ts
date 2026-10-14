// Credential rules (section 11.1). Staff use a password of at least 10 characters.
// Players use a Player ID and a 6-digit PIN (D9).

import type { Role } from './permissions';

export const STAFF_PASSWORD_MIN = 10;
export const PIN_MIN = 6;
export const PIN_MAX = 12;

/** Simple runs and repeats are refused: 000000, 123456, 654321, 121212. */
export function isSimplePin(pin: string): boolean {
  if (!/^\d+$/.test(pin)) return false;
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = [...pin].map(Number);
  const asc = d.every((v, i) => i === 0 || v === d[i - 1]! + 1);
  const desc = d.every((v, i) => i === 0 || v === d[i - 1]! - 1);
  if (asc || desc) return true;
  if (pin.length >= 4 && d.every((v, i) => v === d[i % 2])) return true;
  return false;
}

/** Returns an error message, or null when the PIN is acceptable. */
export function validatePin(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return 'A PIN is digits only.';
  if (pin.length < PIN_MIN) return `A PIN needs at least ${PIN_MIN} digits.`;
  if (pin.length > PIN_MAX) return `A PIN can have at most ${PIN_MAX} digits.`;
  if (isSimplePin(pin)) return 'Choose a PIN that is not a simple run or repeat.';
  return null;
}

export function validateStaffPassword(pw: string): string | null {
  if (pw.length < STAFF_PASSWORD_MIN) return `A password needs at least ${STAFF_PASSWORD_MIN} characters.`;
  if (pw.length > 128) return 'That password is too long.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use letters and at least one number.';
  return null;
}

export function validateSecretFor(role: Role, secret: string): string | null {
  return role === 'PLAYER' ? validatePin(secret) : validateStaffPassword(secret);
}

export function secretLabel(role: Role): string {
  return role === 'PLAYER' ? 'PIN' : 'Password';
}
export function loginIdLabel(role: Role | null): string {
  return role === 'PLAYER' ? 'Player ID' : 'Login ID';
}

export const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

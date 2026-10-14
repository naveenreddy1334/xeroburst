// Five failed attempts lock the account for 5 minutes; repeated lockouts double the wait up to an hour
// (section 11.5). Counts live in the users row so a server restart does not forget them.

import type { DB } from '../db/index.js';

export const MAX_ATTEMPTS = 5;
const BASE_MS = 5 * 60_000;
const MAX_MS = 60 * 60_000;

export function lockDurationMs(lockCount: number): number {
  return Math.min(MAX_MS, BASE_MS * 2 ** Math.max(0, lockCount));
}

export function secondsLeft(lockedUntil: string | null, now = Date.now()): number {
  if (!lockedUntil) return 0;
  return Math.max(0, Math.ceil((Date.parse(lockedUntil) - now) / 1000));
}

/** Returns the new locked_until when this failure triggered a lock. */
export function recordFailure(db: DB, userId: string, now = Date.now()): string | null {
  const u = db.prepare('SELECT failed_attempts, lock_count FROM users WHERE id = ?').get(userId) as
    | { failed_attempts: number; lock_count: number }
    | undefined;
  if (!u) return null;
  const attempts = u.failed_attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    const until = new Date(now + lockDurationMs(u.lock_count)).toISOString();
    db.prepare('UPDATE users SET failed_attempts = 0, lock_count = lock_count + 1, locked_until = ? WHERE id = ?').run(until, userId);
    return until;
  }
  db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, userId);
  return null;
}

export function recordSuccess(db: DB, userId: string): void {
  db.prepare('UPDATE users SET failed_attempts = 0, lock_count = 0, locked_until = NULL WHERE id = ?').run(userId);
}

/** An Admin or Coach with rank can clear a lock early (reset credentials does this too). */
export function clearLock(db: DB, userId: string): void {
  recordSuccess(db, userId);
}

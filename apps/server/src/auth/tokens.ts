import { createHash, randomBytes } from 'node:crypto';

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newTicket(): string {
  return randomBytes(24).toString('base64url');
}

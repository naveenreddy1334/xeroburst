// If every Super Admin is locked out (section 11.6): reset any account from the laptop.
import { hashSecret } from '../auth/password.js';
import { validateSecretFor } from '@nboard/shared';
import type { Role } from '@nboard/shared';
import { writeAudit } from '../audit.js';
import { ask, flag, openFromEnv } from './common.js';

const { db } = openFromEnv();
const login = (flag('login') ?? (await ask('  Login ID to reset: '))).toLowerCase();
const u = db.prepare('SELECT id, role FROM users WHERE login_id = ?').get(login) as { id: string; role: Role } | undefined;
if (!u) {
  console.error(`\n  No account with login ID "${login}".\n`);
  process.exit(1);
}
let secret = flag('password') ?? (await ask(u.role === 'PLAYER' ? '  New PIN: ' : '  New password: ', true));
let bad = validateSecretFor(u.role, secret);
while (bad) {
  console.log(`  ${bad}`);
  secret = await ask('  Try again: ', true);
  bad = validateSecretFor(u.role, secret);
}
db.prepare(
  `UPDATE users SET password_hash = ?, must_change_password = 0, is_active = 1, failed_attempts = 0, lock_count = 0,
                    locked_until = NULL, token_version = token_version + 1 WHERE id = ?`,
).run(await hashSecret(secret), u.id);
db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), u.id);
writeAudit(db, { actorId: null, action: 'CLI_PASSWORD_RESET', targetType: 'user', targetId: u.id, detail: { login_id: login } });
console.log(`\n  Password for "${login}" was reset. Every device was signed out.\n`);
db.close();

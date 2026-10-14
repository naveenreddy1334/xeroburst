// First run: creates the Super Admin, the organisation name and the time zone (section 11.7).
// There is no setup endpoint on the network: this needs physical access to the laptop.

import { LOGIN_ID_PATTERN, validateStaffPassword } from '@nboard/shared';
import { writeAudit } from '../audit.js';
import { hashSecret } from '../auth/password.js';
import { newId } from '../db/seed.js';
import { isValidTimezone } from '../util/time.js';
import { ask, flag, openFromEnv } from './common.js';

const { cfg, db } = openFromEnv();

const existing = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'SUPER_ADMIN'`).get() as { c: number };
console.log('\n  XeroBurst setup');
console.log(existing.c ? `  (${existing.c} Super Admin already exists. This will add another.)\n` : '  Create the first Super Admin.\n');

const org = flag('org') ?? (existing.c ? undefined : await ask('  Organisation name [XeroBurst]: ')) ?? '';
const tz = flag('tz') ?? (existing.c ? undefined : await ask('  Time zone [Asia/Kolkata]: ')) ?? '';
let login = (flag('login') ?? (await ask('  Super Admin login ID (lowercase, e.g. admin): '))).toLowerCase();
while (!LOGIN_ID_PATTERN.test(login)) {
  console.log('  Use 3 to 32 lowercase letters, digits, dot, dash or underscore.');
  login = (await ask('  Login ID: ')).toLowerCase();
}
if (db.prepare('SELECT 1 FROM users WHERE login_id = ?').get(login)) {
  console.error(`\n  The login ID "${login}" is already taken.\n`);
  process.exit(1);
}
const name = flag('name') ?? ((await ask('  Display name [Super Admin]: ')) || 'Super Admin');
let password = flag('password') ?? (await ask('  Password (10+ characters, letters and a number): ', true));
let bad = validateStaffPassword(password);
while (bad) {
  console.log(`  ${bad}`);
  password = await ask('  Password: ', true);
  bad = validateStaffPassword(password);
}
if (!flag('password')) {
  const again = await ask('  Repeat password: ', true);
  if (again !== password) {
    console.error('\n  The passwords did not match. Nothing was created.\n');
    process.exit(1);
  }
}

const id = `u_${newId()}`;
db.prepare(
  `INSERT INTO users (id, login_id, display_name, role, password_hash, must_change_password, is_active, created_by, created_at)
   VALUES (?,?,?,'SUPER_ADMIN',?,0,1,NULL,?)`,
).run(id, login, name, await hashSecret(password), new Date().toISOString());
const set = db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
if (org) set.run('org_name', org);
if (tz) {
  if (isValidTimezone(tz)) set.run('timezone', tz);
  else console.log(`  "${tz}" is not a known time zone, so the default (Asia/Kolkata) stays.`);
}
writeAudit(db, { actorId: id, action: 'SETUP_SUPER_ADMIN', targetType: 'user', targetId: id, detail: { login_id: login } });
console.log(`\n  Done. Super Admin "${login}" created in ${cfg.dbFile}`);
console.log('  Next: npm run server   (then open the app and sign in)\n');
db.close();

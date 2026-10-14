import fs from 'node:fs';
import path from 'node:path';
import { openFromEnv } from './common.js';

const { cfg, db } = openFromEnv();
const dir = path.join(cfg.dataDir, 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const file = path.join(dir, `nboard-${stamp}.db`);
await db.backup(file);
console.log(`\n  Backup written: ${file}\n  Copy this file to a pendrive to keep it safe.\n`);
db.close();

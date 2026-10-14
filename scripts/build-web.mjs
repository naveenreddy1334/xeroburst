// Exports the app for the web and copies it next to the server so it is served on the same port.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = path.join(root, 'apps', 'mobile');
const isWin = process.platform === 'win32';
const r = spawnSync(isWin ? 'npx.cmd' : 'npx', ['expo', 'export', '--platform', 'web'], { cwd: mobile, stdio: 'inherit', shell: isWin });
if (r.status !== 0) process.exit(r.status ?? 1);
const dest = path.join(root, 'apps', 'server', 'web');
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(path.join(mobile, 'dist'), dest, { recursive: true });
console.log(`\nWeb app copied to ${dest}. Restart the server if it is running.`);

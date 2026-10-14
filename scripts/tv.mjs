// Android TV / Apple TV support is a switch, not a second app. The same code runs; only the React Native
// package changes to the TV fork (react-native-tvos) and the Expo config plugin is added.
//
//   npm run tv:enable    swap in react-native-tvos and install
//   npm run tv:android   build and run on an Android TV emulator or device (after tv:enable)
//   npm run tv:disable   go back to the standard phone and tablet build
//
// Phones and tablets do NOT need this. See docs/runbook.md, "Android TV".

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = path.join(root, 'apps', 'mobile');
const pkgFile = path.join(mobile, 'package.json');
const stash = path.join(mobile, '.tv-stash.json');
const TV_RN = 'npm:react-native-tvos@0.86.3-0';
const TV_PLUGIN = '0.1.7';
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const npx = isWin ? 'npx.cmd' : 'npx';

const run = (cmd, args, env = {}, cwd = root) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin, env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`\nCommand failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
};
const readPkg = () => JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const writePkg = (p) => fs.writeFileSync(pkgFile, JSON.stringify(p, null, 2) + '\n');

const cmd = process.argv[2];

if (cmd === 'enable') {
  const p = readPkg();
  if (p.dependencies['react-native'].startsWith('npm:react-native-tvos')) {
    console.log('TV support is already enabled.');
    process.exit(0);
  }
  fs.writeFileSync(stash, JSON.stringify({ rn: p.dependencies['react-native'] }));
  p.dependencies['react-native'] = TV_RN;
  p.dependencies['@react-native-tvos/config-tv'] = TV_PLUGIN;
  writePkg(p);
  console.log('Installing the TV build of React Native. This takes a few minutes.');
  run(npm, ['install']);
  console.log('\nDone. Next: npm run tv:android   (use `npm run tv:disable` to go back)');
} else if (cmd === 'disable') {
  if (!fs.existsSync(stash)) {
    console.log('TV support is not enabled.');
    process.exit(0);
  }
  const { rn } = JSON.parse(fs.readFileSync(stash, 'utf8'));
  const p = readPkg();
  p.dependencies['react-native'] = rn;
  delete p.dependencies['@react-native-tvos/config-tv'];
  writePkg(p);
  fs.rmSync(stash);
  run(npm, ['install']);
  console.log('Back to the phone and tablet build.');
} else if (cmd === 'android') {
  if (!fs.existsSync(stash)) {
    console.error('Run `npm run tv:enable` first.');
    process.exit(1);
  }
  run(npx, ['expo', 'prebuild', '--clean', '--platform', 'android'], { EXPO_TV: '1' }, mobile);
  run(npx, ['expo', 'run:android'], { EXPO_TV: '1' }, mobile);
} else {
  console.log('Usage: node scripts/tv.mjs <enable|disable|android>');
  process.exit(1);
}

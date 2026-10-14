import qrcode from 'qrcode-terminal';
import { buildApp } from './app.js';

const { app, ctx, addresses } = await buildApp();

const hasAdmin = ctx.db.prepare(`SELECT 1 FROM users WHERE role = 'SUPER_ADMIN'`).get();

try {
  await app.listen({ port: ctx.cfg.port, host: ctx.cfg.host });
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${ctx.cfg.port} is already in use. Close the other XeroBurst server, or set PORT=8081 and try again.\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
}

const urls = addresses();
const primary = urls[0] ?? `http://localhost:${ctx.cfg.port}`;
console.log('\n  XeroBurst server is running\n');
console.log(`  On this laptop : http://localhost:${ctx.cfg.port}/status`);
for (const u of urls) console.log(`  On your network: ${u}`);
console.log(`\n  In the app, enter:  ${primary}\n  or scan this code:\n`);
qrcode.generate(primary, { small: true });
console.log(`\n  Board: ${ctx.cfg.boardSim ? 'built-in simulator (a bot plays each round)' : ctx.cfg.boardPort ? `USB ${ctx.cfg.boardPort}` : 'looking for a USB board (npm run server:sim to test without one)'}`);
if (!hasAdmin) console.log('\n  No accounts yet. In a second terminal run:  npm run setup\n');

const stop = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

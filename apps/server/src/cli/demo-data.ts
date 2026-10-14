// Test data: a Super Admin, an Admin, two Coaches, six players and about three weeks of simulated
// training. For trying the app only. The accounts and passwords are printed below and are public.
// Run `npm run demo-data -- --reset` to delete the database first and start clean.

import fs from 'node:fs';
import { GAMES, GAME_SLUGS, eventsToRows, isBetter, primaryValue, simulateRound, summarize } from '@nboard/shared';
import type { GameSlug, Summary } from '@nboard/shared';
import { hashSecret } from '../auth/password.js';
import { applyProgram, ensureAccessRows } from '../services/access.js';
import { DEFAULT_PROGRAM_ID, newId } from '../db/seed.js';
import { hasFlag, openFromEnv } from './common.js';
import { localMidnightUtc, localParts } from '../util/time.js';
import type { Ctx } from '../ctx.js';

export const DEMO = {
  staff: [
    { email: 'sunita@xeroburst.demo', phone: '+91 98450 10001', staffAge: 44, login: 'super.demo', name: 'Sunita Rao', role: 'SUPER_ADMIN', password: 'Demo-super-2026' },
    { email: 'anil@xeroburst.demo', phone: '+91 98450 10002', staffAge: 41, login: 'admin.demo', name: 'Anil Kapoor', role: 'ADMIN', password: 'Demo-admin-2026' },
    { email: 'ravi@xeroburst.demo', phone: '+91 98450 10003', staffAge: 37, login: 'coach.ravi', name: 'Coach Ravi', role: 'COACH', password: 'Demo-coach-2026' },
    { email: 'sneha@xeroburst.demo', phone: '+91 98450 10004', staffAge: 33, login: 'coach.sneha', name: 'Coach Sneha', role: 'COACH', password: 'Demo-coach-2026' },
  ],
  players: [
    { name: 'Arjun Mehta', age: 19, coach: 'coach.ravi', pin: '482915', stage: 4, skill: 0.78, days: 0.9 },
    { name: 'Meera Nair', age: 16, coach: 'coach.ravi', pin: '739104', stage: 3, skill: 0.66, days: 0.8 },
    { name: 'Kabir Singh', age: 22, coach: 'coach.ravi', pin: '205861', stage: 2, skill: 0.55, days: 0.6 },
    { name: 'Isha Verma', age: 18, coach: 'coach.sneha', pin: '916273', stage: 4, skill: 0.72, days: 0.85 },
    { name: 'Dev Patel', age: 24, coach: 'coach.sneha', pin: '584027', stage: 1, skill: 0.5, days: 0.4 },
    { name: 'Tara Iyer', age: 15, coach: 'coach.sneha', pin: '361948', stage: 3, skill: 0.62, days: 0.7 },
  ],
} as const;

export async function seedDemo(ctx: Ctx, log: (m: string) => void = () => {}, weeks = 3): Promise<void> {
  const { db } = ctx;
  const now = Date.now();
  const tz = ctx.settings().timezone;
  const ids = new Map<string, string>();

  for (const s of DEMO.staff) {
    const ex = db.prepare('SELECT id FROM users WHERE login_id = ?').get(s.login) as { id: string } | undefined;
    if (ex) {
      ids.set(s.login, ex.id);
      continue;
    }
    const id = `u_${newId()}`;
    db.prepare(
      `INSERT INTO users (id, login_id, display_name, role, password_hash, must_change_password, is_active, created_at, email, phone, age)
       VALUES (?,?,?,?,?,0,1,?,?,?,?)`,
    ).run(id, s.login, s.name, s.role, await hashSecret(s.password, ctx.hashN), new Date(now - weeks * 7 * 86400_000).toISOString(), s.email, s.phone, s.staffAge);
    ids.set(s.login, id);
    log(`  staff   ${s.login}`);
  }
  const ravi = ids.get('coach.ravi')!;
  db.prepare(`INSERT OR IGNORE INTO user_permission_grants (user_id, permission, granted_by, granted_at) VALUES (?,?,?,?)`).run(
    ravi, 'CREATE_COACHES', ids.get('admin.demo')!, new Date().toISOString(),
  );

  let n = (db.prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(player_code, 4) AS INTEGER)), 0) n FROM player_profiles`).get() as { n: number }).n;
  const best = new Map<string, number>();
  let seed = 1000;

  for (const p of DEMO.players) {
    const exists = db.prepare('SELECT 1 FROM users WHERE display_name = ? AND role = ?').get(p.name, 'PLAYER');
    if (exists) continue;
    n += 1;
    const code = `NB-${String(n).padStart(4, '0')}`;
    const id = `u_${newId()}`;
    const created = now - weeks * 7 * 86400_000;
    db.prepare(
      `INSERT INTO users (id, login_id, display_name, role, password_hash, must_change_password, is_active, created_by, created_at)
       VALUES (?,?,?,'PLAYER',?,0,1,?,?)`,
    ).run(id, code.toLowerCase(), p.name, await hashSecret(p.pin, ctx.hashN), ids.get(p.coach)!, new Date(created).toISOString());
    db.prepare('INSERT INTO player_profiles (user_id, player_code, coach_id, age, weight_kg, status) VALUES (?,?,?,?,?,?)').run(id, code, ids.get(p.coach)!, p.age, 45 + (p.age * 7) % 30, 'active');
    ensureAccessRows(ctx, id);
    db.prepare('INSERT INTO player_programs (player_id, program_id, current_stage, started_at, updated_by) VALUES (?,?,?,?,?)').run(
      id, DEFAULT_PROGRAM_ID, p.stage, new Date(created).toISOString(), ids.get(p.coach)!,
    );
    applyProgram(ctx, id, ids.get(p.coach)!);
    log(`  player  ${code}  ${p.name}  PIN ${p.pin}`);

    const games = GAME_SLUGS.slice(0, p.stage) as GameSlug[];
    const insSession = db.prepare(
      `INSERT INTO sessions (id, user_id, game_id, level, transport, board_fw, started_at, ended_at, status, score, summary_json, is_pb, created_server_at)
       VALUES (?,?,(SELECT id FROM games WHERE slug=?),?, 'mock','1.0-sim',?,?, 'completed', ?,?,?,?)`,
    );
    const insHit = db.prepare(
      `INSERT INTO hits (session_id, seq, target_btn, pressed_btn, rt_ms, correct, distractor, t_ms, len, step) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );
    const total = weeks * 7;
    db.transaction(() => {
      for (let d = total; d >= 0; d--) {
        // Everyone trains most days, with some gaps; a bit of randomness that does not change between runs.
        seed += 7;
        if (((seed * 2654435761) % 1000) / 1000 > p.days) continue;
        const day = localParts(now - d * 86400_000, tz);
        const midnight = localMidnightUtc(day.y, day.m, day.d, tz);
        const progress = (total - d) / total;
        const count = 1 + (seed % 3);
        for (let k = 0; k < count; k++) {
          const slug = games[(seed + k) % Math.min(games.length, 1 + Math.floor(progress * games.length + 0.99))]!;
          const info = GAMES[slug];
          const level = Math.max(info.minLevel, Math.min(info.maxLevel, 1 + Math.floor(progress * 5) + (k % 2)));
          const skill = Math.min(0.95, p.skill + progress * 0.12);
          const round = simulateRound(slug, level, { skill, seed: seed * 31 + k });
          const hits = eventsToRows(round.log);
          if (!hits.length) continue;
          const summary: Summary = summarize(slug, hits, { duration_ms: round.duration_ms });
          const start = midnight + (17 * 3600 + k * 1500 + (seed % 900)) * 1000;
          const end = start + round.duration_ms;
          const key = `${id}:${slug}:${level}`;
          const v = primaryValue(summary);
          const pb = v !== null && isBetter(slug, v, best.get(key) ?? null);
          if (pb && v !== null) best.set(key, v);
          const sid = `d_${newId()}`;
          insSession.run(sid, id, slug, level, new Date(start).toISOString(), new Date(end).toISOString(), summary.score, JSON.stringify(summary), pb ? 1 : 0, new Date(end).toISOString());
          for (const h of hits) insHit.run(sid, h.seq, h.target_btn, h.pressed_btn, h.rt_ms, h.correct ? 1 : 0, h.distractor ? 1 : 0, h.t_ms, h.len ?? null, h.step ?? null);
        }
      }
    })();
  }
}

if (process.argv[1]?.endsWith('demo-data.ts')) {
  const { cfg, db } = openFromEnv();
  db.close();
  if (hasFlag('reset')) {
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(cfg.dbFile + ext, { force: true });
    console.log('  Database deleted.');
  }
  const { buildApp } = await import('../app.js');
  const { app, ctx } = await buildApp({ boardSim: false, noBoard: true });
  console.log('\n  Creating demo data (about three weeks of simulated training)...');
  await seedDemo(ctx, console.log);
  await app.close();
  console.log('\n  Demo accounts (test data only):');
  for (const s of DEMO.staff) console.log(`    ${s.role.padEnd(12)} ${s.login.padEnd(12)} ${s.password}`);
  console.log('    PLAYER       use the Player ID printed above with its PIN\n');
  console.log('  Start the server with:  npm run server\n');
}

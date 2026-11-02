// Demo organization, following the chart: Super Admin > Hub Admin (Cricket Central, with three branches) or Branch Admin (MMC Fitness,
// MMC Academy, Hawk Fitness, one branch each) > Coach > Players. Three players per branch, joining over three years. Players have
// ten weeks of daily training (with exact streaks) and thin history before that, attendance, a fee plan with monthly payments since
// they joined (paid, late, partly paid, overdue), weekly and monthly rounds targets, and each branch has monthly expenses so profit
// is real. Test data only; safe to run twice.
// Run:  npm run demo-org            (adds to the current database)
//       npm run demo-org -- --reset (deletes the database first, so every old demo account and record is gone)

import fs from 'node:fs';
import { GAMES, GAME_SLUGS, eventsToRows, isBetter, primaryValue, simulateRound, summarize } from '@nboard/shared';
import type { GameSlug, Summary } from '@nboard/shared';
import { hashSecret } from '../auth/password.js';
import { applyProgram, ensureAccessRows } from '../services/access.js';
import { DEFAULT_PROGRAM_ID, newId } from '../db/seed.js';
import { hasFlag, openFromEnv } from './common.js';
import { dateKey, localMidnightUtc, localParts } from '../util/time.js';
import { METHODS, addMonths, createPlan, getPlan, monthsFrom, setPlayerFee, ymOf } from '../services/billing.js';
import { periodWindow, targetPeriod } from '../services/targets.js';
import type { Ctx } from '../ctx.js';
import type { PaymentMethod } from '@nboard/shared';

const PW = 'Demo-pass-2026';
// The chart: Super Admin > Hub Admin (a hub with several branches) or Branch Admin (a single branch) > Coach > Players.
interface DemoBranch { key: string; name: string; city: string }
interface DemoUnit { name: string; city: string; hubAdmin?: string; branchAdmin?: string; branches: DemoBranch[] }
const ORG: DemoUnit[] = [
  { name: 'Cricket Central', city: 'Bengaluru', hubAdmin: 'cc', branches: [
    { key: 'heb', name: 'Bangalore - Hebbal', city: 'Bengaluru' },
    { key: 'mar', name: 'Bangalore - Marathahalli', city: 'Bengaluru' },
    { key: 'mas', name: 'Delhi - Masoodpur', city: 'New Delhi' },
  ] },
  { name: 'MMC Fitness', city: 'Bengaluru', branchAdmin: 'mmcf', branches: [{ key: 'mmcf', name: 'MMC Fitness', city: 'Bengaluru' }] },
  { name: 'MMC Academy', city: 'Bengaluru', branchAdmin: 'mmca', branches: [{ key: 'mmca', name: 'MMC Academy', city: 'Bengaluru' }] },
  { name: 'Hawk Fitness', city: 'Bengaluru', branchAdmin: 'hawk', branches: [{ key: 'hawk', name: 'Hawk Fitness', city: 'Bengaluru' }] },
];
const ALL_BRANCHES = ['heb', 'mar', 'mas', 'mmcf', 'mmca', 'hawk'];
const SUPERS = ['Sunita Rao', 'Vikram Shah', 'Neha Kulkarni'];
// streak: days in a row ending yesterday. pay: how this person pays (good = early every month, late = later in the month,
// behind = missed a month and part-paid another, new = joined recently so only the last two months are billed).
type Pay = 'good' | 'late' | 'behind';
interface DemoPlayer { since: number; name: string; age: number; stage: number; skill: number; streak: number; plan: 0 | 1 | 2; pay: Pay; target: boolean }
const PLAYERS: Record<string, DemoPlayer[]> = {
  heb: [{ since: 36, name: 'Arjun Mehta', age: 19, stage: 4, skill: 0.78, streak: 12, plan: 2, pay: 'good', target: true }, { since: 30, name: 'Meera Nair', age: 16, stage: 3, skill: 0.66, streak: 5, plan: 1, pay: 'late', target: true }, { since: 14, name: 'Kabir Singh', age: 22, stage: 2, skill: 0.55, streak: 0, plan: 0, pay: 'behind', target: false }],
  mar: [{ since: 33, name: 'Isha Verma', age: 18, stage: 4, skill: 0.72, streak: 8, plan: 2, pay: 'good', target: true }, { since: 21, name: 'Dev Patel', age: 24, stage: 1, skill: 0.5, streak: 2, plan: 0, pay: 'late', target: true }, { since: 9, name: 'Tara Iyer', age: 15, stage: 3, skill: 0.62, streak: 0, plan: 1, pay: 'good', target: true }],
  mas: [{ since: 28, name: 'Rohan Gupta', age: 21, stage: 4, skill: 0.8, streak: 21, plan: 2, pay: 'good', target: true }, { since: 17, name: 'Anaya Sharma', age: 17, stage: 2, skill: 0.58, streak: 3, plan: 1, pay: 'behind', target: true }, { since: 6, name: 'Zoya Khan', age: 20, stage: 3, skill: 0.68, streak: 6, plan: 0, pay: 'late', target: false }],
  mmcf: [{ since: 26, name: 'Vihaan Rao', age: 23, stage: 4, skill: 0.74, streak: 15, plan: 2, pay: 'good', target: true }, { since: 15, name: 'Diya Menon', age: 17, stage: 3, skill: 0.64, streak: 4, plan: 1, pay: 'good', target: true }, { since: 4, name: 'Kiran Joshi', age: 26, stage: 1, skill: 0.52, streak: 1, plan: 0, pay: 'late', target: false }],
  mmca: [{ since: 22, name: 'Aarav Shetty', age: 14, stage: 3, skill: 0.63, streak: 9, plan: 1, pay: 'good', target: true }, { since: 12, name: 'Sana Qureshi', age: 19, stage: 2, skill: 0.57, streak: 0, plan: 0, pay: 'behind', target: true }, { since: 3, name: 'Neel Bhatt', age: 16, stage: 1, skill: 0.5, streak: 3, plan: 1, pay: 'good', target: true }],
  hawk: [{ since: 18, name: 'Ritu Kapoor', age: 25, stage: 4, skill: 0.76, streak: 18, plan: 2, pay: 'good', target: true }, { since: 8, name: 'Yash Malhotra', age: 21, stage: 2, skill: 0.6, streak: 6, plan: 1, pay: 'late', target: true }, { since: 2, name: 'Pari Das', age: 13, stage: 1, skill: 0.48, streak: 2, plan: 0, pay: 'good', target: false }],
};
const PLANS = [{ name: 'Starter', amount: 1500 }, { name: 'Pro', amount: 2500 }, { name: 'Elite', amount: 4000 }];

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');

export async function seedDemoOrg(ctx: Ctx, log: (m: string) => void = () => {}, weeks = 10): Promise<string[]> {
  const { db } = ctx;
  const now = Date.now();
  const tz = ctx.settings().timezone;
  const iso = (t = now) => new Date(t).toISOString();
  const hash = await hashSecret(PW, ctx.hashN);
  const lines: string[] = [];

  const person = (login: string, name: string, role: string, hub: string | null, branch: string | null, by: string | null) => {
    const ex = db.prepare('SELECT id FROM users WHERE login_id = ?').get(login) as { id: string } | undefined;
    if (ex) return ex.id;
    const id = `u_${newId()}`;
    db.prepare(
      `INSERT INTO users (id, login_id, display_name, role, password_hash, must_change_password, is_active, created_by, created_at, hub_id, branch_id)
       VALUES (?,?,?,?,?,0,1,?,?,?,?)`,
    ).run(id, login, name, role, hash, by, iso(now - 150 * 86400_000), hub, branch);
    lines.push(`${(role === 'HUB_MANAGER' ? 'HUB_ADMIN' : role === 'BRANCH_MANAGER' ? 'BRANCH_ADMIN' : role).padEnd(15)} ${login.padEnd(24)} ${PW}`);
    return id;
  };

  const sup = SUPERS.map((n) => person(`super.${slug(n).split('.')[0]}`, n, 'SUPER_ADMIN', null, null, null));

  let seq = (db.prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(player_code, 4) AS INTEGER)), 0) n FROM player_profiles`).get() as { n: number }).n;
  const best = new Map<string, number>();
  let seed = 4000;

  // Fee plans. Players pay XeroBurst a monthly amount for their plan.
  const planIds = PLANS.map((pl) => (db.prepare('SELECT id FROM fee_plans WHERE name = ? COLLATE NOCASE').get(pl.name) as { id: string } | undefined)?.id ?? createPlan(ctx, pl.name, pl.amount).id);
  void getPlan;
  const nowYm = ymOf(now, tz);
  const ws = ctx.settings().week_start;
  const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

  for (const h of ORG) {
    let hub = (db.prepare('SELECT id FROM hubs WHERE name = ?').get(h.name) as { id: string } | undefined)?.id;
    if (!hub) {
      hub = `h_${newId()}`;
      db.prepare('INSERT INTO hubs (id, name, city, is_active, created_by, created_at) VALUES (?,?,?,1,?,?)').run(hub, h.name, h.city, sup[0], iso());
    }
    if (h.hubAdmin) person(`hubadmin.${h.hubAdmin}`, `${h.name} Hub Admin`, 'HUB_MANAGER', hub, null, sup[0]!);

    for (const hb of h.branches) {
    const hbNo = ALL_BRANCHES.indexOf(hb.key);
    let branch = (db.prepare('SELECT id FROM branches WHERE hub_id = ? AND name = ?').get(hub, hb.name) as { id: string } | undefined)?.id;
    if (!branch) {
      branch = `b_${newId()}`;
      db.prepare('INSERT INTO branches (id, hub_id, academy_id, name, city, is_active, created_by, created_at) VALUES (?,?,NULL,?,?,1,?,?)').run(branch, hub, hb.name, hb.city, sup[0], iso());
    }
    if (h.branchAdmin) person(`branchadmin.${h.branchAdmin}`, `${hb.name} Branch Admin`, 'BRANCH_MANAGER', hub, branch, sup[0]!);
    const coach = person(`coach.${hb.key}`, `Coach ${hb.name}`, 'COACH', hub, branch, sup[0]!);

    for (const p of PLAYERS[hb.key]!) {
      if (db.prepare('SELECT 1 FROM users WHERE display_name = ? AND role = ?').get(p.name, 'PLAYER')) continue;
      seq += 1;
      const code = `NB-${String(seq).padStart(4, '0')}`;
      const pin = String(100000 + ((seq * 7919) % 900000));
      const id = `u_${newId()}`;
      const created = now - Math.max(150, Math.round(p.since * 30.4)) * 86400_000;
      db.prepare(
        `INSERT INTO users (id, login_id, display_name, role, password_hash, must_change_password, is_active, created_by, created_at, hub_id, branch_id)
         VALUES (?,?,?,'PLAYER',?,0,1,?,?,?,?)`,
      ).run(id, code.toLowerCase(), p.name, await hashSecret(pin, ctx.hashN), coach, iso(created), hub, branch);
      db.prepare('INSERT INTO player_profiles (user_id, player_code, coach_id, age, weight_kg, status) VALUES (?,?,?,?,?,?)').run(id, code, coach, p.age, 45 + (p.age * 7) % 30, 'active');
      ensureAccessRows(ctx, id);
      db.prepare('INSERT INTO player_programs (player_id, program_id, current_stage, started_at, updated_by) VALUES (?,?,?,?,?)').run(id, DEFAULT_PROGRAM_ID, p.stage, iso(created), coach);
      applyProgram(ctx, id, coach);
      lines.push(`PLAYER          ${code.toLowerCase().padEnd(24)} PIN ${pin}   (${p.name}, ${hb.name})`);

      const games = GAME_SLUGS.slice(0, p.stage) as GameSlug[];
      const insSession = db.prepare(
        `INSERT INTO sessions (id, user_id, game_id, level, transport, board_fw, started_at, ended_at, status, score, summary_json, is_pb, created_server_at)
         VALUES (?,?,(SELECT id FROM games WHERE slug=?),?, 'mock','1.0-sim',?,?, 'completed', ?,?,?,?)`,
      );
      const insHit = db.prepare(`INSERT INTO hits (session_id, seq, target_btn, pressed_btn, rt_ms, correct, distractor, t_ms, len, step) VALUES (?,?,?,?,?,?,?,?,?,?)`);
      const total = weeks * 7;
      const history = Math.round(p.since * 30.4);
      const insAtt = db.prepare('INSERT OR IGNORE INTO attendance (user_id, day, hub_id, source, first_at) VALUES (?,?,?,?,?)');
      db.transaction(() => {
        // Recent weeks are daily. Older months are thin (about one day in eight) so three years stay small but real.
        for (let d = Math.max(total, history); d >= 1; d--) {
          seed += 7;
          // The last p.streak days (ending yesterday) are always played, the day before that is always skipped, so the streak is exact.
          if (d > total) { if (((seed * 2654435761) % 1000) / 1000 > 0.13) continue; }
          else if (d <= p.streak) { /* played */ } else if (d === p.streak + 1) continue;
          else if (((seed * 2654435761) % 1000) / 1000 > 0.5 + p.skill * 0.4) continue;
          const day = localParts(now - d * 86400_000, tz);
          const midnight = localMidnightUtc(day.y, day.m, day.d, tz);
          const progress = Math.max(0, (total - d) / total);
          insAtt.run(id, dateKey(midnight + 17 * 3600_000, tz), hub, 'auto', iso(midnight + 17 * 3600_000));
          const count = 1 + (seed % 3);
          for (let k = 0; k < count; k++) {
            const g = games[(seed + k) % Math.min(games.length, 1 + Math.floor(progress * games.length + 0.99))]!;
            const info = GAMES[g];
            const level = Math.max(info.minLevel, Math.min(info.maxLevel, 1 + Math.floor(progress * 5) + (k % 2)));
            const round = simulateRound(g, level, { skill: Math.min(0.95, p.skill + progress * 0.12), seed: seed * 31 + k });
            const hits = eventsToRows(round.log);
            if (!hits.length) continue;
            const summary: Summary = summarize(g, hits, { duration_ms: round.duration_ms });
            const start = midnight + (17 * 3600 + k * 1500 + (seed % 900)) * 1000;
            const end = start + round.duration_ms;
            const key = `${id}:${g}:${level}`;
            const v = primaryValue(summary);
            const pb = v !== null && isBetter(g, v, best.get(key) ?? null);
            if (pb && v !== null) best.set(key, v);
            const sid = `d_${newId()}`;
            insSession.run(sid, id, g, level, iso(start), iso(end), summary.score, JSON.stringify(summary), pb ? 1 : 0, iso(end));
            for (const x of hits) insHit.run(sid, x.seq, x.target_btn, x.pressed_btn, x.rt_ms, x.correct ? 1 : 0, x.distractor ? 1 : 0, x.t_ms, x.len ?? null, x.step ?? null);
          }
        }
      })();

      // ---- fee plan and payments since the player joined ---------------------------------------------------------------------
      const startYm = addMonths(nowYm, -p.since);
      setPlayerFee(ctx, id, planIds[p.plan]!, startYm);
      const amount = PLANS[p.plan]!.amount;
      const insPay = db.prepare(
        `INSERT INTO payments (id, player_id, plan_id, period, amount, currency, method, status, reference, paid_at, created_at, recorded_by)
         VALUES (?,?,?,?,?,'INR',?,'paid',?,?,?,?)`,
      );
      let mi = 0;
      for (const ym of monthsFrom(startYm, nowYm)) {
        mi += 1;
        const [py, pm] = ym.split('-').map(Number) as [number, number];
        const monthStart = localMidnightUtc(py, pm, 1, tz);
        const isNow = ym === nowYm;
        const isLast = ym === addMonths(nowYm, -1);
        const isBefore = ym === addMonths(nowYm, -2);
        const payOn = (day: number, amt: number) => {
          let t = localMidnightUtc(py, pm, day, tz) + (9 + (mi % 6)) * 3600_000 + ((seq * 7 + mi * 13) % 50) * 60_000;
          // Never in the future: a payment for this month that is "due later" lands between the 1st and now.
          if (t > now) t = monthStart + Math.max(0, Math.floor((now - monthStart) * (0.3 + 0.1 * (mi % 5))));
          const method = METHODS[(seq + mi) % METHODS.length] as PaymentMethod;
          const pid = `pay_${newId()}`;
          insPay.run(pid, id, planIds[p.plan], ym, amt, method, `XB${t.toString(36).toUpperCase()}${pid.slice(-3).toUpperCase()}`, iso(t), iso(t), method === 'cash' ? coach : id);
        };
        if (p.pay === 'good') payOn(1 + ((seq + mi) % 4), amount);
        else if (p.pay === 'late') { if (!isNow) payOn(9 + ((seq + mi) % 10), amount); }
        else if (isBefore) payOn(8 + (mi % 6), Math.round(amount * 0.6));
        else if (!isNow && !isLast) payOn(8 + (mi % 6), amount);
      }

      // ---- rounds targets: past weeks and months that were hit or missed, and the current week and month -----------------
      const insTarget = db.prepare(
        `INSERT OR REPLACE INTO player_targets (id, player_id, kind, period_start, target_rounds, set_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      );
      const setT = (kind: 'week' | 'month', off: number, rounds: number) => {
        const w = periodWindow(kind, off, now, tz, ws);
        insTarget.run(`tg_${newId()}`, id, kind, w.start, rounds, id, iso(w.from), iso(w.from));
      };
      const lastMonth = targetPeriod(ctx, id, 'month', -1, now).actual;
      const lastWeek = targetPeriod(ctx, id, 'week', -1, now).actual;
      [[-3, 1.1], [-2, 0.9], [-1, 1.0]].forEach(([off, f]) => setT('week', off!, roundTo(targetPeriod(ctx, id, 'week', off!, now).actual * f!, 1)));
      const months = Math.min(12, p.since);
      for (let off = -months; off <= -1; off++) {
        const f = [1.15, 0.92, 1.05, 1.2, 0.95][(Math.abs(off) + seq) % 5]!;
        setT('month', off, roundTo(targetPeriod(ctx, id, 'month', off, now).actual * f, 5));
      }
      if (p.target) {
        setT('month', 0, roundTo(lastMonth * 1.1, 5));
        setT('week', 0, roundTo(lastWeek * 1.1, 1));
      }
    }

    // Coach attendance: the coach is in most days except Sunday, since the branch opened.
    const opened = Math.max(...PLAYERS[hb.key]!.map((x) => x.since));
    const insAtt2 = db.prepare('INSERT OR IGNORE INTO attendance (user_id, day, hub_id, source, first_at) VALUES (?,?,?,?,?)');
    db.transaction(() => {
      for (let d = Math.round(opened * 30.4); d >= 0; d--) {
        const day = localParts(now - d * 86400_000, tz);
        const midnight = localMidnightUtc(day.y, day.m, day.d, tz);
        if (new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay() === 0) continue;
        if ((((d * 7919 + hbNo * 31) * 2654435761) % 1000) / 1000 > 0.9) continue;
        insAtt2.run(coach, dateKey(midnight + 16 * 3600_000, tz), hub, 'auto', iso(midnight + 16 * 3600_000));
      }
    })();

    // ---- what the branch spends each month, from the month its first player joined ---------------------------------------
    const insExp = db.prepare('INSERT INTO expenses (id, hub_id, branch_id, period, category, amount, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    let mn = 0;
    for (const ym of monthsFrom(addMonths(nowYm, -opened), nowYm)) {
      mn += 1;
      const when = iso(localMidnightUtc(Number(ym.slice(0, 4)), Number(ym.slice(5)), 2, tz));
      const rows: [string, number][] = [
        ['Rent', 2200 + hbNo * 120],
        ['Coach pay', 2400 + (mn > 12 ? 200 : 0) + (mn > 24 ? 200 : 0)],
        ['Utilities', 260 + ((mn * 37 + hbNo * 11) % 90)],
        ['Marketing', 300 + ((mn * 53 + hbNo * 29) % 260)],
      ];
      if (mn % 4 === 1) rows.push(['Equipment', 900 + ((mn * 71) % 400)]);
      // The month still running has only the costs booked so far (rent and marketing); coach pay and the rest are booked at month end.
      const booked = ym === nowYm ? rows.filter(([c]) => c === 'Rent' || c === 'Marketing') : rows;
      for (const [cat, amt] of booked) insExp.run(`ex_${newId()}`, hub, branch, ym, cat, amt, null, sup[0], when);
    }
    }

    // A Hub Admin is paid by the hub, not by one branch: this cost has a hub and no branch.
    if (h.hubAdmin) {
      const first = Math.max(...h.branches.flatMap((b) => PLAYERS[b.key]!.map((x) => x.since)));
      const insHub = db.prepare('INSERT INTO expenses (id, hub_id, branch_id, period, category, amount, note, created_by, created_at) VALUES (?,?,NULL,?,?,?,?,?,?)');
      for (const ym of monthsFrom(addMonths(nowYm, -first), nowYm)) {
        if (ym === nowYm) continue;
        insHub.run(`ex_${newId()}`, hub, ym, 'Hub Admin pay', 1800, null, sup[0], iso(localMidnightUtc(Number(ym.slice(0, 4)), Number(ym.slice(5)), 2, tz)));
      }
    }
  }
  return lines;
}

if (process.argv[1]?.endsWith('demo-org.ts')) {
  const { cfg, db } = openFromEnv();
  db.close();
  if (hasFlag('reset')) {
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(cfg.dbFile + ext, { force: true });
    console.log('  Database deleted.');
  }
  const { buildApp } = await import('../app.js');
  const { app, ctx } = await buildApp({ boardSim: false, noBoard: true });
  console.log('\n  Creating demo organization...');
  const lines = await seedDemoOrg(ctx);
  await app.close();
  console.log('\n  Demo accounts (test data only):  role / login / password');
  for (const l of lines) console.log('    ' + l);
  console.log('\n  Start the server with:  npm run server\n');
}

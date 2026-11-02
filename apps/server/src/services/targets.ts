// Streaks and the weekly or monthly rounds target ("ghost").
//
// A player sets how many rounds they want in the current week or month. The ghost line is that target paced evenly over the days,
// the solid line is what they actually did, and the dotted line is where they will land if they keep their pace so far.
// Only completed rounds count. Days are local days in the organization time zone.

import type { ProgressDTO, TargetHistoryItem, TargetPeriod, TargetPoint } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { newId } from '../db/seed.js';
import { dateKey, dayNumber, localMidnightUtc, localParts, weekdayIndex } from '../util/time.js';
import { streakFor } from './analytics.js';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface Win { kind: 'week' | 'month'; start: string; end: string; label: string; from: number; to: number; days: string[] }

/** The week or month at `offset` (0 = this one, -1 = the one before). */
export function periodWindow(kind: 'week' | 'month', offset: number, nowMs: number, tz: string, weekStart: 'monday' | 'sunday'): Win {
  const p = localParts(nowMs, tz);
  let y: number, m: number, d: number, n: number;
  if (kind === 'month') {
    const t = new Date(Date.UTC(p.y, p.m - 1 + offset, 1));
    y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = 1;
    n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  } else {
    const back = weekdayIndex(nowMs, tz, weekStart);
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d - back + offset * 7));
    y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate();
    n = 7;
  }
  const from = localMidnightUtc(y, m, d, tz);
  const to = localMidnightUtc(y, m, d + n, tz);
  const days = Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1, d + i));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  });
  const last = new Date(Date.UTC(y, m - 1, d + n - 1));
  const label = kind === 'month' ? `${FULL[m - 1]} ${y}` : `${d} ${MONTH[m - 1]} to ${last.getUTCDate()} ${MONTH[last.getUTCMonth()]}`;
  return { kind, start: days[0]!, end: days[n - 1]!, label, from, to, days };
}

/** Completed rounds per local day between two instants. */
function roundsPerDay(ctx: Ctx, playerId: string, from: number, to: number, tz: string): Map<string, number> {
  const rows = ctx.db
    .prepare(`SELECT started_at FROM sessions WHERE user_id = ? AND status = 'completed' AND started_at >= ? AND started_at < ?`)
    .all(playerId, new Date(from).toISOString(), new Date(to).toISOString()) as { started_at: string }[];
  const out = new Map<string, number>();
  for (const r of rows) {
    const k = dateKey(Date.parse(r.started_at), tz);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

const targetFor = (ctx: Ctx, playerId: string, kind: string, start: string): number | null =>
  (ctx.db.prepare('SELECT target_rounds FROM player_targets WHERE player_id = ? AND kind = ? AND period_start = ?').get(playerId, kind, start) as { target_rounds: number } | undefined)?.target_rounds ?? null;

export function targetPeriod(ctx: Ctx, playerId: string, kind: 'week' | 'month', offset: number, nowMs = Date.now()): TargetPeriod {
  const { timezone: tz, week_start: ws } = ctx.settings();
  const w = periodWindow(kind, offset, nowMs, tz, ws);
  const per = roundsPerDay(ctx, playerId, w.from, w.to, tz);
  const target = targetFor(ctx, playerId, kind, w.start);
  const today = dateKey(nowMs, tz);
  const n = w.days.length;
  const isCurrent = today >= w.start && today <= w.end;
  const elapsed = today > w.end ? n : today < w.start ? 0 : w.days.indexOf(today) + 1;
  let run = 0;
  const cumulative = w.days.map((day) => (run += per.get(day) ?? 0));
  const actual = elapsed > 0 ? cumulative[elapsed - 1]! : 0;
  const pace = elapsed > 0 ? actual / elapsed : 0;
  const projectedTotal = elapsed >= n ? actual : Math.round(pace * n);
  const series: TargetPoint[] = w.days.map((day, i) => {
    const dayNo = Number(day.slice(8, 10));
    return {
      day,
      label: kind === 'month' ? String(dayNo) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7]!,
      ghost: target ? Math.round(((target * (i + 1)) / n) * 10) / 10 : 0,
      actual: i < elapsed ? cumulative[i]! : null,
      // The projection starts at the last day played, so it joins the solid line.
      projected: elapsed >= 3 && elapsed < n && i >= elapsed - 1 ? Math.round((actual + pace * (i - (elapsed - 1))) * 10) / 10 : null,
    };
  });
  return {
    kind,
    start: w.start,
    end: w.end,
    label: w.label,
    days: n,
    elapsed_days: elapsed,
    target,
    actual,
    projected_total: projectedTotal,
    // Two days of play say nothing about the pace, so no verdict until the third day.
    on_track: target === null || elapsed < 3 && elapsed < n ? null : elapsed >= n ? actual >= target : projectedTotal >= target,
    series,
    is_current: isCurrent,
  };
}

function history(ctx: Ctx, playerId: string, kind: 'week' | 'month', nowMs: number): TargetHistoryItem[] {
  const { timezone: tz, week_start: ws } = ctx.settings();
  const cur = periodWindow(kind, 0, nowMs, tz, ws);
  const rows = ctx.db
    .prepare('SELECT period_start, target_rounds FROM player_targets WHERE player_id = ? AND kind = ? AND period_start < ? ORDER BY period_start DESC LIMIT 6')
    .all(playerId, kind, cur.start) as { period_start: string; target_rounds: number }[];
  return rows.map((r) => {
    const [y, m, d] = r.period_start.split('-').map(Number) as [number, number, number];
    const base = new Date(Date.UTC(y, m - 1, d)).getTime();
    // Find the window that starts on that date by stepping back from the current one.
    let off = -1;
    let w = periodWindow(kind, off, nowMs, tz, ws);
    while (w.start > r.period_start && off > -60) w = periodWindow(kind, --off, nowMs, tz, ws);
    void base;
    const actual = [...roundsPerDay(ctx, playerId, w.from, w.to, tz).values()].reduce((a, b) => a + b, 0);
    return { kind, start: r.period_start, label: w.label, target: r.target_rounds, actual, hit: actual >= r.target_rounds };
  });
}

export function progressFor(ctx: Ctx, playerId: string, kind: 'week' | 'month', offset: number, canSet: boolean, nowMs = Date.now()): ProgressDTO {
  const { timezone: tz } = ctx.settings();
  const who = ctx.db.prepare('SELECT display_name FROM users WHERE id = ?').get(playerId) as { display_name: string };
  const s = streakFor(ctx, playerId);
  const played = new Set(
    (ctx.db.prepare(`SELECT started_at FROM sessions WHERE user_id = ? AND status = 'completed' AND started_at >= ?`).all(playerId, new Date(nowMs - 20 * 86400_000).toISOString()) as { started_at: string }[]).map((r) => dayNumber(Date.parse(r.started_at), tz)),
  );
  const todayNo = dayNumber(nowMs, tz);
  // Eight weeks of days with how many rounds were played on each, for the streak calendar.
  const perDay = new Map<number, number>();
  for (const r of ctx.db.prepare(`SELECT started_at FROM sessions WHERE user_id = ? AND status = 'completed' AND started_at >= ?`).all(playerId, new Date(nowMs - 60 * 86400_000).toISOString()) as { started_at: string }[]) {
    const no = dayNumber(Date.parse(r.started_at), tz);
    perDay.set(no, (perDay.get(no) ?? 0) + 1);
  }
  const last56 = Array.from({ length: 56 }, (_, i) => {
    const no = todayNo - 55 + i;
    return { day: new Date(no * 86400000).toISOString().slice(0, 10), rounds: perDay.get(no) ?? 0 };
  });
  const last30 = last56.slice(26);
  const total = ctx.db.prepare(`SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND status = 'completed'`).get(playerId) as { n: number };
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const no = todayNo - 13 + i;
    return { day: new Date(no * 86400000).toISOString().slice(0, 10), played: played.has(no) };
  });
  return {
    player: { id: playerId, name: who.display_name },
    period: targetPeriod(ctx, playerId, kind, offset, nowMs),
    history: history(ctx, playerId, kind, nowMs),
    streak: {
      current: s.current,
      longest: s.longest,
      last14,
      last56,
      active_30: last30.filter((d) => d.rounds > 0).length,
      rounds_30: last30.reduce((n, d) => n + d.rounds, 0),
      total_rounds: total.n,
    },
    can_set: canSet,
  };
}

export function setTarget(ctx: Ctx, playerId: string, kind: 'week' | 'month', rounds: number, by: string, nowMs = Date.now()): void {
  const { timezone: tz, week_start: ws } = ctx.settings();
  const w = periodWindow(kind, 0, nowMs, tz, ws);
  const iso = new Date(nowMs).toISOString();
  ctx.db
    .prepare(
      `INSERT INTO player_targets (id, player_id, kind, period_start, target_rounds, set_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(player_id, kind, period_start) DO UPDATE SET target_rounds = excluded.target_rounds, set_by = excluded.set_by, updated_at = excluded.updated_at`,
    )
    .run(`tg_${newId()}`, playerId, kind, w.start, rounds, by, iso, iso);
}

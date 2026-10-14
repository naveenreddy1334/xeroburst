// Hubs (training locations) and attendance. A person belongs to at most one hub. Attendance is one row per person per
// local day, tagged with its source ('auto' today; 'nfc' or 'biometric' later), so every report counts presence the same way.

import { accuracyOf, aggregate, normalizeSummary } from '@nboard/shared';
import type { HubCompareRow, HubDTO, HubPerson, HubRef, HubSummary, Summary } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { dateKey } from '../util/time.js';

export type AttendanceSource = 'auto' | 'nfc' | 'biometric' | 'manual';

/** Records today's presence once (first one wins). Safe to call on every login and round. */
export function markPresent(ctx: Ctx, userId: string, source: AttendanceSource = 'auto'): void {
  const now = Date.now();
  const day = dateKey(now, ctx.settings().timezone);
  const u = ctx.db.prepare('SELECT hub_id FROM users WHERE id = ?').get(userId) as { hub_id: string | null } | undefined;
  if (!u) return;
  ctx.db
    .prepare('INSERT OR IGNORE INTO attendance (user_id, day, hub_id, source, first_at) VALUES (?,?,?,?,?)')
    .run(userId, day, u.hub_id, source, new Date(now).toISOString());
}

export function hubRef(ctx: Ctx, id: string | null | undefined): HubRef | null {
  if (!id) return null;
  return (ctx.db.prepare('SELECT id, name FROM hubs WHERE id = ?').get(id) as HubRef | undefined) ?? null;
}

export function hubExists(ctx: Ctx, id: string): boolean {
  return !!ctx.db.prepare('SELECT 1 FROM hubs WHERE id = ? AND is_active = 1').get(id);
}

export function listHubs(ctx: Ctx): HubDTO[] {
  const rows = ctx.db
    .prepare(
      `SELECT h.id, h.name, h.city, h.is_active, h.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.hub_id = h.id AND u.role = 'COACH' AND u.is_active = 1) AS coaches,
              (SELECT COUNT(*) FROM users u JOIN player_profiles p ON p.user_id = u.id WHERE u.hub_id = h.id) AS players,
              (SELECT COUNT(*) FROM users u JOIN player_profiles p ON p.user_id = u.id WHERE u.hub_id = h.id AND p.status = 'active' AND u.is_active = 1) AS active_players
         FROM hubs h ORDER BY h.is_active DESC, h.name COLLATE NOCASE`,
    )
    .all() as (Omit<HubDTO, 'is_active'> & { is_active: number })[];
  return rows.map((r) => ({ ...r, is_active: !!r.is_active }));
}

export function hubById(ctx: Ctx, id: string): HubDTO | null {
  return listHubs(ctx).find((h) => h.id === id) ?? null;
}

function dayKeys(ctx: Ctx, days: number): string[] {
  const tz = ctx.settings().timezone;
  const now = Date.now();
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(dateKey(now - i * 86_400_000, tz));
  return out;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function hubSummary(ctx: Ctx, hub: HubDTO, days: number): HubSummary {
  const keys = dayKeys(ctx, days);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const people = ctx.db
    .prepare(
      `SELECT u.id, u.display_name, u.role, u.is_active, p.player_code, p.status
         FROM users u LEFT JOIN player_profiles p ON p.user_id = u.id
        WHERE u.hub_id = ? AND u.role IN ('COACH','PLAYER') ORDER BY u.role, u.display_name COLLATE NOCASE`,
    )
    .all(hub.id) as { id: string; display_name: string; role: 'COACH' | 'PLAYER'; is_active: number; player_code: string | null; status: string | null }[];

  const att = ctx.db
    .prepare(
      `SELECT a.user_id, a.day, a.source, a.first_at FROM attendance a JOIN users u ON u.id = a.user_id
        WHERE u.hub_id = ? AND a.day >= ? AND a.day <= ?`,
    )
    .all(hub.id, keys[0]!, keys[keys.length - 1]!) as { user_id: string; day: string; source: string; first_at: string }[];
  const presentBy = new Map<string, { days: Set<string>; last: string | null }>();
  const sources: Record<string, number> = {};
  const dayCount = new Map<string, { coaches: number; players: number }>(keys.map((k) => [k, { coaches: 0, players: 0 }]));
  const roleOf = new Map(people.map((p) => [p.id, p.role]));
  for (const a of att) {
    const e = presentBy.get(a.user_id) ?? { days: new Set<string>(), last: null };
    e.days.add(a.day);
    if (!e.last || a.first_at > e.last) e.last = a.first_at;
    presentBy.set(a.user_id, e);
    sources[a.source] = (sources[a.source] ?? 0) + 1;
    const d = dayCount.get(a.day);
    if (d) (roleOf.get(a.user_id) === 'COACH' ? (d.coaches += 1) : (d.players += 1));
  }

  const rows = ctx.db
    .prepare(
      `SELECT s.user_id, s.summary_json FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE u.hub_id = ? AND u.role = 'PLAYER' AND s.status IN ('completed','interrupted') AND s.summary_json IS NOT NULL AND s.started_at >= ?`,
    )
    .all(hub.id, since) as { user_id: string; summary_json: string }[];
  const byUser = new Map<string, Summary[]>();
  for (const r of rows) {
    const l = byUser.get(r.user_id) ?? [];
    l.push(normalizeSummary(JSON.parse(r.summary_json) as Summary));
    byUser.set(r.user_id, l);
  }
  const mk = (p: (typeof people)[number]): HubPerson => {
    const pr = presentBy.get(p.id);
    const mine = byUser.get(p.id) ?? [];
    const a = aggregate(mine.map((summary) => ({ summary })));
    const active = p.role === 'COACH' ? !!p.is_active : !!p.is_active && p.status === 'active';
    return {
      id: p.id,
      name: p.display_name,
      code: p.player_code,
      role: p.role,
      active,
      days_present: pr?.days.size ?? 0,
      attendance_pct: Math.round(((pr?.days.size ?? 0) / days) * 1000) / 10,
      last_seen: pr?.last ?? null,
      rounds: mine.length,
      accuracy: mine.length ? accuracyOf(a) : null,
    };
  };
  const coaches = people.filter((p) => p.role === 'COACH').map(mk);
  const players = people.filter((p) => p.role === 'PLAYER').map(mk);
  const act = (l: HubPerson[]) => l.filter((x) => x.active);
  const rate = (l: HubPerson[]) => {
    const a = act(l);
    return pct(a.reduce((s, x) => s + x.days_present, 0), a.length * days);
  };
  const all = aggregate([...byUser.values()].flat().map((summary) => ({ summary })));
  return {
    hub,
    days,
    players_active: act(players).length,
    players_inactive: players.length - act(players).length,
    coach_attendance_pct: rate(coaches),
    player_attendance_pct: rate(players),
    rounds: rows.length,
    accuracy: rows.length ? accuracyOf(all) : null,
    avg_rt: all.avg_rt,
    sources,
    coaches,
    players,
    series: keys.map((day) => ({ day, ...dayCount.get(day)! })),
  };
}

export function compareHubs(ctx: Ctx, days: number): HubCompareRow[] {
  return listHubs(ctx)
    .filter((h) => h.is_active)
    .map((h) => {
      const s = hubSummary(ctx, h, days);
      return {
        hub: { id: h.id, name: h.name },
        coaches: s.coaches.length,
        players: s.players.length,
        players_active: s.players_active,
        coach_attendance_pct: s.coach_attendance_pct,
        player_attendance_pct: s.player_attendance_pct,
        rounds: s.rounds,
        accuracy: s.accuracy,
        avg_rt: s.avg_rt,
      };
    });
}

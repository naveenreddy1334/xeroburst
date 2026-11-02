// Finance for the Super Admin dashboard.
//
// This module never invents a figure. A FinanceSource says what was recorded; where nothing was recorded a figure says why it is
// missing instead of showing zero. Fees and payments are recorded (services/billing.ts), so revenue, collection and outstanding
// are real. Expenses are not recorded anywhere yet, so expenses and profit stay "not configured" until the owner defines them.
// Growth is only drawn when the period before has recorded revenue.

import type { FinanceMetric, FinanceRow, FinanceSummary, OrgTree } from '@nboard/shared';

export interface FinanceFigures {
  revenue: number;
  /** null when expenses are not recorded */
  expenses: number | null;
  /** Money still owed to the organization in the period */
  outstanding?: number;
  /** Money actually received, to derive a collection rate */
  collected?: number;
  currency: string;
}

export interface FinanceScope {
  hub_id: string;
  academy_id: string | null;
  branch_id: string | null;
}

export interface FinanceSource {
  readonly configured: boolean;
  /** Figures for one organization unit and period, or null when nothing was recorded for it. */
  figures(scope: FinanceScope, period: { from: string; to: string }): FinanceFigures | null;
}

/** The default: nothing is recorded, so nothing is reported. */
export const unconfiguredSource: FinanceSource = { configured: false, figures: () => null };

const NOT_CONFIGURED: FinanceMetric = { status: 'not_configured', value: null, note: 'Not configured. No financial data is recorded yet.' };
const AWAITING: FinanceMetric = { status: 'awaiting_rules', value: null, note: 'Awaiting finance rules.' };
const NEEDS_HISTORY: FinanceMetric = { status: 'needs_history', value: null, note: 'Needs a recorded earlier period.' };
const EARLY: FinanceMetric = { status: 'needs_history', value: null, note: 'Too early in this period to compare. Growth shows after the first week.' };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function periodRange(kind: 'month' | 'quarter' | 'year', on?: string): FinanceSummary['period'] {
  const d = on ? new Date(`${on}T00:00:00Z`) : new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  if (kind === 'year') return { kind, from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  if (kind === 'quarter') {
    const q = Math.floor(m / 3);
    return { kind, from: ymd(new Date(Date.UTC(y, q * 3, 1))), to: ymd(new Date(Date.UTC(y, q * 3 + 3, 0))), label: `Q${q + 1} ${y}` };
  }
  return { kind, from: ymd(new Date(Date.UTC(y, m, 1))), to: ymd(new Date(Date.UTC(y, m + 1, 0))), label: `${MONTHS[m]} ${y}` };
}

/** The period just before `p` (same kind). */
export function previousPeriod(p: FinanceSummary['period']): FinanceSummary['period'] {
  const d = new Date(`${p.from}T00:00:00Z`);
  d.setUTCDate(0);
  return periodRange(p.kind, ymd(d));
}

const avail = (value: number, currency: string): FinanceMetric => ({ status: 'available', value, currency });

const growthOf = (now: number | null, before: number | null): FinanceMetric =>
  now === null || before === null || before <= 0 ? NEEDS_HISTORY : avail(Math.round(((now - before) / before) * 1000) / 10, '%');

const addDaysYmd = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return ymd(t);
};

/**
 * `today` is the local date. A period that is still running is compared with the same number of days of the period before it
 * (month to date against the same days last month), so a month that began yesterday is not shown as a collapse against a full month.
 */
export function financeSummary(
  tree: OrgTree,
  period: FinanceSummary['period'],
  source: FinanceSource = unconfiguredSource,
  today?: string,
): FinanceSummary {
  const rows: FinanceRow[] = [];
  const full = previousPeriod(period);
  const running = !!today && today >= period.from && today < period.to;
  const elapsed = running ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86400000) + 1 : 0;
  const before = running ? { from: full.from, to: [addDaysYmd(full.from, elapsed - 1), full.to].sort()[0]! } : full;
  const nowPeriod = running ? { from: period.from, to: today! } : period;
  // A few days of money against the same few days last period is noise, so growth waits for a week of the new period.
  const tooEarly = running && elapsed < 7;
  const cfg = source.configured;
  const figs = (scope: FinanceScope, p: { from: string; to: string }) => (cfg ? source.figures(scope, p) : null);

  const metrics = (scope: FinanceScope) => {
    const f = figs(scope, period);
    if (!f) return { revenue: NOT_CONFIGURED, expenses: NOT_CONFIGURED, profit: AWAITING, collection: AWAITING, growth: NEEDS_HISTORY };
    const prev = figs(scope, before);
    const billed = f.collected !== undefined && f.outstanding !== undefined ? f.collected + f.outstanding : 0;
    return {
      revenue: avail(f.revenue, f.currency),
      expenses: f.expenses === null ? NOT_CONFIGURED : avail(f.expenses, f.currency),
      profit: f.expenses === null ? AWAITING : avail(f.revenue - f.expenses, f.currency),
      collection: billed > 0 ? avail(Math.round(((f.collected ?? 0) / billed) * 1000) / 10, '%') : AWAITING,
      growth: tooEarly ? EARLY : growthOf(running ? (figs(scope, nowPeriod)?.revenue ?? null) : f.revenue, prev ? prev.revenue : null),
    };
  };

  for (const h of tree.hubs) {
    const hubRef = { id: h.id, name: h.name };
    rows.push({ level: 'hub', hub: hubRef, academy: null, branch: null, label: h.name, players: h.players, active_players: h.active_players, coaches: h.coaches, ...metrics({ hub_id: h.id, academy_id: null, branch_id: null }) });
    for (const a of h.academies) {
      for (const b of a.branches) {
        rows.push({ level: 'branch', hub: hubRef, academy: { id: a.id, name: a.name }, branch: { id: b.id, name: b.name }, label: b.name, players: b.players, active_players: b.active_players, coaches: b.coaches.filter((c) => c.active).length, ...metrics({ hub_id: h.id, academy_id: a.id, branch_id: b.id }) });
      }
    }
    for (const b of h.branches) {
      rows.push({ level: 'branch', hub: hubRef, academy: null, branch: { id: b.id, name: b.name }, label: b.name, players: b.players, active_players: b.active_players, coaches: b.coaches.filter((c) => c.active).length, ...metrics({ hub_id: h.id, academy_id: null, branch_id: b.id }) });
    }
  }

  // Money is summed over hub rows only, since branch rows are inside their hub's figure. A hub that reported nothing adds nothing,
  // and the totals say so through the per-hub rows.
  const hubFigs = tree.hubs.map((h) => ({ name: h.name, f: figs({ hub_id: h.id, academy_id: null, branch_id: null }, period), prev: figs({ hub_id: h.id, academy_id: null, branch_id: null }, before) }));
  const reported = hubFigs.filter((x) => x.f);
  const anyData = cfg && reported.length > 0;
  const cur = reported[0]?.f?.currency ?? 'INR';
  const sum = (pick: (f: FinanceFigures) => number | null | undefined) => reported.reduce((n, x) => n + (pick(x.f!) ?? 0), 0);
  const revenue = sum((f) => f.revenue);
  const anyExpenses = reported.some((x) => x.f!.expenses !== null);
  const expenses = sum((f) => f.expenses);
  const collected = sum((f) => f.collected);
  const outstanding = sum((f) => f.outstanding);
  const prevReported = hubFigs.filter((x) => x.prev);
  const revenueToDate = running ? tree.hubs.reduce((n, h) => n + (figs({ hub_id: h.id, academy_id: null, branch_id: null }, nowPeriod)?.revenue ?? 0), 0) : revenue;
  const prevRevenue = prevReported.length ? prevReported.reduce((n, x) => n + x.prev!.revenue, 0) : null;
  const players = tree.totals.players;
  const ranked = reported.filter((x) => x.f!.revenue > 0).sort((a, b) => b.f!.revenue - a.f!.revenue);

  // Trend: the periods leading up to this one, recorded revenue only. Empty until a source exists.
  const steps = period.kind === 'month' ? 12 : period.kind === 'quarter' ? 12 : 3;
  const trend: FinanceSummary['trend'] = [];
  if (cfg) {
    let p = period;
    const back: FinanceSummary['period'][] = [];
    for (let i = 0; i < steps; i++) { back.unshift(p); p = previousPeriod(p); }
    for (const q of back) {
      const figsHere = tree.hubs.map((h) => figs({ hub_id: h.id, academy_id: null, branch_id: null }, q)).filter((x): x is FinanceFigures => !!x);
      const rev = figsHere.length ? figsHere.reduce((n, f) => n + f.revenue, 0) : null;
      const spent = figsHere.some((f) => f.expenses !== null) ? figsHere.reduce((n, f) => n + (f.expenses ?? 0), 0) : null;
      trend.push({
        label: q.kind === 'month' ? q.label.slice(0, 3) : q.label,
        // A month in a different year than the one shown needs the year to be read: "Nov 25".
        long: q.label,
        revenue: rev,
        expenses: spent,
        profit: rev !== null && spent !== null ? rev - spent : null,
        current: q.from === period.from,
      });
    }
  }

  return {
    period,
    capabilities: { revenue: cfg, expenses: anyExpenses, profit: anyExpenses, collection: cfg, period_filter: cfg },
    totals: {
      hubs: tree.totals.hubs,
      academies: tree.totals.academies,
      branches: tree.totals.branches,
      coaches: tree.totals.coaches,
      players,
      active_players: tree.totals.active_players,
      revenue: anyData ? avail(revenue, cur) : NOT_CONFIGURED,
      expenses: anyData && anyExpenses ? avail(expenses, cur) : NOT_CONFIGURED,
      profit: anyData && anyExpenses ? avail(revenue - expenses, cur) : AWAITING,
      revenue_per_player: anyData && players > 0 ? avail(Math.round(revenue / players), cur) : AWAITING,
      collection: anyData && collected + outstanding > 0 ? avail(Math.round((collected / (collected + outstanding)) * 1000) / 10, '%') : AWAITING,
      outstanding: anyData ? avail(outstanding, cur) : AWAITING,
      growth: anyData ? (tooEarly ? EARLY : growthOf(revenueToDate, prevRevenue)) : NEEDS_HISTORY,
      top_hub: ranked.length ? { name: ranked[0]!.name, revenue: ranked[0]!.f!.revenue } : null,
      lowest_hub: ranked.length > 1 ? { name: ranked[ranked.length - 1]!.name, revenue: ranked[ranked.length - 1]!.f!.revenue } : null,
    },
    trend,
    rows,
    planned: [
      { key: 'revenue_by_org', label: 'Revenue by hub, academy and branch', ready: cfg },
      { key: 'revenue_per_player', label: 'Revenue per player', ready: cfg },
      { key: 'collection', label: 'Collection status', ready: cfg },
      { key: 'outstanding', label: 'Outstanding balances', ready: cfg },
      { key: 'compare', label: 'Period comparison', ready: cfg },
      { key: 'expenses', label: 'Expense tracking', ready: anyExpenses },
      { key: 'pnl', label: 'Profit and loss', ready: anyExpenses },
      { key: 'export', label: 'Reports and exports', ready: false },
    ],
  };
}

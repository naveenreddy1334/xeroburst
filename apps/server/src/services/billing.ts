// What players pay, what they have paid, and the revenue figures built from it.
//
// Money is whole rupees. A fee plan sets a monthly amount; a player is put on a plan from a start month, and the amount is copied
// onto the player so changing a plan later never rewrites what someone was already charged. A payment belongs to the month it
// pays for ("period", YYYY-MM). There is no payment gateway connected: a payment made in the app is recorded as paid at once and
// the screen says so. Expenses are not recorded anywhere, so they stay "not configured".

import type { BillingDTO, BillingMonth, FeePlanDTO, PaymentDTO, PaymentLogDTO, PaymentLogItem, PaymentMethod } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError, notFound } from '../errors.js';
import { newId } from '../db/seed.js';
import { localMidnightUtc, localParts } from '../util/time.js';
import type { FinanceFigures, FinanceScope, FinanceSource } from './finance.js';

export const METHODS: PaymentMethod[] = ['upi', 'card', 'netbanking', 'cash'];
export const ONLINE_METHODS: PaymentMethod[] = ['upi', 'card', 'netbanking'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const ymOf = (ms: number, tz: string) => {
  const p = localParts(ms, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
};
export function monthsFrom(start: string, end: string): string[] {
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
export const addMonths = (ym: string, n: number): string => {
  const t = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};

// ---- plans ----------------------------------------------------------------------------------------------------------
interface PlanRow { id: string; name: string; amount: number; currency: string; is_active: number }
const planDTO = (r: PlanRow): FeePlanDTO => ({ id: r.id, name: r.name, amount: r.amount, currency: r.currency, is_active: !!r.is_active });

export function listPlans(ctx: Ctx): FeePlanDTO[] {
  return (ctx.db.prepare('SELECT id, name, amount, currency, is_active FROM fee_plans ORDER BY amount, name').all() as PlanRow[]).map(planDTO);
}
export function getPlan(ctx: Ctx, id: string): FeePlanDTO | null {
  const r = ctx.db.prepare('SELECT id, name, amount, currency, is_active FROM fee_plans WHERE id = ?').get(id) as PlanRow | undefined;
  return r ? planDTO(r) : null;
}
export function createPlan(ctx: Ctx, name: string, amount: number): FeePlanDTO {
  if (ctx.db.prepare('SELECT 1 FROM fee_plans WHERE name = ? COLLATE NOCASE').get(name)) throw new ApiError('CONFLICT', { fields: { name: 'A plan with this name exists.' } }, 'A plan with this name exists.');
  const id = `fp_${newId()}`;
  ctx.db.prepare('INSERT INTO fee_plans (id, name, amount, currency, is_active, created_at) VALUES (?,?,?,?,1,?)').run(id, name, amount, 'INR', new Date().toISOString());
  return getPlan(ctx, id)!;
}
export function updatePlan(ctx: Ctx, id: string, patch: { name?: string; amount?: number; is_active?: boolean }): FeePlanDTO {
  const cur = getPlan(ctx, id);
  if (!cur) throw notFound('Fee plan');
  if (patch.name && patch.name.toLowerCase() !== cur.name.toLowerCase() && ctx.db.prepare('SELECT 1 FROM fee_plans WHERE name = ? COLLATE NOCASE').get(patch.name)) {
    throw new ApiError('CONFLICT', { fields: { name: 'A plan with this name exists.' } }, 'A plan with this name exists.');
  }
  ctx.db
    .prepare('UPDATE fee_plans SET name = ?, amount = ?, is_active = ? WHERE id = ?')
    .run(patch.name ?? cur.name, patch.amount ?? cur.amount, (patch.is_active ?? cur.is_active) ? 1 : 0, id);
  return getPlan(ctx, id)!;
}

/** Put a player on a plan from a month. The plan's amount is copied, so a later price change does not touch past months. */
export function setPlayerFee(ctx: Ctx, playerId: string, planId: string, startPeriod?: string): void {
  const plan = getPlan(ctx, planId);
  if (!plan || !plan.is_active) throw new ApiError('VALIDATION', { fields: { plan_id: 'Choose an active fee plan.' } });
  const tz = ctx.settings().timezone;
  const start = startPeriod ?? (ctx.db.prepare('SELECT start_period FROM player_fees WHERE player_id = ?').get(playerId) as { start_period: string } | undefined)?.start_period ?? ymOf(Date.now(), tz);
  ctx.db
    .prepare(
      `INSERT INTO player_fees (player_id, plan_id, amount, start_period, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(player_id) DO UPDATE SET plan_id = excluded.plan_id, amount = excluded.amount, start_period = excluded.start_period, updated_at = excluded.updated_at`,
    )
    .run(playerId, plan.id, plan.amount, start, new Date().toISOString());
}

// ---- a player's billing -----------------------------------------------------------------------------------------------
interface PayRow { id: string; period: string; amount: number; currency: string; method: PaymentMethod; status: PaymentDTO['status']; reference: string | null; paid_at: string | null; created_at: string }
const payDTO = (r: PayRow): PaymentDTO => ({ id: r.id, period: r.period, amount: r.amount, currency: r.currency, method: r.method, status: r.status, reference: r.reference, paid_at: r.paid_at, created_at: r.created_at });

export function billingFor(ctx: Ctx, playerId: string, canPay: boolean, nowMs = Date.now()): BillingDTO {
  const tz = ctx.settings().timezone;
  const who = ctx.db.prepare(`SELECT id, display_name FROM users WHERE id = ? AND role = 'PLAYER'`).get(playerId) as { id: string; display_name: string } | undefined;
  if (!who) throw notFound('Player');
  const fee = ctx.db.prepare('SELECT plan_id, amount, start_period FROM player_fees WHERE player_id = ?').get(playerId) as { plan_id: string; amount: number; start_period: string } | undefined;
  const pays = ctx.db
    .prepare('SELECT id, period, amount, currency, method, status, reference, paid_at, created_at FROM payments WHERE player_id = ? ORDER BY COALESCE(paid_at, created_at) DESC')
    .all(playerId) as PayRow[];
  const now = ymOf(nowMs, tz);
  const months: BillingMonth[] = [];
  if (fee) {
    for (const ym of monthsFrom(fee.start_period, now)) {
      const paid = pays.filter((p) => p.period === ym && p.status === 'paid').reduce((n, p) => n + p.amount, 0);
      const status: BillingMonth['status'] = paid >= fee.amount ? 'paid' : ym < now ? 'overdue' : paid > 0 ? 'partial' : 'due';
      months.push({ period: ym, label: monthLabel(ym), due: fee.amount, paid, status: paid > 0 && paid < fee.amount && ym < now ? 'partial' : status });
    }
  }
  const billed = months.reduce((n, m) => n + m.due, 0);
  const paidAll = pays.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount, 0);
  const outstanding = months.reduce((n, m) => n + Math.max(0, m.due - m.paid), 0);
  return {
    player: { id: who.id, name: who.display_name },
    plan: fee ? getPlan(ctx, fee.plan_id) : null,
    monthly_amount: fee?.amount ?? null,
    start_period: fee?.start_period ?? null,
    currency: 'INR',
    summary: { billed, paid: paidAll, outstanding },
    months: months.reverse(),
    payments: pays.map(payDTO),
    methods: canPay ? METHODS : [],
    can_pay: canPay,
    gateway: 'demo',
  };
}

export function recordPayment(
  ctx: Ctx,
  playerId: string,
  by: { id: string; role: string },
  body: { method: PaymentMethod; period?: string; amount?: number },
  nowMs = Date.now(),
): PaymentDTO {
  const isSelf = by.id === playerId;
  if (isSelf && !ONLINE_METHODS.includes(body.method)) throw new ApiError('VALIDATION', { fields: { method: 'Cash is recorded by your coach. Choose UPI, card or net banking.' } });
  const b = billingFor(ctx, playerId, true, nowMs);
  if (!b.plan || b.monthly_amount === null) throw new ApiError('VALIDATION', { fields: { _: 'This player has no fee plan yet.' } }, 'This player has no fee plan yet.');
  // Without a month, pay the oldest month that is not fully paid.
  let target = body.period ? b.months.find((m) => m.period === body.period) : [...b.months].reverse().find((m) => m.paid < m.due);
  // A month that has not started yet can be paid in advance (up to 12 months ahead).
  if (body.period && !target) {
    const nowYm = ymOf(nowMs, ctx.settings().timezone);
    if (/^\d{4}-\d{2}$/.test(body.period) && body.period > nowYm && body.period <= addMonths(nowYm, 12)) {
      const paid = (ctx.db.prepare(`SELECT COALESCE(SUM(amount),0) n FROM payments WHERE player_id = ? AND period = ? AND status = 'paid'`).get(playerId, body.period) as { n: number }).n;
      target = { period: body.period, label: monthLabel(body.period), due: b.monthly_amount, paid, status: paid > 0 ? 'partial' : 'due' };
    }
  }
  if (body.period && !target) throw new ApiError('VALIDATION', { fields: { period: 'That month is not billed.' } });
  if (!target) throw new ApiError('VALIDATION', { fields: { _: 'Everything is paid up.' } }, 'Everything is paid up.');
  const remaining = Math.max(0, target.due - target.paid);
  if (remaining === 0) throw new ApiError('VALIDATION', { fields: { period: `${target.label} is already paid.` } }, `${target.label} is already paid.`);
  const amount = body.amount ?? remaining;
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) {
    throw new ApiError('VALIDATION', { fields: { amount: `Enter a whole amount up to ${remaining}.` } }, `Enter a whole amount up to ${remaining}.`);
  }
  const id = `pay_${newId()}`;
  const iso = new Date(nowMs).toISOString();
  const reference = `XB${nowMs.toString(36).toUpperCase()}${id.slice(-3).toUpperCase()}`;
  ctx.db
    .prepare(`INSERT INTO payments (id, player_id, plan_id, period, amount, currency, method, status, reference, paid_at, created_at, recorded_by) VALUES (?,?,?,?,?,'INR',?,'paid',?,?,?,?)`)
    .run(id, playerId, b.plan.id, target.period, amount, body.method, reference, iso, iso, by.id);
  return payDTO(ctx.db.prepare('SELECT id, period, amount, currency, method, status, reference, paid_at, created_at FROM payments WHERE id = ?').get(id) as PayRow);
}

// ---- revenue, from the payments table -----------------------------------------------------------------------------------
/** The finance source the Super Admin screens read. Configured as soon as one fee plan exists. */
export function paymentsSource(ctx: Ctx): FinanceSource {
  return {
    get configured() {
      return !!ctx.db.prepare('SELECT 1 FROM fee_plans LIMIT 1').get();
    },
    figures(scope: FinanceScope, period: { from: string; to: string }): FinanceFigures | null {
      const tz = ctx.settings().timezone;
      const where = scope.branch_id ? 'u.branch_id = ?' : 'u.hub_id = ?';
      const arg = scope.branch_id ?? scope.hub_id;
      const fees = ctx.db
        .prepare(`SELECT f.amount, f.start_period FROM player_fees f JOIN users u ON u.id = f.player_id WHERE u.is_active = 1 AND ${where}`)
        .all(arg) as { amount: number; start_period: string }[];
      // Nothing to report for a period before any fee started.
      const startedBy = fees.filter((f) => f.start_period <= period.to.slice(0, 7));
      if (startedBy.length === 0) return null;
      const [fy, fm, fd] = period.from.split('-').map(Number) as [number, number, number];
      const [ty, tm, td] = period.to.split('-').map(Number) as [number, number, number];
      const fromIso = new Date(localMidnightUtc(fy, fm, fd, tz)).toISOString();
      const toIso = new Date(localMidnightUtc(ty, tm, td + 1, tz)).toISOString();
      const revenue = (ctx.db
        .prepare(`SELECT COALESCE(SUM(p.amount),0) n FROM payments p JOIN users u ON u.id = p.player_id WHERE p.status = 'paid' AND p.paid_at >= ? AND p.paid_at < ? AND ${where}`)
        .get(fromIso, toIso, arg) as { n: number }).n;
      // Billed for the months of this period that have started, against what was paid for those months.
      const nowYm = ymOf(Date.now(), tz);
      const months = monthsFrom(period.from.slice(0, 7), period.to.slice(0, 7)).filter((m) => m <= nowYm);
      let billed = 0;
      for (const f of startedBy) billed += months.filter((m) => m >= f.start_period).length * f.amount;
      let paidFor = 0;
      if (months.length) {
        paidFor = (ctx.db
          .prepare(`SELECT COALESCE(SUM(p.amount),0) n FROM payments p JOIN users u ON u.id = p.player_id WHERE p.status = 'paid' AND p.period IN (${months.map(() => '?').join(',')}) AND ${where}`)
          .get(...months, arg) as { n: number }).n;
      }
      const collected = Math.min(paidFor, billed);
      // Expenses: recorded by month for the hub (or the branch). None recorded for these months means "not recorded", not zero.
      const spendMonths = monthsFrom(period.from.slice(0, 7), period.to.slice(0, 7)).filter((m) => m <= nowYm);
      let expenses: number | null = null;
      if (spendMonths.length) {
        const col = scope.branch_id ? 'branch_id' : 'hub_id';
        const row = ctx.db
          .prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) n FROM expenses WHERE ${col} = ? AND period IN (${spendMonths.map(() => '?').join(',')})`)
          .get(arg, ...spendMonths) as { c: number; n: number };
        if (row.c > 0) expenses = row.n;
      }
      return { revenue, expenses, collected, outstanding: Math.max(0, billed - collected), currency: 'INR' };
    },
  };
}

// ---- the payment log (Super Admin) --------------------------------------------------------------------------------------
/** Every payment, newest first, with the player, hub, branch and who took it. Filters narrow the list and the total together. */
export function paymentLog(
  ctx: Ctx,
  q: { limit: number; offset: number; hub_id?: string; method?: PaymentMethod; period?: string; q?: string },
): PaymentLogDTO {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (q.hub_id) { where.push('u.hub_id = ?'); args.push(q.hub_id); }
  if (q.method) { where.push('p.method = ?'); args.push(q.method); }
  if (q.period) { where.push('p.period = ?'); args.push(q.period); }
  if (q.q) {
    where.push("(u.display_name LIKE ? ESCAPE '\\' OR u.login_id LIKE ? ESCAPE '\\')");
    const like = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM payments p JOIN users u ON u.id = p.player_id
      LEFT JOIN hubs h ON h.id = u.hub_id LEFT JOIN branches b ON b.id = u.branch_id LEFT JOIN users r ON r.id = p.recorded_by ${w}`;
  const sum = ctx.db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END),0) n ${from}`).get(...args) as { c: number; n: number };
  const rows = ctx.db
    .prepare(
      `SELECT p.id, p.player_id, u.display_name player_name, u.login_id player_login, u.hub_id, h.name hub_name, u.branch_id, b.name branch_name,
              p.period, p.amount, p.currency, p.method, p.status, p.reference, p.paid_at, p.created_at, r.display_name recorded_by_name, p.recorded_by
         ${from} ORDER BY COALESCE(p.paid_at, p.created_at) DESC, p.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, q.limit, q.offset) as (Omit<PaymentLogItem, 'recorded_by_self'> & { recorded_by: string | null })[];
  const items: PaymentLogItem[] = rows.map(({ recorded_by, ...r }) => ({ ...r, recorded_by_self: recorded_by === r.player_id }));
  return { items, total: sum.c, total_amount: sum.n, limit: q.limit, offset: q.offset };
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PW, makeEnv } from './helpers.js';
import type { TestEnv } from './helpers.js';
import { seedDemoOrg } from '../src/cli/demo-org.js';

let env: TestEnv;
const tok: Record<string, string> = {};
const ids: Record<string, string> = {};
const DEMO_PW = 'Demo-pass-2026';

beforeAll(async () => {
  env = await makeEnv();
  await seedDemoOrg(env.ctx);
  tok.sa = await env.token('super.sunita', DEMO_PW);
  tok.hm = await env.token('hubadmin.cc', DEMO_PW);
  tok.co = await env.token('coach.heb', DEMO_PW);
  const row = (n: string) => env.ctx.db.prepare('SELECT id, login_id FROM users WHERE display_name = ?').get(n) as { id: string; login_id: string };
  for (const [k, n] of [['arjun', 'Arjun Mehta'], ['kabir', 'Kabir Singh'], ['meera', 'Meera Nair'], ['isha', 'Isha Verma']] as const) ids[k] = row(n).id;
  // Players log in with their code and PIN; the demo PINs are derived from the code number.
  const pin = (n: string) => String(100000 + ((Number(row(n).login_id.slice(3)) * 7919) % 900000));
  tok.arjun = await env.token(row('Arjun Mehta').login_id, pin('Arjun Mehta'));
  tok.kabir = await env.token(row('Kabir Singh').login_id, pin('Kabir Singh'));
});
afterAll(() => env.close());

describe('finance from payments', () => {
  it('shows real revenue for the current month, per hub, with collection and growth', async () => {
    const r = await env.req('GET', '/finance/summary?period=month', tok.sa);
    expect(r.status).toBe(200);
    const t = r.body.totals;
    expect(r.body.capabilities.revenue).toBe(true);
    expect(t.revenue.status).toBe('available');
    expect(t.revenue.value).toBeGreaterThan(0);
    // The demo organization records what each hub spends, so expenses and profit are real figures: profit is revenue minus expenses.
    expect(t.expenses.status).toBe('available');
    expect(t.expenses.value).toBeGreaterThan(0);
    expect(t.profit.status).toBe('available');
    expect(t.profit.value).toBe(t.revenue.value - t.expenses.value);
    expect(t.collection.status).toBe('available');
    expect(t.outstanding.status).toBe('available');
    expect(r.body.trend.length).toBe(12);
    expect(r.body.trend.every((x: any) => x.profit === null || x.profit === x.revenue - x.expenses)).toBe(true);
    expect(r.body.trend.filter((x: any) => x.current)).toHaveLength(1);
    const hubs = r.body.rows.filter((x: any) => x.level === 'hub');
    expect(hubs).toHaveLength(4);
    // The hub rows add up to the total.
    expect(hubs.reduce((n: number, h: any) => n + (h.revenue.value ?? 0), 0)).toBe(t.revenue.value);
  });

  it('past months have revenue and growth is computed from a recorded earlier month', async () => {
    const d = new Date();
    const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 15)).toISOString().slice(0, 10);
    const r = await env.req('GET', `/finance/summary?period=month&on=${prev}`, tok.sa);
    expect(r.body.totals.revenue.value).toBeGreaterThan(0);
    expect(r.body.totals.growth.status).toBe('available');
    expect(r.body.totals.top_hub).not.toBeNull();
  });

  it('has two years of history: the first month is a loss, later months make a profit', async () => {
    const r = await env.req('GET', '/finance/summary?period=quarter', tok.sa);
    expect(r.body.trend.length).toBe(12);
    const withData = r.body.trend.filter((x: any) => x.revenue !== null);
    expect(withData.length).toBeGreaterThanOrEqual(11);
    expect(withData[withData.length - 2].profit).toBeGreaterThan(0);
    const y = await env.req('GET', '/finance/summary?period=year', tok.sa);
    expect(y.body.trend.map((x: any) => x.label)).toHaveLength(3);
    expect(y.body.trend.filter((x: any) => x.revenue !== null).length).toBeGreaterThanOrEqual(2);
  });

  it('only the Super Admin sees finance', async () => {
    expect((await env.req('GET', '/finance/summary', tok.hm)).status).toBe(403);
    expect((await env.req('GET', '/finance/summary', tok.co)).status).toBe(403);
  });

  it('is not configured when there is no fee plan', async () => {
    const e2 = await makeEnv();
    await e2.addUser('sa2', 'SUPER_ADMIN');
    const t = await e2.token('sa2', PW);
    const r = await e2.req('GET', '/finance/summary', t);
    expect(r.body.totals.revenue.status).toBe('not_configured');
    expect(r.body.trend).toEqual([]);
    await e2.close();
  });
});

describe('a player pays', () => {
  it('shows plan, months, history and what is outstanding', async () => {
    const b = (await env.req('GET', `/players/${ids.kabir}/billing`, tok.kabir)).body;
    expect(b.plan.name).toBe('Starter');
    expect(b.can_pay).toBe(true);
    expect(b.summary.outstanding).toBeGreaterThan(0);
    expect(b.months.some((m: any) => m.status === 'overdue' || m.status === 'partial')).toBe(true);
    expect(b.gateway).toBe('demo');
  });

  it('pays the oldest unpaid month with UPI, then the history and balance change', async () => {
    const before = (await env.req('GET', `/players/${ids.kabir}/billing`, tok.kabir)).body;
    const r = await env.req('POST', `/players/${ids.kabir}/payments`, tok.kabir, { method: 'upi' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.payment.status).toBe('paid');
    expect(r.body.payment.reference).toMatch(/^XB/);
    expect(r.body.billing.summary.outstanding).toBeLessThan(before.summary.outstanding);
    expect(r.body.billing.payments.length).toBe(before.payments.length + 1);
  });

  it('a player cannot pay in cash or for someone else; a coach can record cash', async () => {
    expect((await env.req('POST', `/players/${ids.kabir}/payments`, tok.kabir, { method: 'cash' })).status).toBe(422);
    expect((await env.req('GET', `/players/${ids.arjun}/billing`, tok.kabir)).status).toBeGreaterThanOrEqual(403);
    expect((await env.req('POST', `/players/${ids.arjun}/payments`, tok.kabir, { method: 'upi' })).status).toBeGreaterThanOrEqual(403);
    const due = (await env.req('GET', `/players/${ids.kabir}/billing`, tok.co)).body;
    if (due.summary.outstanding > 0) {
      const r = await env.req('POST', `/players/${ids.kabir}/payments`, tok.co, { method: 'cash', amount: 1 });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    }
  });

  it('rejects an amount above what is owed and a fully paid month', async () => {
    const r = await env.req('POST', `/players/${ids.arjun}/payments`, tok.co, { method: 'cash', amount: 999999 });
    expect(r.status).toBe(422);
  });

  it('a coach in another hub cannot see this player', async () => {
    const t = await env.token('coach.mmcf', DEMO_PW);
    expect((await env.req('GET', `/players/${ids.arjun}/billing`, t)).status).toBeGreaterThanOrEqual(403);
  });

  it('only the Super Admin sets up plans', async () => {
    expect((await env.req('POST', '/fee-plans', tok.hm, { name: 'Gold', amount: 5000 })).status).toBe(403);
    const r = await env.req('POST', '/fee-plans', tok.sa, { name: 'Gold', amount: 5000 });
    expect(r.status).toBe(201);
    expect((await env.req('POST', '/fee-plans', tok.sa, { name: 'gold', amount: 5000 })).status).toBe(409);
    expect((await env.req('PUT', `/players/${ids.kabir}/fee`, tok.co, { plan_id: r.body.id })).status).toBe(403);
    expect((await env.req('PUT', `/players/${ids.kabir}/fee`, tok.hm, { plan_id: r.body.id })).status).toBe(200);
  });
});

describe('streak and target', () => {
  it('counts the streak from consecutive days played', async () => {
    const a = (await env.req('GET', `/players/${ids.arjun}/progress?kind=month`, tok.arjun)).body;
    expect(a.streak.current).toBe(12);
    expect(a.streak.longest).toBeGreaterThanOrEqual(12);
    expect(a.streak.last14).toHaveLength(14);
    const k = (await env.req('GET', `/players/${ids.kabir}/progress?kind=month`, tok.kabir)).body;
    expect(k.streak.current).toBe(0);
  });

  it('draws the ghost from the target and the actual from rounds played, for a finished period too', async () => {
    const m = (await env.req('GET', `/players/${ids.arjun}/progress?kind=month&offset=-1`, tok.arjun)).body;
    expect(m.period.target).toBeGreaterThan(0);
    expect(m.period.actual).toBeGreaterThan(0);
    expect(m.period.series.length).toBe(m.period.days);
    const last = m.period.series[m.period.series.length - 1];
    expect(last.ghost).toBe(m.period.target);
    expect(last.actual).toBe(m.period.actual);
    expect(m.period.is_current).toBe(false);
    expect(m.history.length).toBeGreaterThan(0);
  });

  it('a player sets this period\'s target and it appears on the chart', async () => {
    const r = await env.req('PUT', `/players/${ids.kabir}/target`, tok.kabir, { kind: 'week', target_rounds: 14 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.period.target).toBe(14);
    expect(r.body.period.series[6].ghost).toBe(14);
    expect(r.body.period.is_current).toBe(true);
    expect((await env.req('PUT', `/players/${ids.kabir}/target`, tok.kabir, { kind: 'week', target_rounds: 0 })).status).toBe(422);
    expect((await env.req('PUT', `/players/${ids.arjun}/target`, tok.kabir, { kind: 'week', target_rounds: 5 })).status).toBeGreaterThanOrEqual(403);
  });

  it('a coach sets a target for their own player', async () => {
    expect((await env.req('PUT', `/players/${ids.meera}/target`, tok.co, { kind: 'month', target_rounds: 40 })).status).toBe(200);
    expect((await env.req('PUT', `/players/${ids.isha}/target`, tok.co, { kind: 'month', target_rounds: 40 })).status).toBeGreaterThanOrEqual(403);
  });
});

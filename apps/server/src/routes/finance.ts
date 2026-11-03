// Finance dashboard API (Super Admin) and the fee, payment, streak and target routes for players.
// Registered from here so app.ts does not change. See services/finance.ts: no figure is ever invented.

import type { FastifyInstance } from 'fastify';
import { financePeriodQuery, paymentLogQuery } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import type { Guards } from '../rbac/guard.js';
import { parse } from '../util/http.js';
import { buildOrgTree } from '../services/org.js';
import { financeSummary, periodRange, type FinanceSource } from '../services/finance.js';
import { paymentLog, paymentsSource } from '../services/billing.js';
import { dateKey } from '../util/time.js';
import { billingRoutes } from './billing.js';

export function financeRoutes(app: FastifyInstance, ctx: Ctx, g: Guards, source: FinanceSource = paymentsSource(ctx)) {
  app.get('/finance/summary', { preHandler: g.need('VIEW_FINANCE') }, async (req) => {
    const q = parse(financePeriodQuery, req.query);
    const tree = buildOrgTree(ctx, req.auth);
    if (q.hub_id) tree.hubs = tree.hubs.filter((h) => h.id === q.hub_id);
    // "Today" is the organization's local date, so the month a screen opens on is the month people are in.
    const on = q.on ?? dateKey(Date.now(), ctx.settings().timezone);
    return financeSummary(tree, periodRange(q.period, on), source, dateKey(Date.now(), ctx.settings().timezone));
  });

  // Every payment made, for the Super Admin: the log behind the revenue figures.
  app.get('/finance/payments', { preHandler: g.need('VIEW_FINANCE') }, async (req) => paymentLog(ctx, parse(paymentLogQuery, req.query)));

  billingRoutes(app, ctx, g);
}

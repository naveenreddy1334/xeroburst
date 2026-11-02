// Fee plans, a player's payments, and a player's streak and rounds target.
// A player reaches their own; staff reach the players in their scope. Only the Super Admin sets up fee plans.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { feePlanBody, feePlanPatch, paymentBody, progressQuery, setFeeBody, targetBody } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError } from '../errors.js';
import { auditReq } from '../audit.js';
import type { Actor, Guards } from '../rbac/guard.js';
import { playerInScope } from '../rbac/scope.js';
import { parse } from '../util/http.js';
import { billingFor, createPlan, listPlans, recordPayment, setPlayerFee, updatePlan } from '../services/billing.js';
import { progressFor, setTarget } from '../services/targets.js';

const idParam = z.object({ id: z.string().min(1).max(64) });
const FEE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HUB_MANAGER', 'BRANCH_MANAGER'];

export function billingRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  /** The player themselves, or staff whose scope holds the player. */
  const reach = (actor: Actor, id: string) => {
    if (actor.id === id && actor.role === 'PLAYER') return { self: true };
    if (actor.role === 'PLAYER') throw new ApiError('OUT_OF_SCOPE');
    if (!actor.permissions.includes('MANAGE_PLAYERS') && !actor.permissions.includes('VIEW_RESULTS')) throw new ApiError('FORBIDDEN');
    playerInScope(ctx, actor, id);
    return { self: false };
  };

  // ---- fee plans --------------------------------------------------------------------------------------------------
  app.get('/fee-plans', { preHandler: g.signedIn }, async (req) => {
    if (req.auth.role === 'PLAYER') throw new ApiError('FORBIDDEN');
    return { items: listPlans(ctx) };
  });
  app.post('/fee-plans', { preHandler: g.need('VIEW_FINANCE') }, async (req, reply) => {
    const b = parse(feePlanBody, req.body);
    const plan = createPlan(ctx, b.name, b.amount);
    auditReq(ctx.db, req, 'FEE_PLAN_CREATED', 'fee_plan', plan.id, { name: plan.name, amount: plan.amount });
    reply.code(201).send(plan);
  });
  app.patch('/fee-plans/:id', { preHandler: g.need('VIEW_FINANCE') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const plan = updatePlan(ctx, id, parse(feePlanPatch, req.body));
    auditReq(ctx.db, req, 'FEE_PLAN_UPDATED', 'fee_plan', id, { name: plan.name, amount: plan.amount, active: plan.is_active });
    return plan;
  });

  // ---- a player's fees and payments ---------------------------------------------------------------------------------
  app.get('/players/:id/billing', { preHandler: g.signedIn }, async (req) => {
    const { id } = parse(idParam, req.params);
    const r = reach(req.auth, id);
    return billingFor(ctx, id, r.self || FEE_ROLES.includes(req.auth.role) || req.auth.role === 'COACH');
  });

  app.put('/players/:id/fee', { preHandler: g.signedIn }, async (req) => {
    const { id } = parse(idParam, req.params);
    reach(req.auth, id);
    if (!FEE_ROLES.includes(req.auth.role)) throw new ApiError('FORBIDDEN', undefined, 'Only an admin or manager can set a fee plan.');
    const b = parse(setFeeBody, req.body);
    setPlayerFee(ctx, id, b.plan_id, b.start_period);
    auditReq(ctx.db, req, 'PLAYER_FEE_SET', 'player', id, { plan_id: b.plan_id });
    return billingFor(ctx, id, true);
  });

  app.post('/players/:id/payments', { preHandler: g.signedIn }, async (req, reply) => {
    const { id } = parse(idParam, req.params);
    reach(req.auth, id);
    const b = parse(paymentBody, req.body);
    const pay = recordPayment(ctx, id, req.auth, b);
    auditReq(ctx.db, req, 'PAYMENT_RECORDED', 'player', id, { payment_id: pay.id, period: pay.period, amount: pay.amount, method: pay.method });
    reply.code(201).send({ payment: pay, billing: billingFor(ctx, id, true) });
  });

  // ---- streak and target ------------------------------------------------------------------------------------------
  app.get('/players/:id/progress', { preHandler: g.signedIn }, async (req) => {
    const { id } = parse(idParam, req.params);
    const r = reach(req.auth, id);
    const q = parse(progressQuery, req.query);
    return progressFor(ctx, id, q.kind, q.offset, true && (r.self || req.auth.permissions.includes('MANAGE_PLAYERS')));
  });

  app.put('/players/:id/target', { preHandler: g.signedIn }, async (req) => {
    const { id } = parse(idParam, req.params);
    const r = reach(req.auth, id);
    if (!r.self && !req.auth.permissions.includes('MANAGE_PLAYERS')) throw new ApiError('FORBIDDEN');
    const b = parse(targetBody, req.body);
    setTarget(ctx, id, b.kind, b.target_rounds, req.auth.id);
    auditReq(ctx.db, req, 'TARGET_SET', 'player', id, { kind: b.kind, rounds: b.target_rounds });
    return progressFor(ctx, id, b.kind, 0, true);
  });
}

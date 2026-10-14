// The request pipeline (section 14): authenticate, then permission. Rank, scope and game-lock checks
// are made in the handlers with the helpers in scope.ts, before the body is validated or acted on.

import type { FastifyReply, FastifyRequest } from 'fastify';
import { permissionsFor } from '@nboard/shared';
import type { Permission, Role } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError } from '../errors.js';

export interface Actor {
  id: string;
  login_id: string;
  display_name: string;
  role: Role;
  permissions: Permission[];
  grants: Permission[];
  must_change: boolean;
  hub_id: string | null;
  sid: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: Actor;
  }
  interface FastifyContextConfig {
    /** The route may be used while a password change is pending. */
    allowMustChange?: boolean;
  }
}

interface UserRow {
  id: string;
  login_id: string;
  display_name: string;
  role: Role;
  token_version: number;
  must_change_password: number;
  is_active: number;
  hub_id: string | null;
}

export function loadGrants(ctx: Ctx, userId: string): Permission[] {
  return (ctx.db.prepare('SELECT permission FROM user_permission_grants WHERE user_id = ?').all(userId) as { permission: Permission }[]).map(
    (r) => r.permission,
  );
}

export function makeGuards(ctx: Ctx) {
  async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    let payload: { sub?: string; tv?: number; sid?: string };
    try {
      payload = await req.jwtVerify<{ sub?: string; tv?: number; sid?: string }>();
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      throw new ApiError(code.includes('EXPIRED') ? 'TOKEN_EXPIRED' : 'AUTH_REQUIRED');
    }
    // The server loads the user on every request, so deactivation, a reset or a role change bites at once.
    const u = ctx.db
      .prepare('SELECT id, login_id, display_name, role, token_version, must_change_password, is_active, hub_id FROM users WHERE id = ?')
      .get(payload.sub ?? '') as UserRow | undefined;
    if (!u || !u.is_active || u.token_version !== payload.tv) throw new ApiError('AUTH_REQUIRED');
    const sess = ctx.db
      .prepare('SELECT 1 FROM auth_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?')
      .get(payload.sid ?? '', u.id, new Date().toISOString());
    if (!sess) throw new ApiError('AUTH_REQUIRED');

    const grants = loadGrants(ctx, u.id);
    req.auth = {
      id: u.id,
      login_id: u.login_id,
      display_name: u.display_name,
      role: u.role,
      grants,
      permissions: permissionsFor(u.role, grants),
      must_change: !!u.must_change_password,
      hub_id: u.hub_id ?? null,
      sid: payload.sid!,
    };
    if (req.auth.must_change && !req.routeOptions.config?.allowMustChange) {
      throw new ApiError('PASSWORD_CHANGE_REQUIRED');
    }
  }

  /** Any one of the listed permissions is enough. */
  function need(...perms: Permission[]) {
    return [
      authenticate,
      async (req: FastifyRequest) => {
        if (!perms.some((p) => req.auth.permissions.includes(p))) {
          throw new ApiError('FORBIDDEN', { needs: perms });
        }
      },
    ];
  }

  return { authenticate, signedIn: [authenticate], need };
}

export type Guards = ReturnType<typeof makeGuards>;

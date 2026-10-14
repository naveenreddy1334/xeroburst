import type { FastifyRequest } from 'fastify';
import type { DB } from './db/index.js';

export interface AuditInput {
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Never put a password, PIN or token in `detail`. */
export function writeAudit(db: DB, a: AuditInput): void {
  db.prepare(
    'INSERT INTO audit_log (ts, actor_id, action, target_type, target_id, detail_json, source_ip) VALUES (?,?,?,?,?,?,?)',
  ).run(
    new Date().toISOString(),
    a.actorId,
    a.action,
    a.targetType ?? null,
    a.targetId ?? null,
    a.detail ? JSON.stringify(a.detail) : null,
    a.ip ?? null,
  );
}

export function auditReq(
  db: DB,
  req: FastifyRequest,
  action: string,
  targetType?: string | null,
  targetId?: string | null,
  detail?: Record<string, unknown> | null,
): void {
  writeAudit(db, { actorId: req.auth?.id ?? null, action, targetType, targetId, detail, ip: req.ip });
}

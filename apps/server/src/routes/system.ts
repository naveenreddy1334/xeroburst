import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_VERSION, settingsBody } from '@nboard/shared';
import type { AuditEntryDTO, BackupResponse, DeviceSessionDTO, SystemInfo } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { ApiError } from '../errors.js';
import { auditReq } from '../audit.js';
import type { Guards } from '../rbac/guard.js';
import { pagingQuery, parse } from '../util/http.js';
import { isValidTimezone } from '../util/time.js';

export async function backupDatabase(ctx: Ctx): Promise<BackupResponse> {
  if (ctx.cfg.dbFile === ':memory:') throw new ApiError('CONFLICT', undefined, 'In-memory database cannot be backed up.');
  const dir = path.join(ctx.cfg.dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = path.join(dir, `nboard-${stamp}.db`);
  await ctx.db.backup(file);
  return { file, bytes: fs.statSync(file).size, created_at: new Date().toISOString() };
}

export function systemRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  app.get('/health', async () => ({ ok: true }));

  app.get('/system/info', async () => {
    const out: SystemInfo = {
      name: 'XeroBurst server',
      version: ctx.cfg.version,
      api_version: API_VERSION,
      min_app_version: ctx.cfg.minAppVersion,
      org_name: ctx.settings().org_name,
      time: new Date().toISOString(),
      board: ctx.hub.status(false),
    };
    return out;
  });

  app.get('/audit', { preHandler: g.need('VIEW_AUDIT') }, async (req) => {
    const q = parse(
      pagingQuery.extend({
        actor: z.string().max(64).optional(),
        action: z.string().max(60).optional(),
        from: z.string().max(40).optional(),
        to: z.string().max(40).optional(),
      }),
      req.query,
    );
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.actor) {
      // The app sends what the person typed: an id, a login ID or part of a name.
      where.push('(a.actor_id = ? OR a.actor_id IN (SELECT id FROM users WHERE login_id LIKE ? OR display_name LIKE ?))');
      params.push(q.actor, `%${q.actor.toLowerCase().replace(/[%_]/g, '')}%`, `%${q.actor.replace(/[%_]/g, '')}%`);
    }
    if (q.action) {
      where.push('a.action = ?');
      params.push(q.action);
    }
    if (q.from) {
      where.push('a.ts >= ?');
      params.push(q.from);
    }
    if (q.to) {
      where.push('a.ts < ?');
      params.push(q.to);
    }
    if (q.cursor) {
      where.push('a.id < ?');
      params.push(Number(q.cursor) || 0);
    }
    const rows = ctx.db
      .prepare(
        `SELECT a.id, a.ts, a.actor_id, u.display_name AS actor_name, a.action, a.target_type, a.target_id, a.detail_json, a.source_ip
           FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ?`,
      )
      .all(...params, q.limit + 1) as (Omit<AuditEntryDTO, 'detail'> & { detail_json: string | null })[];
    const more = rows.length > q.limit;
    const items: AuditEntryDTO[] = rows.slice(0, q.limit).map(({ detail_json, ...r }) => ({
      ...r,
      detail: detail_json ? (JSON.parse(detail_json) as Record<string, unknown>) : null,
    }));
    return { items, next_cursor: more ? String(items[items.length - 1]!.id) : null };
  });

  app.get('/system/settings', { preHandler: g.need('MANAGE_SYSTEM') }, async () => ctx.settings());

  app.put('/system/settings', { preHandler: g.need('MANAGE_SYSTEM') }, async (req) => {
    const b = parse(settingsBody, req.body);
    if (b.timezone && !isValidTimezone(b.timezone)) {
      throw new ApiError('VALIDATION', { fields: { timezone: 'Unknown time zone. Example: Asia/Kolkata.' } });
    }
    const up = ctx.db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    ctx.db.transaction(() => {
      for (const [k, v] of Object.entries(b)) if (v !== undefined) up.run(k, String(v));
    })();
    auditReq(ctx.db, req, 'SETTINGS_CHANGED', 'settings', null, b as Record<string, unknown>);
    return ctx.settings();
  });

  app.post('/system/backup', { preHandler: g.need('MANAGE_SYSTEM') }, async (req) => {
    const r = await backupDatabase(ctx);
    auditReq(ctx.db, req, 'BACKUP_CREATED', 'system', null, { file: path.basename(r.file), bytes: r.bytes });
    return r;
  });

  app.get('/system/devices', { preHandler: g.need('MANAGE_SYSTEM') }, async (req) => {
    const rows = ctx.db
      .prepare(
        `SELECT a.id, a.user_id, u.display_name, a.device_label, a.platform, a.created_at, a.last_used_at, a.expires_at
           FROM auth_sessions a JOIN users u ON u.id = a.user_id
          WHERE a.revoked_at IS NULL AND a.expires_at > ? ORDER BY a.last_used_at DESC LIMIT 200`,
      )
      .all(new Date().toISOString()) as Record<string, string | null>[];
    const items: DeviceSessionDTO[] = rows.map((r) => ({
      id: r.id!,
      user_id: r.user_id!,
      user_name: r.display_name!,
      device_label: r.device_label ?? null,
      platform: r.platform ?? null,
      created_at: r.created_at!,
      last_used_at: r.last_used_at ?? null,
      expires_at: r.expires_at!,
      current: r.id === req.auth.sid,
    }));
    return { items, next_cursor: null };
  });
}

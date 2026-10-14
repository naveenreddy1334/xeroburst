import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import QRCode from 'qrcode';
import { API_PREFIX, ERROR_HTTP, ERROR_MESSAGE } from '@nboard/shared';
import type { ErrorCode, PublicSettings } from '@nboard/shared';
import { loadConfig } from './config.js';
import type { Config } from './config.js';
import { openDb } from './db/index.js';
import { DEFAULT_SETTINGS } from './db/seed.js';
import type { Ctx, TicketInfo } from './ctx.js';
import { ApiError } from './errors.js';
import { BoardHub } from './board/hub.js';
import { makeGuards } from './rbac/guard.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { playerRoutes } from './routes/players.js';
import { programRoutes } from './routes/programs.js';
import { gameRoutes } from './routes/games.js';
import { resultRoutes } from './routes/results.js';
import { hubRoutes } from './routes/hubs.js';
import { systemRoutes } from './routes/system.js';
import { markInterrupted, sweepStaleSessions } from './services/sessions.js';
import { lanAddresses } from './util/net.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function loadSecret(cfg: Config): string {
  if (cfg.test) return randomBytes(32).toString('base64');
  try {
    return fs.readFileSync(cfg.jwtSecretFile, 'utf8').trim();
  } catch {
    const s = randomBytes(48).toString('base64');
    fs.writeFileSync(cfg.jwtSecretFile, s, { mode: 0o600 });
    return s;
  }
}

function webRoot(): string | null {
  const candidates = [process.env.NBOARD_WEB_DIR, path.resolve(here, '../web'), path.resolve(here, '../../mobile/dist')].filter(Boolean) as string[];
  return candidates.find((d) => fs.existsSync(path.join(d, 'index.html'))) ?? null;
}

export async function buildApp(over: Partial<Config> = {}) {
  const cfg = loadConfig(over);
  const db = openDb(cfg.dbFile);
  const hub = new BoardHub({
    sim: cfg.boardSim,
    port: cfg.boardPort,
    heartbeatMs: cfg.test ? 1500 : undefined,
  });
  const tickets = new Map<string, TicketInfo>();

  const ctx: Ctx = {
    db,
    cfg,
    hub,
    tickets,
    hashN: cfg.test ? 1024 : 16384,
    settings(): PublicSettings {
      const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
      const m: Record<string, string> = { ...DEFAULT_SETTINGS };
      for (const r of rows) m[r.key] = r.value;
      return {
        org_name: m.org_name!,
        timezone: m.timezone!,
        week_start: m.week_start === 'sunday' ? 'sunday' : 'monday',
        idle_timeout_min: Number(m.idle_timeout_min) || 10,
        player_logout_after_result: m.player_logout_after_result === 'true',
      };
    },
  };

  const app = Fastify({
    logger: cfg.test ? false : { level: process.env.LOG_LEVEL ?? 'warn' },
    bodyLimit: 512 * 1024,
    trustProxy: false,
    genReqId: () => randomBytes(5).toString('hex'),
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(rateLimit, { global: !cfg.test, max: 600, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: loadSecret(cfg),
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });
  await app.register(websocket, { options: { maxPayload: 4096 } });

  // ---- Errors in the documented format (section 19.1) ---------------------------------------------------
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string; validation?: unknown }, req, reply) => {
    if (err instanceof ApiError) {
      const details = err.code === 'ACCOUNT_LOCKED' && err.details ? err.details : err.details;
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, ...(details ? { details } : {}) } });
    }
    const status = err.statusCode ?? 500;
    let code: ErrorCode = 'SERVER_ERROR';
    if (status === 429) code = 'RATE_LIMITED';
    else if (status === 413 || (status >= 400 && status < 500)) code = 'VALIDATION';
    if (code === 'SERVER_ERROR') req.log.error({ err }, 'unhandled error');
    return reply.code(ERROR_HTTP[code]).send({
      error: {
        code,
        message: code === 'VALIDATION' ? 'The request could not be read.' : ERROR_MESSAGE[code],
        ...(code === 'SERVER_ERROR' ? { details: { request_id: req.id } } : {}),
      },
    });
  });

  const guards = makeGuards(ctx);
  await app.register(
    async (api) => {
      authRoutes(api, ctx, guards);
      userRoutes(api, ctx, guards);
      playerRoutes(api, ctx, guards);
      programRoutes(api, ctx, guards);
      gameRoutes(api, ctx, guards);
      resultRoutes(api, ctx, guards);
      hubRoutes(api, ctx, guards);
      systemRoutes(api, ctx, guards);
      api.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: ERROR_MESSAGE.NOT_FOUND } }));
    },
    { prefix: API_PREFIX },
  );

  // ---- Web app and status page -------------------------------------------------------------------------------
  const web = cfg.test ? null : webRoot();
  const addresses = () => lanAddresses().map((a) => `http://${a}:${cfg.port}`);

  app.get('/status', async (_req, reply) => {
    const addr = addresses();
    const first = addr[0] ?? `http://localhost:${cfg.port}`;
    const qr = await QRCode.toString(first, { type: 'svg', margin: 1, width: 220, color: { dark: '#F4F4F6', light: '#09090B' } });
    const board = hub.status(false);
    reply.type('text/html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>XeroBurst server</title><style>
body{margin:0;background:#09090B;color:#F4F4F6;font:16px/1.5 system-ui,sans-serif;padding:24px;display:grid;place-items:center;min-height:100vh}
main{max-width:560px;width:100%}h1{font-size:28px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px}
.c{background:#121216;border:1px solid #26262E;border-radius:14px;padding:20px;margin-top:16px}
code{font:600 18px ui-monospace,monospace;color:#F2383F}small{color:#A8A8B4}ul{padding-left:18px}svg{border-radius:10px}
</style></head><body><main><h1>XeroBurst server</h1><small>v${cfg.version} · API ${API_PREFIX} · ${ctx.settings().org_name}</small>
<div class="c"><b>Open the XeroBurst app and enter one of these addresses</b><ul>${(addr.length ? addr : [first]).map((a) => `<li><code>${a}</code></li>`).join('')}</ul>
<small>The phone or tablet must be on the same Wi-Fi as this laptop. Or scan this code in the app:</small><div style="margin-top:12px">${qr}</div></div>
<div class="c"><b>Board</b><br>${board.connected ? `Connected (${board.mode}${board.firmware ? ', firmware ' + board.firmware : ''})` : 'Not connected'}${board.busy ? ' · in use' : ''}</div>
<div class="c"><small>No accounts yet? On this laptop run <code style="font-size:14px">npm run setup</code>.</small></div></main></body></html>`);
  });

  if (web) {
    await app.register(fastifyStatic, { root: web, wildcard: true, index: ['index.html'] });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith(API_PREFIX)) return reply.sendFile('index.html');
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: ERROR_MESSAGE.NOT_FOUND } });
    });
    app.log.info(`Serving the web app from ${web}`);
  } else {
    app.get('/', async (_req, reply) => reply.redirect('/status'));
  }

  // ---- Background work -------------------------------------------------------------------------------------
  hub.onLockLost = (sessionId) => markInterrupted(ctx, sessionId);
  if (!cfg.noBoard) await hub.start();
  sweepStaleSessions(ctx, 6 * 3600_000); // leftovers from before a restart
  const sweeper = setInterval(() => {
    sweepStaleSessions(ctx);
    const now = Date.now();
    for (const [k, t] of tickets) if (t.expires < now) tickets.delete(k);
  }, 60_000);
  sweeper.unref();

  app.addHook('onClose', async () => {
    clearInterval(sweeper);
    hub.stop();
    db.close();
  });

  return { app, ctx, addresses };
}

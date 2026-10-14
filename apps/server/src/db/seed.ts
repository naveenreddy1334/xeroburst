// Seeds on every start, idempotently: modules, games, role permissions, settings defaults and the
// default 4-week program. Existing rows are left alone so edits made in the app survive.

import { randomUUID } from 'node:crypto';
import { GAME_LIST, ROLES, ROLE_PERMISSIONS } from '@nboard/shared';
import type { DB } from './index.js';

export const DEFAULT_SETTINGS: Record<string, string> = {
  org_name: 'XeroBurst',
  timezone: 'Asia/Kolkata',
  week_start: 'monday',
  idle_timeout_min: '10',
  player_logout_after_result: 'false',
};

export const DEFAULT_PROGRAM_ID = 'prog_default_foundation';

export function seed(db: DB): void {
  db.transaction(() => {
    const mod = db.prepare('INSERT OR IGNORE INTO modules (key, name, enabled, sort_order) VALUES (?,?,?,?)');
    mod.run('nboard', 'Reaction Board', 1, 1);
    mod.run('nbase', 'nBase', 0, 2);
    mod.run('ncourt', 'nCourt', 0, 3);
    mod.run('npad', 'nPad', 0, 4);

    const game = db.prepare(
      'INSERT OR IGNORE INTO games (module_key, slug, name, sort_order, min_level, max_level, enabled) VALUES (?,?,?,?,?,?,1)',
    );
    GAME_LIST.forEach((g, i) => game.run('nboard', g.slug, g.name, i + 1, g.minLevel, g.maxLevel));

    // Role permissions follow the shared package exactly.
    db.prepare('DELETE FROM role_permissions').run();
    const rp = db.prepare('INSERT INTO role_permissions (role, permission) VALUES (?,?)');
    for (const role of ROLES) for (const p of ROLE_PERMISSIONS[role]) rp.run(role, p);

    const set = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)');
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) set.run(k, v);

    const exists = db.prepare('SELECT 1 FROM programs WHERE id = ?').get(DEFAULT_PROGRAM_ID);
    if (!exists) {
      db.prepare(
        'INSERT INTO programs (id, name, owner_id, is_template, retired, created_by, created_at) VALUES (?,?,NULL,1,0,NULL,?)',
      ).run(DEFAULT_PROGRAM_ID, 'Foundation (4 weeks)', new Date().toISOString());
      const stage = db.prepare('INSERT INTO program_stages (program_id, stage_no, label) VALUES (?,?,?)');
      const sg = db.prepare('INSERT INTO program_stage_games (stage_id, game_id) VALUES (?,(SELECT id FROM games WHERE slug = ?))');
      const order = ['quick', 'memory', 'hunt', 'endure'];
      // Each week adds one game (section 18.1); the stage lists every game available from then on.
      order.forEach((_, i) => {
        const id = Number(stage.run(DEFAULT_PROGRAM_ID, i + 1, `Week ${i + 1}`).lastInsertRowid);
        for (const slug of order.slice(0, i + 1)) sg.run(id, slug);
      });
    }
  })();
}

export const newId = () => randomUUID().replace(/-/g, '').slice(0, 20);

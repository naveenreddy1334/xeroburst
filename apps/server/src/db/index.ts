import Database from 'better-sqlite3';
import { MIGRATIONS, REBUILD_MIGRATIONS } from './migrations.js';
import { seed } from './seed.js';

export type DB = Database.Database;

export function openDb(file: string): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  seed(db);
  return db;
}

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > MIGRATIONS.length) {
    throw new Error(
      `This database is version ${current} but this server only knows version ${MIGRATIONS.length}. Update the server; it will not start on a newer database.`,
    );
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    const rebuild = REBUILD_MIGRATIONS.has(v + 1);
    // Foreign keys can only be switched off outside a transaction.
    if (rebuild) db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(MIGRATIONS[v]!);
        if (rebuild) {
          const bad = db.pragma('foreign_key_check') as unknown[];
          if (bad.length) throw new Error(`Migration ${v + 1} left ${bad.length} broken references; nothing was changed.`);
        }
        db.pragma(`user_version = ${v + 1}`);
      })();
    } finally {
      if (rebuild) db.pragma('foreign_keys = ON');
    }
  }
}

export function tx<T>(db: DB, fn: () => T): T {
  return db.transaction(fn)();
}
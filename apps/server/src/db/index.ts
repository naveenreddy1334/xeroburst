import Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations.js';
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
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function tx<T>(db: DB, fn: () => T): T {
  return db.transaction(fn)();
}

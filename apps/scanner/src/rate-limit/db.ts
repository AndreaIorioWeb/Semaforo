import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

/**
 * Apre il database SQLite. Contiene solo hash (mai IP o URL in chiaro).
 * Usa ":memory:" per i test.
 */
export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_visits (
      fingerprint TEXT NOT NULL,
      site_key    TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      PRIMARY KEY (fingerprint, site_key)
    );
    CREATE INDEX IF NOT EXISTS rate_visits_created ON rate_visits(created_at);

    CREATE TABLE IF NOT EXISTS rate_global (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rate_global_created ON rate_global(created_at);
  `);
}

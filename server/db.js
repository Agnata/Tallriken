import { DatabaseSync } from "node:sqlite";

// Accounts as in Vinkällaren. Each user's Tallriken data (days, weights, measures, settings …)
// is one JSON document in user_data, the same shape the artifact kept, with a version number
// for optimistic concurrency between devices.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  totp_secret    TEXT,
  totp_pending   TEXT,
  totp_enabled   INTEGER NOT NULL DEFAULT 0,
  totp_last_step INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('invite','reset')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at   TEXT,
  PRIMARY KEY (user_id, code_hash)
);

CREATE TABLE IF NOT EXISTS login_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0
);

-- Small key/value store for scheduler state.
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS user_data (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Changes to existing databases, applied in order. Index + 1 = PRAGMA user_version.
const MIGRATIONS = [
  // 1: Withings scale per user (OAuth tokens) and short-lived OAuth states
  `CREATE TABLE withings (
     user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     withings_userid TEXT NOT NULL UNIQUE,
     access_token    TEXT NOT NULL,
     refresh_token   TEXT NOT NULL,
     expires_at      INTEGER NOT NULL,
     last_update     INTEGER NOT NULL DEFAULT 0,
     synced_at       TEXT,
     last_error      TEXT,
     created_at      TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE oauth_states (
     state_hash TEXT PRIMARY KEY,
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at TEXT NOT NULL
   );`,
];

// Runs fn inside a transaction; rolls back if it throws.
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const getMeta = (db, key) => db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
export const setMeta = (db, key, value) =>
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));
export const schemaVersion = db => db.prepare("PRAGMA user_version").get().user_version;

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  for (let v = schemaVersion(db); v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}

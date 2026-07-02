import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// Local database. node:sqlite is synchronous (DatabaseSync), which keeps the
// whole repository/service layer synchronous exactly as before — the swap from
// JSON files is invisible above the repositories. It is an experimental Node
// API (emits one ExperimentalWarning on boot); no third-party dependency.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Overridable so a host with a persistent disk can point it at the mount.
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/** Where the legacy JSON stores live — used once to import existing users. */
export const DATA_DIR_PATH = DATA_DIR;

const DB_FILE = path.join(DATA_DIR, 'scores.db');

export const db = new DatabaseSync(DB_FILE);

// Dev-only schema evolution: an older `teams` table stored a `group` string and
// had no groups table. Groups are now first-class and teams reference them by
// `groupId`. If we see the old shape, drop the tournament tables so they reseed
// under the new model. USERS ARE PRESERVED (accounts live only there and are
// re-imported from users.json if empty).
const teamsInfo = db.prepare('PRAGMA table_info(teams)').all() as Array<{ name: string }>;
if (teamsInfo.length > 0 && !teamsInfo.some((c) => c.name === 'groupId')) {
  db.exec('DROP TABLE IF EXISTS bracket; DROP TABLE IF EXISTS matches; DROP TABLE IF EXISTS teams; DROP TABLE IF EXISTS groups;');
}

// `group` is a SQL keyword, hence the quoting. Pens/startsAt/groupId are nullable.
db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    shortName TEXT NOT NULL,
    groupId TEXT,
    groupAddedAt TEXT
  );
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    "group" TEXT NOT NULL,
    homeId TEXT NOT NULL,
    awayId TEXT NOT NULL,
    homeScore INTEGER NOT NULL,
    awayScore INTEGER NOT NULL,
    status TEXT NOT NULL,
    minute INTEGER NOT NULL,
    startsAt TEXT NOT NULL,
    field TEXT NOT NULL,
    rev INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    usernameLower TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    active INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bracket (
    slot TEXT PRIMARY KEY,
    homeScore INTEGER NOT NULL,
    awayScore INTEGER NOT NULL,
    homePens INTEGER,
    awayPens INTEGER,
    status TEXT NOT NULL,
    field TEXT NOT NULL,
    startsAt TEXT,
    homeOverrideId TEXT,
    awayOverrideId TEXT,
    rev INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    teamId TEXT NOT NULL,
    name TEXT NOT NULL,
    number INTEGER,
    position TEXT
  );
  -- Jersey number is unique within a team, but only when present (NULLs allowed).
  CREATE UNIQUE INDEX IF NOT EXISTS players_team_number
    ON players(teamId, number) WHERE number IS NOT NULL;
`);

// Schema evolution: bracket rows gained per-side admin override columns after
// the first production deploy. CREATE IF NOT EXISTS won't touch an existing
// table, so patch it in place (same PRAGMA-check pattern as the teams table).
const bracketInfo = db.prepare('PRAGMA table_info(bracket)').all() as Array<{ name: string }>;
if (bracketInfo.length > 0 && !bracketInfo.some((c) => c.name === 'homeOverrideId')) {
  db.exec('ALTER TABLE bracket ADD COLUMN homeOverrideId TEXT; ALTER TABLE bracket ADD COLUMN awayOverrideId TEXT;');
}

/** Run `fn` inside a transaction; rolls back on throw so a partial write never
 * lands (mirrors the atomic temp-then-rename guarantee the JSON stores had). */
export function transaction(fn: () => void): void {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

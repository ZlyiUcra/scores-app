import crypto from 'node:crypto';
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

/** The one process-wide connection; repositories share it via `transaction`. */
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
  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    startsAt TEXT,
    endsAt TEXT,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    tournamentId TEXT NOT NULL,
    name TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    tournamentId TEXT NOT NULL,
    name TEXT NOT NULL,
    shortName TEXT NOT NULL,
    groupId TEXT,
    groupAddedAt TEXT
  );
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    tournamentId TEXT NOT NULL,
    "group" TEXT NOT NULL,
    homeId TEXT NOT NULL,
    awayId TEXT NOT NULL,
    homeScore INTEGER NOT NULL,
    awayScore INTEGER NOT NULL,
    status TEXT NOT NULL,
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
    tournamentId TEXT NOT NULL,
    slot TEXT NOT NULL,
    homeScore INTEGER NOT NULL,
    awayScore INTEGER NOT NULL,
    homePens INTEGER,
    awayPens INTEGER,
    status TEXT NOT NULL,
    field TEXT NOT NULL,
    startsAt TEXT,
    homeOverrideId TEXT,
    awayOverrideId TEXT,
    rev INTEGER NOT NULL,
    PRIMARY KEY (tournamentId, slot)
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

// Schema evolution: the dead `minute` column (a live-clock idea that never got
// UI) was dropped from the model. An existing table still has it as NOT NULL,
// which would reject the column-less inserts — drop it in place.
const matchesInfo = db.prepare('PRAGMA table_info(matches)').all() as Array<{ name: string }>;
if (matchesInfo.some((c) => c.name === 'minute')) {
  db.exec('ALTER TABLE matches DROP COLUMN minute;');
}

// Schema evolution: tournaments became first-class, so groups/teams/matches
// gained a tournamentId. ALTER can only add a NULLABLE column to an existing
// table; the backfill below fills it, and every insert supplies it — so the
// nullable/NOT NULL divergence between evolved and fresh tables never shows.
for (const table of ['groups', 'teams', 'matches']) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (info.length > 0 && !info.some((c) => c.name === 'tournamentId')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN tournamentId TEXT;`);
  }
}

// The bracket's key grew from `slot` to (tournamentId, slot). SQLite cannot
// alter a primary key in place, so rebuild the table around the existing rows
// (copy, drop, rename — nothing is lost).
const bracketCols = db.prepare('PRAGMA table_info(bracket)').all() as Array<{ name: string }>;
if (bracketCols.length > 0 && !bracketCols.some((c) => c.name === 'tournamentId')) {
  db.exec(`
    CREATE TABLE bracket_next (
      tournamentId TEXT NOT NULL,
      slot TEXT NOT NULL,
      homeScore INTEGER NOT NULL,
      awayScore INTEGER NOT NULL,
      homePens INTEGER,
      awayPens INTEGER,
      status TEXT NOT NULL,
      field TEXT NOT NULL,
      startsAt TEXT,
      homeOverrideId TEXT,
      awayOverrideId TEXT,
      rev INTEGER NOT NULL,
      PRIMARY KEY (tournamentId, slot)
    );
    INSERT INTO bracket_next (tournamentId, slot, homeScore, awayScore, homePens, awayPens, status, field, startsAt, homeOverrideId, awayOverrideId, rev)
      SELECT '', slot, homeScore, awayScore, homePens, awayPens, status, field, startsAt, homeOverrideId, awayOverrideId, rev FROM bracket;
    DROP TABLE bracket;
    ALTER TABLE bracket_next RENAME TO bracket;
  `);
}

// Every row belongs to a tournament. A database from before tournaments (or a
// fresh one) has none — create the default and adopt all orphaned rows into
// it. Repositories can rely on at least one tournament existing at boot.
const tournamentCount = (db.prepare('SELECT COUNT(*) AS n FROM tournaments').get() as { n: number }).n;
if (tournamentCount === 0) {
  db.prepare('INSERT INTO tournaments (id, name, startsAt, endsAt, status, createdAt) VALUES (?, ?, NULL, NULL, ?, ?)').run(
    crypto.randomUUID(),
    'Tournament 1',
    'active',
    new Date().toISOString(),
  );
}
{
  const adoptId = (db.prepare('SELECT id FROM tournaments ORDER BY createdAt, id').get() as { id: string }).id;
  db.prepare("UPDATE groups SET tournamentId = ? WHERE tournamentId IS NULL OR tournamentId = ''").run(adoptId);
  db.prepare("UPDATE teams SET tournamentId = ? WHERE tournamentId IS NULL OR tournamentId = ''").run(adoptId);
  db.prepare("UPDATE matches SET tournamentId = ? WHERE tournamentId IS NULL OR tournamentId = ''").run(adoptId);
  db.prepare("UPDATE bracket SET tournamentId = ? WHERE tournamentId IS NULL OR tournamentId = ''").run(adoptId);
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

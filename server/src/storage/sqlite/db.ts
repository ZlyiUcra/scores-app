import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// SQLite driver internals. node:sqlite is synchronous (DatabaseSync), so the
// repositories in this directory fulfill the async storage contracts with
// plain sync bodies - no interleaving can happen inside a single call. It is
// an experimental Node API (emits one ExperimentalWarning on boot); no
// third-party dependency.

/** Everything the sqlite repositories share: the one process-wide connection,
 * the data directory (legacy users.json import) and the transaction helper. */
export interface SqliteContext {
  db: DatabaseSync;
  dataDir: string;
  /** Run `fn` inside a transaction; rolls back on throw so a partial write
   * never lands. NOT nestable - each repository persist() owns its own. */
  transaction(fn: () => void): void;
}

/** Open (or create) the database file, apply schema + in-place migrations and
 * adopt pre-tournament legacy rows. Pure driver concern - nothing above the
 * storage layer knows any of this exists. */
export function openDatabase(dataDir: string): SqliteContext {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'scores.db'));

  // WAL + NORMAL: the persist() pattern rewrites whole tables per mutation,
  // so journal mode dominates per-click write latency.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');

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
    -- Append-only audit trail (admin actions). Parameterized inserts keep it
    -- injection-proof by construction; AUTOINCREMENT id = stable insertion order.
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      actorId TEXT NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL
    );
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
  // which would reject the column-less inserts - drop it in place.
  const matchesInfo = db.prepare('PRAGMA table_info(matches)').all() as Array<{ name: string }>;
  if (matchesInfo.some((c) => c.name === 'minute')) {
    db.exec('ALTER TABLE matches DROP COLUMN minute;');
  }

  // Schema evolution: tournaments became first-class, so groups/teams/matches
  // gained a tournamentId. ALTER can only add a NULLABLE column to an existing
  // table; the backfill below fills it, and every insert supplies it - so the
  // nullable/NOT NULL divergence between evolved and fresh tables never shows.
  for (const table of ['groups', 'teams', 'matches']) {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (info.length > 0 && !info.some((c) => c.name === 'tournamentId')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN tournamentId TEXT;`);
    }
  }

  // The bracket's key grew from `slot` to (tournamentId, slot). SQLite cannot
  // alter a primary key in place, so rebuild the table around the existing rows
  // (copy, drop, rename - nothing is lost).
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

  // Legacy adoption: rows from before tournaments existed carry no
  // tournamentId. If any are present, make sure there is a tournament to adopt
  // them into and backfill. A FRESH database has no orphans and skips this -
  // its first tournament is created by the driver-neutral bootstrap instead.
  const orphanCount = (['groups', 'teams', 'matches', 'bracket'] as const).reduce((sum, table) => {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE tournamentId IS NULL OR tournamentId = ''`)
      .get() as { n: number };
    return sum + row.n;
  }, 0);
  if (orphanCount > 0) {
    const existing = db.prepare('SELECT id FROM tournaments ORDER BY createdAt, id').get() as
      | { id: string }
      | undefined;
    let adoptId = existing?.id;
    if (!adoptId) {
      adoptId = crypto.randomUUID();
      db.prepare('INSERT INTO tournaments (id, name, startsAt, endsAt, status, createdAt) VALUES (?, ?, NULL, NULL, ?, ?)').run(
        adoptId,
        'Tournament 1',
        'active',
        new Date().toISOString(),
      );
    }
    for (const table of ['groups', 'teams', 'matches', 'bracket'] as const) {
      db.prepare(`UPDATE ${table} SET tournamentId = ? WHERE tournamentId IS NULL OR tournamentId = ''`).run(adoptId);
    }
  }

  return {
    db,
    dataDir,
    transaction(fn: () => void): void {
      db.exec('BEGIN');
      try {
        fn();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

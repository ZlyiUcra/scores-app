import type { Storage } from "../contracts.js";
import { openDatabase } from "./db.js";
import { SqliteTournamentRepository } from "./tournaments.js";
import { SqliteGroupRepository } from "./groups.js";
import { SqliteTeamRepository } from "./teams.js";
import { SqlitePlayerRepository } from "./players.js";
import { SqliteMatchRepository } from "./matches.js";
import { SqliteUserRepository } from "./users.js";
import { SqliteBracketRepository } from "./bracket.js";

/**
 * Build the SQLite storage: open/migrate the database, then construct the
 * repositories in one explicit place (matches needs teams for DTO embedding -
 * no import-order accidents). Async so a future driver with an async connect
 * fits the same seam.
 */
export async function createSqliteStorage(options: {
  dataDir: string;
}): Promise<Storage> {
  const ctx = openDatabase(options.dataDir);
  const teams = new SqliteTeamRepository(ctx);
  return {
    tournaments: new SqliteTournamentRepository(ctx),
    groups: new SqliteGroupRepository(ctx),
    teams,
    players: new SqlitePlayerRepository(ctx),
    matches: new SqliteMatchRepository(ctx, teams),
    users: new SqliteUserRepository(ctx),
    bracket: new SqliteBracketRepository(ctx),
  };
}

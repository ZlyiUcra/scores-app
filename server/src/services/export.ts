import type { BracketSlotId, Group, Player, Tournament } from '../../../shared/types.js';
import type { BracketResult, SeedTeam } from '../../../shared/tournament.js';
import type { StoredMatch } from '../storage/contracts.js';
import {
  bracketRepository,
  groupRepository,
  matchRepository,
  playerRepository,
  teamRepository,
  tournamentRepository,
} from '../storage/index.js';
import { requireFound } from '../errors.js';

/** Current export wire-format version. Bump on ANY change to TournamentExport;
 * a future import validates it and refuses unknown versions. This is an
 * independent axis - NOT the DB migration state in storage/sqlite/db.ts. */
export const exportSchemaVersion = 1;

/**
 * One tournament's full data as a portable, round-trippable snapshot (manual
 * backup). RAW stored shapes on purpose - StoredMatch (team ids, not embedded
 * teams), SeedTeam (carries the server-only seeding key so a future import can
 * reproduce the bracket), raw bracket results (not the derived BracketView) -
 * so it is a faithful backup, not a display projection. Carries NO accounts,
 * passwordHash or audit trail: a tournament snapshot, not a system dump.
 */
export type TournamentExport = {
  schemaVersion: typeof exportSchemaVersion;
  exportedAt: string;
  tournament: Tournament;
  groups: Group[];
  teams: SeedTeam[];
  players: Player[];
  matches: StoredMatch[];
  bracket: Partial<Record<BracketSlotId, BracketResult>>;
};

/**
 * Assemble a tournament export by reading THROUGH the storage contracts only
 * (one pass per collection, no SQL - a future driver gets export for free).
 * Throws NOT_FOUND (404) for an unknown tournament before assembling anything.
 * A pure read: no writes, no audit - so the GET route stays side-effect-free.
 */
export async function buildTournamentExport(tournamentId: string): Promise<TournamentExport> {
  const tournament = requireFound(
    await tournamentRepository.get(tournamentId),
    `Tournament ${tournamentId} not found.`,
  );
  // teams first: the players read is scoped by their team ids.
  const teams = await teamRepository.listSeed(tournamentId);
  const teamIds = new Set(teams.map((tm) => tm.id));
  const [groups, players, matches, bracket] = await Promise.all([
    groupRepository.list(tournamentId),
    playerRepository.listByTeams(teamIds),
    matchRepository.listStored(tournamentId),
    bracketRepository.results(tournamentId),
  ]);
  return {
    schemaVersion: exportSchemaVersion,
    exportedAt: new Date().toISOString(),
    tournament,
    groups,
    teams,
    players,
    matches,
    bracket,
  };
}

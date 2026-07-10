import crypto from 'node:crypto';
import type { Tournament } from '../../../shared/types.js';
import { bracketSlotIds, computeSize, TOURNAMENT_FORMAT, type BracketResult } from '../../../shared/tournament.js';
import type { StoredMatch } from '../storage/contracts.js';
import {
  bracketRepository,
  groupRepository,
  matchRepository,
  playerRepository,
  teamRepository,
  tournamentRepository,
} from '../storage/index.js';
import type { TournamentExportInput } from '../validation.js';
import { AppError, AppErrorCode } from '../errors.js';
import { withMutationLock } from './mutationLock.js';

export type ImportCounts = {
  groups: number;
  teams: number;
  players: number;
  matches: number;
  bracket: number;
};

export type ImportResult = { tournament: Tournament; counts: ImportCounts };

/**
 * Pre-write validation over an already schema-valid file: every in-file id is
 * unique per collection, every reference resolves to an id declared in the
 * SAME file, and the invariants that need sibling context (not expressible in
 * the zod shape alone - jersey uniqueness, group size, bracket slot validity
 * for the file's OWN group/team setup via the shared resolver, never a second
 * enumerator). Throws on the first violation found; pure, no repository reads
 * or writes.
 */
function validateGraph(file: TournamentExportInput): void {
  const groupIds = new Set<string>();
  for (const g of file.groups) {
    if (groupIds.has(g.id)) throw new AppError(AppErrorCode.Invalid, `Duplicate group id ${g.id} in file.`, 400);
    groupIds.add(g.id);
  }

  const teamIds = new Set<string>();
  const teamsPerGroup = new Map<string, number>();
  for (const t of file.teams) {
    if (teamIds.has(t.id)) throw new AppError(AppErrorCode.Invalid, `Duplicate team id ${t.id} in file.`, 400);
    teamIds.add(t.id);
    if (t.groupId !== null) {
      if (!groupIds.has(t.groupId)) {
        throw new AppError(AppErrorCode.Invalid, `Team ${t.id} references unknown group ${t.groupId}.`, 400);
      }
      teamsPerGroup.set(t.groupId, (teamsPerGroup.get(t.groupId) ?? 0) + 1);
    }
  }
  for (const [groupId, count] of teamsPerGroup) {
    if (count > TOURNAMENT_FORMAT.maxPerGroup) {
      throw new AppError(
        AppErrorCode.Invalid,
        `Group ${groupId} has ${count} teams; at most ${TOURNAMENT_FORMAT.maxPerGroup} are allowed.`,
        400,
      );
    }
  }

  const playerIds = new Set<string>();
  const numbersByTeam = new Map<string, Set<number>>();
  for (const p of file.players) {
    if (playerIds.has(p.id)) throw new AppError(AppErrorCode.Invalid, `Duplicate player id ${p.id} in file.`, 400);
    playerIds.add(p.id);
    if (!teamIds.has(p.teamId)) {
      throw new AppError(AppErrorCode.Invalid, `Player ${p.id} references unknown team ${p.teamId}.`, 400);
    }
    if (p.number !== null) {
      const taken = numbersByTeam.get(p.teamId) ?? new Set<number>();
      if (taken.has(p.number)) {
        throw new AppError(AppErrorCode.Invalid, `Team ${p.teamId} has two players with number ${p.number}.`, 400);
      }
      taken.add(p.number);
      numbersByTeam.set(p.teamId, taken);
    }
  }

  const matchIds = new Set<string>();
  for (const m of file.matches) {
    if (matchIds.has(m.id)) throw new AppError(AppErrorCode.Invalid, `Duplicate match id ${m.id} in file.`, 400);
    matchIds.add(m.id);
    if (!groupIds.has(m.group)) {
      throw new AppError(AppErrorCode.Invalid, `Match ${m.id} references unknown group ${m.group}.`, 400);
    }
    if (!teamIds.has(m.homeId)) {
      throw new AppError(AppErrorCode.Invalid, `Match ${m.id} references unknown home team ${m.homeId}.`, 400);
    }
    if (!teamIds.has(m.awayId)) {
      throw new AppError(AppErrorCode.Invalid, `Match ${m.id} references unknown away team ${m.awayId}.`, 400);
    }
    if (m.homeId === m.awayId) {
      throw new AppError(AppErrorCode.Invalid, `Match ${m.id} has the same team on both sides.`, 400);
    }
  }

  // The bracket size is derived from the file's OWN group/team setup via the
  // SAME resolver the live bracket uses (also enforces the maxBracketSize=32
  // cap through its 'tooManyGroups' reason) - never a second slot enumerator.
  const sizeInfo = computeSize(file.groups, file.teams);
  const validSlots = sizeInfo.formable ? new Set(bracketSlotIds(sizeInfo.size)) : new Set<string>();
  for (const [slot, result] of Object.entries(file.bracket)) {
    if (!result) continue;
    if (!validSlots.has(slot)) {
      throw new AppError(AppErrorCode.Invalid, `Bracket slot ${slot} is not valid for this file's group setup.`, 400);
    }
    if (result.homeOverrideId != null && !teamIds.has(result.homeOverrideId)) {
      throw new AppError(
        AppErrorCode.Invalid,
        `Bracket slot ${slot} references unknown home override ${result.homeOverrideId}.`,
        400,
      );
    }
    if (result.awayOverrideId != null && !teamIds.has(result.awayOverrideId)) {
      throw new AppError(
        AppErrorCode.Invalid,
        `Bracket slot ${slot} references unknown away override ${result.awayOverrideId}.`,
        400,
      );
    }
  }
}

/** If the file's tournament name collides with one already in this database,
 * append " (2)", " (3)", etc. (the lowest free number) so the two are
 * distinguishable in the list - names are not otherwise unique, this is only
 * to keep an imported copy from looking identical to what already exists. */
async function uniqueTournamentName(name: string): Promise<string> {
  const existing = new Set((await tournamentRepository.list()).map((t) => t.name));
  if (!existing.has(name)) return name;
  let n = 2;
  while (existing.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

/**
 * Restore a tournament from an export file: unconditional remint (every
 * entity gets a fresh server-minted id via the repositories' own create
 * methods, remapped through one old-id -> new-id table per collection), so
 * importing the same file twice - or a file whose ids collide with another
 * tournament already in this database - always yields a brand new, isolated
 * tournament. All validation (the caller's zod parse, then `validateGraph`
 * above) completes before this function is even called; everything from here
 * on is a single locked write section. On a write failure the partially
 * created tournament is left in place (constitution: no destructive
 * compensating cleanup) and the error names its id.
 */
export function importTournament(file: TournamentExportInput): Promise<ImportResult> {
  validateGraph(file);
  return withMutationLock(async () => {
    const tournament = await tournamentRepository.create({
      name: await uniqueTournamentName(file.tournament.name),
      startsAt: file.tournament.startsAt,
      endsAt: file.tournament.endsAt,
      status: file.tournament.status,
    });
    try {
      const groupIdMap = new Map<string, string>();
      const createdGroups = await groupRepository.createMany(
        tournament.id,
        file.groups.map((g) => g.name),
      );
      for (let i = 0; i < file.groups.length; i++) groupIdMap.set(file.groups[i].id, createdGroups[i].id);

      const teamIdMap = new Map<string, string>();
      const createdTeams = await teamRepository.createMany(
        tournament.id,
        file.teams.map((t) => ({
          name: t.name,
          shortName: t.shortName,
          groupId: t.groupId != null ? groupIdMap.get(t.groupId)! : null,
          groupAddedAt: t.groupAddedAt,
        })),
      );
      for (let i = 0; i < file.teams.length; i++) teamIdMap.set(file.teams[i].id, createdTeams[i].id);

      const createdPlayers = await playerRepository.createMany(
        file.players.map((p) => ({
          teamId: teamIdMap.get(p.teamId)!,
          name: p.name,
          number: p.number,
          position: p.position,
        })),
      );

      const matchesToSave: StoredMatch[] = file.matches.map((m) => ({
        id: crypto.randomUUID(),
        tournamentId: tournament.id,
        group: groupIdMap.get(m.group)!,
        homeId: teamIdMap.get(m.homeId)!,
        awayId: teamIdMap.get(m.awayId)!,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        status: m.status,
        startsAt: m.startsAt,
        field: m.field,
        rev: m.rev,
      }));
      const createdMatches = await matchRepository.saveMany(matchesToSave);

      // Not batched (per-slot bracketRepository.save, the shipped write path) -
      // the knockout is at most 31 slots, rare/admin-only, and a driver-level
      // batch method would be new surface for a write this small.
      const bracketEntries = Object.entries(file.bracket).filter(
        (entry): entry is [string, BracketResult] => entry[1] !== undefined,
      );
      for (const [slot, result] of bracketEntries) {
        await bracketRepository.save(tournament.id, slot, {
          ...result,
          homeOverrideId: result.homeOverrideId != null ? teamIdMap.get(result.homeOverrideId)! : null,
          awayOverrideId: result.awayOverrideId != null ? teamIdMap.get(result.awayOverrideId)! : null,
        });
      }

      return {
        tournament,
        counts: {
          groups: createdGroups.length,
          teams: createdTeams.length,
          players: createdPlayers.length,
          matches: createdMatches.length,
          bracket: bracketEntries.length,
        },
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new AppError(
        AppErrorCode.StoreWriteFailed,
        `Import failed partway through; tournament ${tournament.id} was created but is incomplete: ${detail}`,
        500,
      );
    }
  });
}

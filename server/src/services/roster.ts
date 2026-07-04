import type { Group, Roster, Team } from '../../../shared/types.js';
import { TOURNAMENT_FORMAT } from '../../../shared/tournament.js';
import { groupRepository, matchRepository, playerRepository, teamRepository } from '../storage/index.js';
import type { AssignTeamInput } from '../validation.js';
import { AppError } from '../errors.js';
import { assertBracketNotStarted } from './bracketLock.js';
import { assertTournamentEditable } from './tournamentLock.js';
import { withMutationLock } from './mutationLock.js';

// Groups and teams are mutually entangled (assignment checks the group,
// group removal checks its teams), with Team as the hub that also reaches
// into players (cascade) and matches (integrity check) — via storage only.
// Everything is tournament-scoped; id-addressed mutations derive the
// tournament from the entity and RETURN it so routes can scope broadcasts.

/** A tournament's teams as public DTOs (no seeding key). */
export function listTeams(tournamentId: string): Promise<Team[]> {
  return teamRepository.list(tournamentId);
}

/** A tournament's groups in stable creation order. */
export function listGroups(tournamentId: string): Promise<Group[]> {
  return groupRepository.list(tournamentId);
}

/** Public roster: groups + teams (with membership) + players, all of one
 * tournament. Drives client standings and the squads view. */
export async function getRoster(tournamentId: string): Promise<Roster> {
  const teams = await teamRepository.list(tournamentId);
  const teamIds = new Set(teams.map((t) => t.id));
  const players = (await playerRepository.list()).filter((p) => teamIds.has(p.teamId));
  return { groups: await groupRepository.list(tournamentId), teams, players };
}

/** Admin: create a team in a tournament (no group — assigned separately). */
export function createTeam(tournamentId: string, input: { name: string; shortName: string }): Promise<Team> {
  return withMutationLock(async () => {
    await assertTournamentEditable(tournamentId);
    return teamRepository.create(tournamentId, input);
  });
}

/** Admin: rename a team. Cosmetic (id-based references stay valid), so allowed
 * even while the knockout is in progress. */
export function updateTeam(
  id: string,
  patch: { name?: string; shortName?: string },
): Promise<{ team: Team; tournamentId: string }> {
  return withMutationLock(async () => {
    const stored = await teamRepository.getStored(id);
    if (!stored) throw new AppError('NOT_FOUND', `Team ${id} not found.`, 404);
    await assertTournamentEditable(stored.tournamentId);
    return { team: await teamRepository.update(id, patch), tournamentId: stored.tournamentId };
  });
}

/** Admin: create a group in a tournament. */
export function createGroup(tournamentId: string, name: string): Promise<Group> {
  return withMutationLock(async () => {
    await assertTournamentEditable(tournamentId);
    await assertBracketNotStarted(tournamentId);
    return groupRepository.create(tournamentId, name);
  });
}

/** Admin: rename a group. Cosmetic (id-based), so allowed even mid-knockout. */
export function updateGroup(id: string, name: string): Promise<{ group: Group; tournamentId: string }> {
  return withMutationLock(async () => {
    const stored = await groupRepository.getStored(id);
    if (!stored) throw new AppError('NOT_FOUND', `Group ${id} not found.`, 404);
    await assertTournamentEditable(stored.tournamentId);
    return { group: await groupRepository.update(id, name), tournamentId: stored.tournamentId };
  });
}

/** Admin: remove an empty group. Returns the owning tournament. */
export function removeGroup(id: string): Promise<string> {
  return withMutationLock(async () => {
    const stored = await groupRepository.getStored(id);
    if (!stored) throw new AppError('NOT_FOUND', `Group ${id} not found.`, 404);
    await assertTournamentEditable(stored.tournamentId);
    await assertBracketNotStarted(stored.tournamentId);
    if ((await teamRepository.countInGroup(id)) > 0) {
      throw new AppError('GROUP_IN_USE', 'Remove the group\'s teams before deleting it.', 409);
    }
    await groupRepository.remove(id);
    return stored.tournamentId;
  });
}

/**
 * Admin: add/move a team to a group, or remove it (groupId: null). Enforces
 * max-per-group, same-tournament membership and stamps the seeding key
 * server-side. The mutation lock serializes the whole check-and-write, so
 * the count guard can't race.
 */
export function assignTeam(teamId: string, input: AssignTeamInput): Promise<{ team: Team; tournamentId: string }> {
  return withMutationLock(async () => {
    const team = await teamRepository.getStored(teamId);
    if (!team) throw new AppError('NOT_FOUND', `Team ${teamId} not found.`, 404);
    await assertTournamentEditable(team.tournamentId);
    await assertBracketNotStarted(team.tournamentId);

    if (input.groupId === null) {
      return { team: await teamRepository.assign(teamId, null, null), tournamentId: team.tournamentId };
    }
    const group = await groupRepository.getStored(input.groupId);
    if (!group || group.tournamentId !== team.tournamentId) {
      // A group of ANOTHER tournament is as nonexistent as an unknown id —
      // teams never cross tournaments.
      throw new AppError('INVALID', 'Group does not exist.', 400);
    }
    const alreadyInTarget = team.groupId === input.groupId;
    if (!alreadyInTarget && (await teamRepository.countInGroup(input.groupId)) >= TOURNAMENT_FORMAT.maxPerGroup) {
      throw new AppError('GROUP_FULL', `A group can have at most ${TOURNAMENT_FORMAT.maxPerGroup} teams.`, 409);
    }
    // Re-added/moved teams get a fresh seeding key (only reachable while the
    // bracket has NOT started, per the guard above).
    return {
      team: await teamRepository.assign(teamId, input.groupId, new Date().toISOString()),
      tournamentId: team.tournamentId,
    };
  });
}

/** Admin: remove a team, only if no match references it. NOTE: the countByTeam
 * check below is an INDEPENDENT integrity guard (match history must not point
 * at a deleted team) — it is NOT redundant with assertBracketNotStarted.
 * The team's players are removed with it. Returns the owning tournament. */
export function removeTeam(id: string): Promise<string> {
  return withMutationLock(async () => {
    const stored = await teamRepository.getStored(id);
    if (!stored) throw new AppError('NOT_FOUND', `Team ${id} not found.`, 404);
    await assertTournamentEditable(stored.tournamentId);
    await assertBracketNotStarted(stored.tournamentId);
    const used = await matchRepository.countByTeam(id);
    if (used > 0) {
      throw new AppError('TEAM_IN_USE', `Team is referenced by ${used} match(es) and cannot be removed.`, 409);
    }
    await teamRepository.remove(id);
    await playerRepository.removeByTeam(id); // cascade the squad
    return stored.tournamentId;
  });
}

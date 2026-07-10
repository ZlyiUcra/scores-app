import type { Group, Roster, Team } from '../../../shared/types.js';
import { TOURNAMENT_FORMAT } from '../../../shared/tournament.js';
import { bracketRepository, groupRepository, matchRepository, playerRepository, teamRepository } from '../storage/index.js';
import type { AssignTeamInput } from '../validation.js';
import { AppError, AppErrorCode, requireFound } from '../errors.js';
import { assertBracketNotStarted } from './bracketGuard.js';
import { assertTournamentEditable } from './tournamentGuard.js';
import { withMutationLock } from './mutationLock.js';

// Groups and teams are mutually entangled (assignment checks the group,
// group removal checks its teams), with Team as the hub that also reaches
// into players (cascade) and matches (integrity check) - via storage only.
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
  const players = await playerRepository.listByTeams(teamIds);
  return { groups: await groupRepository.list(tournamentId), teams, players };
}

/** Admin: create a team in a tournament (no group - assigned separately). */
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
    const stored = requireFound(await teamRepository.getStored(id), `Team ${id} not found.`);
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
    const stored = requireFound(await groupRepository.getStored(id), `Group ${id} not found.`);
    await assertTournamentEditable(stored.tournamentId);
    return { group: await groupRepository.update(id, name), tournamentId: stored.tournamentId };
  });
}

/** Admin: remove an empty group. Returns the owning tournament. Like
 * `removeTeam`/`removeMatch`, this does NOT block on a started knockout - it
 * clears the whole bracket first (same as "Reset knockout") and proceeds, so
 * the delete-everything path never needs a manual reset in between. */
export function removeGroup(id: string): Promise<string> {
  return withMutationLock(async () => {
    const stored = requireFound(await groupRepository.getStored(id), `Group ${id} not found.`);
    await assertTournamentEditable(stored.tournamentId);
    if ((await teamRepository.countInGroup(id)) > 0) {
      throw new AppError(AppErrorCode.GroupInUse, 'Remove the group\'s teams before deleting it.', 409);
    }
    if (await bracketRepository.hasStarted(stored.tournamentId)) {
      await bracketRepository.reset(stored.tournamentId);
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
    const team = requireFound(await teamRepository.getStored(teamId), `Team ${teamId} not found.`);
    await assertTournamentEditable(team.tournamentId);
    await assertBracketNotStarted(team.tournamentId);

    // Matches derive their group from the two teams sharing one - regrouping
    // a team that already has fixtures would silently orphan those matches
    // from the standings. The admin UI hides the control; this enforces it.
    if (input.groupId !== team.groupId && (await matchRepository.countByTeam(teamId)) > 0) {
      throw new AppError(AppErrorCode.TeamHasFixtures, 'A team with fixtures cannot change its group.', 409);
    }

    if (input.groupId === null) {
      return { team: await teamRepository.assign(teamId, null, null), tournamentId: team.tournamentId };
    }
    const group = await groupRepository.getStored(input.groupId);
    if (!group || group.tournamentId !== team.tournamentId) {
      // A group of ANOTHER tournament is as nonexistent as an unknown id -
      // teams never cross tournaments.
      throw new AppError(AppErrorCode.Invalid, 'Group does not exist.', 400);
    }
    const alreadyInTarget = team.groupId === input.groupId;
    if (!alreadyInTarget && (await teamRepository.countInGroup(input.groupId)) >= TOURNAMENT_FORMAT.maxPerGroup) {
      throw new AppError(AppErrorCode.GroupFull, `A group can have at most ${TOURNAMENT_FORMAT.maxPerGroup} teams.`, 409);
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
 * at a deleted team) - it does not depend on bracket state.
 * Unlike every other bracket-adjacent mutation, this one does NOT block on a
 * started knockout - it clears the WHOLE bracket instead (same as "Reset
 * knockout") and proceeds. A team about to disappear can be pinned by an
 * override or resolved into a played slot; there is no safe, narrower
 * "remove just this team's trace" operation (winners/qualifiers recompute
 * from whichever teams remain), so the only consistent option is a full
 * reset - by the time every team is gone, the bracket is already clean and
 * the tournament is ready to delete.
 * The team's players are removed with it. Returns the owning tournament. */
export function removeTeam(id: string): Promise<string> {
  return withMutationLock(async () => {
    const stored = requireFound(await teamRepository.getStored(id), `Team ${id} not found.`);
    await assertTournamentEditable(stored.tournamentId);
    const used = await matchRepository.countByTeam(id);
    if (used > 0) {
      throw new AppError(AppErrorCode.TeamInUse, `Team is referenced by ${used} match(es) and cannot be removed.`, 409);
    }
    if (await bracketRepository.hasStarted(stored.tournamentId)) {
      await bracketRepository.reset(stored.tournamentId);
    }
    await teamRepository.remove(id);
    await playerRepository.removeByTeam(id); // cascade the squad
    return stored.tournamentId;
  });
}

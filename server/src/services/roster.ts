import type { Group, Roster, Team } from '../../../shared/types.js';
import { TOURNAMENT_FORMAT } from '../../../shared/tournament.js';
import { groupRepository } from '../repos/groups.js';
import { teamRepository } from '../repos/teams.js';
import { playerRepository } from '../repos/players.js';
import { matchRepository } from '../repos/matches.js';
import type { AssignTeamInput } from '../validation.js';
import { AppError } from '../errors.js';
import { assertBracketNotStarted } from './bracketLock.js';

// Groups and teams are mutually entangled (assignment checks the group,
// group removal checks its teams), with Team as the hub that also reaches
// into players (cascade) and matches (integrity check) — via repos only.

export function listTeams(): Team[] {
  return teamRepository.list();
}

export function listGroups(): Group[] {
  return groupRepository.list();
}

/** Public roster: groups + teams (with membership) + players. Drives client
 * standings and the squads view. */
export function getRoster(): Roster {
  return { groups: groupRepository.list(), teams: teamRepository.list(), players: playerRepository.list() };
}

/** Admin: create a team (no group — assigned separately). */
export function createTeam(input: { name: string; shortName: string }): Team {
  return teamRepository.create(input);
}

/** Admin: rename a team. Cosmetic (id-based references stay valid), so allowed
 * even while the knockout is in progress. */
export function updateTeam(id: string, patch: { name?: string; shortName?: string }): Team {
  return teamRepository.update(id, patch);
}

/** Admin: create a group. */
export function createGroup(name: string): Group {
  assertBracketNotStarted();
  return groupRepository.create(name);
}

/** Admin: rename a group. Cosmetic (id-based), so allowed even mid-knockout. */
export function updateGroup(id: string, name: string): Group {
  return groupRepository.update(id, name);
}

/** Admin: remove an empty group. */
export function removeGroup(id: string): void {
  assertBracketNotStarted();
  if (!groupRepository.get(id)) throw new AppError('NOT_FOUND', `Group ${id} not found.`, 404);
  if (teamRepository.countInGroup(id) > 0) {
    throw new AppError('GROUP_IN_USE', 'Remove the group\'s teams before deleting it.', 409);
  }
  groupRepository.remove(id);
}

/**
 * Admin: add/move a team to a group, or remove it (groupId: null). Enforces
 * max-per-group and stamps the seeding key server-side. The whole check-and-write
 * is synchronous (no await), so the count guard can't race.
 */
export function assignTeam(teamId: string, input: AssignTeamInput): Team {
  assertBracketNotStarted();
  const team = teamRepository.getStored(teamId);
  if (!team) throw new AppError('NOT_FOUND', `Team ${teamId} not found.`, 404);

  if (input.groupId === null) {
    return teamRepository.assign(teamId, null, null);
  }
  if (!groupRepository.get(input.groupId)) {
    throw new AppError('INVALID', 'Group does not exist.', 400);
  }
  const alreadyInTarget = team.groupId === input.groupId;
  if (!alreadyInTarget && teamRepository.countInGroup(input.groupId) >= TOURNAMENT_FORMAT.maxPerGroup) {
    throw new AppError('GROUP_FULL', `A group can have at most ${TOURNAMENT_FORMAT.maxPerGroup} teams.`, 409);
  }
  // Re-added/moved teams get a fresh seeding key (only reachable while the
  // bracket has NOT started, per the guard above).
  return teamRepository.assign(teamId, input.groupId, new Date().toISOString());
}

/** Admin: remove a team, only if no match references it. NOTE: the countByTeam
 * check below is an INDEPENDENT integrity guard (match history must not point
 * at a deleted team) — it is NOT redundant with assertBracketNotStarted.
 * The team's players are removed with it. */
export function removeTeam(id: string): void {
  assertBracketNotStarted();
  if (!teamRepository.get(id)) {
    throw new AppError('NOT_FOUND', `Team ${id} not found.`, 404);
  }
  const used = matchRepository.countByTeam(id);
  if (used > 0) {
    throw new AppError('TEAM_IN_USE', `Team is referenced by ${used} match(es) and cannot be removed.`, 409);
  }
  teamRepository.remove(id);
  playerRepository.removeByTeam(id); // cascade the squad
}

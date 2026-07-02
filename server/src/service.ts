import crypto from 'node:crypto';
import type { BracketSlotId, BracketView, Group, Match, MatchUpdate, Roster, Team } from '../../shared/types.js';
import {
  computeSize,
  generateBracket,
  resolveBracket,
  TOURNAMENT_FORMAT,
  type BracketResult,
} from '../../shared/tournament.js';
import type { Player } from '../../shared/types.js';
import { matchRepository, resolveMatch, type StoredMatch } from './store.js';
import { teamRepository } from './teams.js';
import { groupRepository } from './groups.js';
import { playerRepository } from './players.js';
import { bracketRepository } from './bracket.js';
import type {
  AssignTeamInput,
  CreateMatchInput,
  CreatePlayerInput,
  GoalInput,
  UpdateBracketInput,
  UpdateMatchInput,
  UpdatePlayerInput,
} from './validation.js';
import { AppError } from './errors.js';

/**
 * Group results (and now group membership, since it drives seeding and bracket
 * size) feed the derived bracket. Once any knockout slot has a result, changing
 * a group match OR the group setup could silently change who qualified while the
 * entered knockout scores stay attached to their slots — a divergence. So those
 * mutations are blocked until the admin explicitly resets the knockout stage.
 */
function assertBracketNotStarted(): void {
  if (bracketRepository.hasStarted()) {
    throw new AppError(
      'BRACKET_STARTED',
      'Reset the knockout stage before changing groups, teams or group matches.',
      409,
    );
  }
}

function toUpdate(m: StoredMatch): MatchUpdate {
  return {
    matchId: m.id,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.status,
    minute: m.minute,
    rev: m.rev,
  };
}

function assertFreshRev(current: StoredMatch, expectedRev?: number): void {
  if (expectedRev !== undefined && expectedRev !== current.rev) {
    throw new AppError(
      'REV_CONFLICT',
      `Stale update: expected rev ${expectedRev} but current is ${current.rev}.`,
      409,
    );
  }
}

function getStored(id: string): StoredMatch {
  const m = matchRepository.getStored(id);
  if (!m) throw new AppError('NOT_FOUND', `Match ${id} not found.`, 404);
  return m;
}

export function listMatches(): Match[] {
  return matchRepository.list();
}

export function getMatch(id: string): Match {
  return resolveMatch(getStored(id));
}

/** Apply a partial edit (scores/status/minute) with optimistic concurrency. */
export function applyUpdate(id: string, input: UpdateMatchInput): MatchUpdate {
  assertBracketNotStarted();
  const current = getStored(id);
  assertFreshRev(current, input.expectedRev);

  const next: StoredMatch = {
    ...current,
    homeScore: input.homeScore ?? current.homeScore,
    awayScore: input.awayScore ?? current.awayScore,
    status: input.status ?? current.status,
    minute: input.minute ?? current.minute,
    rev: current.rev + 1,
  };
  matchRepository.save(next);
  return toUpdate(next);
}

/** +1 / -1 goal for one side. Never lets a score drop below zero. */
export function applyGoal(id: string, input: GoalInput): MatchUpdate {
  assertBracketNotStarted();
  const current = getStored(id);
  assertFreshRev(current, input.expectedRev);

  const field = input.team === 'home' ? 'homeScore' : 'awayScore';
  const nextScore = current[field] + input.delta;
  if (nextScore < 0) {
    throw new AppError('INVALID', 'Score cannot go below zero.', 400);
  }

  const next: StoredMatch = {
    ...current,
    [field]: nextScore,
    // A goal on a scheduled match implicitly kicks it off.
    status: current.status === 'scheduled' ? 'live' : current.status,
    rev: current.rev + 1,
  };
  matchRepository.save(next);
  return toUpdate(next);
}

/** Admin: create a new group match from two existing teams. The group is
 * derived from the teams (both must share one). Returns the full Match. */
export function createMatch(input: CreateMatchInput): Match {
  assertBracketNotStarted();
  if (input.homeId === input.awayId) {
    throw new AppError('INVALID', 'A team cannot play itself.', 400);
  }
  const home = teamRepository.get(input.homeId);
  const away = teamRepository.get(input.awayId);
  if (!home) {
    throw new AppError('INVALID', 'Home team does not exist.', 400);
  }
  if (!away) {
    throw new AppError('INVALID', 'Away team does not exist.', 400);
  }
  if (!home.groupId || !away.groupId || home.groupId !== away.groupId) {
    throw new AppError('INVALID', 'Both teams must be in the same group.', 400);
  }
  const stored: StoredMatch = {
    id: crypto.randomUUID(),
    group: home.groupId,
    homeId: input.homeId,
    awayId: input.awayId,
    homeScore: 0,
    awayScore: 0,
    status: 'scheduled',
    minute: 0,
    startsAt: input.startsAt,
    field: input.field,
    rev: 1,
  };
  matchRepository.save(stored);
  return resolveMatch(stored);
}

/** Admin: remove a match. */
export function removeMatch(id: string): void {
  assertBracketNotStarted();
  matchRepository.remove(id); // throws NOT_FOUND if missing
}

// ---- Teams & groups ----

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

/** Admin: remove a team, only if no match references it (integrity guard).
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

// ---- Players (squads) ----

export function listPlayers(): Player[] {
  return playerRepository.list();
}

function assertNumberFree(teamId: string, number: number | null | undefined, exceptId?: string): void {
  if (number == null) return;
  if (playerRepository.numberInUse(teamId, number, exceptId)) {
    throw new AppError('NUMBER_TAKEN', `Number ${number} is already used in this team.`, 409);
  }
}

/** Admin: add a player to a team. Jersey number (if given) must be free. */
export function createPlayer(teamId: string, input: CreatePlayerInput): Player {
  if (!teamRepository.get(teamId)) {
    throw new AppError('NOT_FOUND', `Team ${teamId} not found.`, 404);
  }
  const number = input.number ?? null;
  assertNumberFree(teamId, number);
  return playerRepository.create({ teamId, name: input.name, number, position: input.position ?? null });
}

/** Admin: edit a player (name/number/position). */
export function updatePlayer(id: string, input: UpdatePlayerInput): Player {
  const player = playerRepository.get(id);
  if (!player) throw new AppError('NOT_FOUND', `Player ${id} not found.`, 404);
  if (input.number !== undefined) assertNumberFree(player.teamId, input.number, id);
  return playerRepository.update(id, input);
}

/** Admin: remove a player. */
export function removePlayer(id: string): void {
  playerRepository.remove(id);
}

// ---- Knockout bracket ----

function resolvedBracket(): BracketView {
  return resolveBracket(
    groupRepository.list(),
    teamRepository.listSeed(),
    matchRepository.list(),
    bracketRepository.results(),
  );
}

/** Full knockout view (formability + resolved matches). */
export function listBracket(): BracketView {
  return resolvedBracket();
}

/** The slot ids that exist for the current group setup (empty if not formable). */
function currentSlotIds(): Set<BracketSlotId> {
  const { formable, size } = computeSize(groupRepository.list(), teamRepository.listSeed());
  if (!formable) return new Set();
  return new Set(generateBracket(size).map((s) => s.slot));
}

function assertSlot(slotRaw: string): BracketSlotId {
  if (!currentSlotIds().has(slotRaw)) {
    throw new AppError('NOT_FOUND', `Unknown knockout slot ${slotRaw}.`, 404);
  }
  return slotRaw;
}

/**
 * Admin: set one knockout slot's result. Never touches teams (they are derived).
 * Enforces: the slot exists for the current bracket size; participants are known
 * before going live/finished; a finished match cannot end level without a
 * decisive penalty result. Returns the full knockout view.
 */
export function updateBracketSlot(slotRaw: string, input: UpdateBracketInput): BracketView {
  const slot = assertSlot(slotRaw);
  const current = bracketRepository.get(slot);
  if (input.expectedRev !== undefined && input.expectedRev !== current.rev) {
    throw new AppError(
      'REV_CONFLICT',
      `Stale update: expected rev ${input.expectedRev} but current is ${current.rev}.`,
      409,
    );
  }

  const next: BracketResult = {
    homeScore: input.homeScore ?? current.homeScore,
    awayScore: input.awayScore ?? current.awayScore,
    homePens: input.homePens !== undefined ? input.homePens : current.homePens,
    awayPens: input.awayPens !== undefined ? input.awayPens : current.awayPens,
    status: input.status ?? current.status,
    field: input.field ?? current.field,
    startsAt: input.startsAt !== undefined ? input.startsAt : current.startsAt,
    rev: current.rev + 1,
  };

  // A slot can only be played once its two teams are actually known.
  if (next.status !== 'scheduled') {
    const bm = resolvedBracket().matches.find((b) => b.slot === slot);
    if (!bm || !('team' in bm.home) || !('team' in bm.away)) {
      throw new AppError('SLOT_NOT_READY', 'This knockout match has no teams yet.', 409);
    }
  }

  // Knockouts cannot end level: a finished draw needs a decisive shootout.
  if (next.status === 'finished' && next.homeScore === next.awayScore) {
    if (next.homePens == null || next.awayPens == null || next.homePens === next.awayPens) {
      throw new AppError(
        'DRAW_UNRESOLVED',
        'A level knockout match needs a penalty result to decide a winner.',
        400,
      );
    }
  }

  bracketRepository.save(slot, next);
  return resolvedBracket();
}

/** Admin: clear every knockout result (needed before changing groups/matches). */
export function resetBracket(): BracketView {
  bracketRepository.reset();
  return resolvedBracket();
}

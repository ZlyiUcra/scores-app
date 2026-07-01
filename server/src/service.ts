import crypto from 'node:crypto';
import type { Match, MatchUpdate } from '../../shared/types.js';
import { matchRepository, resolveMatch, type StoredMatch } from './store.js';
import { teamRepository } from './teams.js';
import type { CreateMatchInput, GoalInput, UpdateMatchInput } from './validation.js';
import { AppError } from './errors.js';

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

/** Admin: create a new match from two existing teams. Returns the full Match. */
export function createMatch(input: CreateMatchInput): Match {
  if (input.homeId === input.awayId) {
    throw new AppError('INVALID', 'A team cannot play itself.', 400);
  }
  if (!teamRepository.get(input.homeId)) {
    throw new AppError('INVALID', 'Home team does not exist.', 400);
  }
  if (!teamRepository.get(input.awayId)) {
    throw new AppError('INVALID', 'Away team does not exist.', 400);
  }
  const stored: StoredMatch = {
    id: crypto.randomUUID(),
    group: input.group,
    homeId: input.homeId,
    awayId: input.awayId,
    homeScore: 0,
    awayScore: 0,
    status: 'scheduled',
    minute: 0,
    startsAt: input.startsAt,
    rev: 1,
  };
  matchRepository.save(stored);
  return resolveMatch(stored);
}

/** Admin: remove a match. */
export function removeMatch(id: string): void {
  matchRepository.remove(id); // throws NOT_FOUND if missing
}

// ---- Teams ----

export function listTeams() {
  return teamRepository.list();
}

export function createTeam(input: { name: string; shortName: string }) {
  return teamRepository.create(input);
}

/** Admin: remove a team, but only if no match references it (integrity guard). */
export function removeTeam(id: string): void {
  if (!teamRepository.get(id)) {
    throw new AppError('NOT_FOUND', `Team ${id} not found.`, 404);
  }
  const used = matchRepository.countByTeam(id);
  if (used > 0) {
    throw new AppError('TEAM_IN_USE', `Team is referenced by ${used} match(es) and cannot be removed.`, 409);
  }
  teamRepository.remove(id);
}

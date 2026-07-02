import crypto from 'node:crypto';
import type { Match, MatchUpdate } from '../../../shared/types.js';
import { matchRepository, resolveMatch, type StoredMatch } from '../repos/matches.js';
import { teamRepository } from '../repos/teams.js';
import { groupRepository } from '../repos/groups.js';
import type { CreateMatchInput, GoalInput, UpdateMatchInput } from '../validation.js';
import { AppError } from '../errors.js';
import { assertBracketNotStarted } from './bracketLock.js';

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

/** Apply a partial edit (scores/status/minute/schedule) with optimistic
 * concurrency. Schedule fields join the wire diff only when actually sent. */
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
    startsAt: input.startsAt ?? current.startsAt,
    field: input.field ?? current.field,
    rev: current.rev + 1,
  };
  matchRepository.save(next);
  const update = toUpdate(next);
  if (input.startsAt !== undefined) update.startsAt = next.startsAt;
  if (input.field !== undefined) update.field = next.field;
  return update;
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

/** Order-insensitive pair identity: A-B and B-A are the same fixture. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Single round-robin pairings via the circle method: pairs come out grouped
 * in rounds where each team plays at most once, so sequential kick-off slots
 * naturally avoid back-to-back games for a team. Kept private here (single
 * caller) rather than in shared/ — the client has no use for it. */
function roundRobinPairs(ids: string[]): Array<[string, string]> {
  const arr = ids.slice();
  if (arr.length % 2 === 1) arr.push(''); // bye marker for odd team counts
  const n = arr.length;
  const out: Array<[string, string]> = [];
  let rot = arr.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round = [arr[0], ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = round[i];
      const b = round[n - 1 - i];
      if (a !== '' && b !== '') out.push([a, b]);
    }
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }
  return out;
}

/**
 * Admin: generate the missing single-round-robin fixtures for a group — every
 * unordered pair of its teams gets exactly one match. Pairs that already have
 * a match in this group (any status) are skipped, so the call is an idempotent
 * top-up after roster changes. Kick-off times are PLACEHOLDERS (sequential
 * half-hour slots from the next full hour, in circle-method round order) and
 * the field is left empty — both meant to be edited afterwards.
 */
export function generateGroupFixtures(groupId: string): Match[] {
  assertBracketNotStarted();
  if (!groupRepository.get(groupId)) {
    throw new AppError('NOT_FOUND', `Group ${groupId} not found.`, 404);
  }

  // Deterministic seeding order (groupAddedAt, then id) so repeated calls
  // produce the same schedule shape.
  const members = teamRepository
    .listSeed()
    .filter((tm) => tm.groupId === groupId)
    .sort((a, b) => (a.groupAddedAt ?? '').localeCompare(b.groupAddedAt ?? '') || a.id.localeCompare(b.id));
  if (members.length < 2) {
    throw new AppError('INVALID', 'A group needs at least two teams to generate games.', 400);
  }

  const covered = new Set<string>();
  const all = matchRepository.list();
  for (let i = 0; i < all.length; i++) {
    if (all[i].group === groupId) covered.add(pairKey(all[i].home.id, all[i].away.id));
  }

  const base = new Date();
  base.setMinutes(0, 0, 0);
  base.setHours(base.getHours() + 1);

  const pairs = roundRobinPairs(members.map((tm) => tm.id));
  const created: Match[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [homeId, awayId] = pairs[i];
    if (covered.has(pairKey(homeId, awayId))) continue;
    const startsAt = new Date(base.getTime() + created.length * 30 * 60 * 1000).toISOString();
    created.push(createMatch({ homeId, awayId, startsAt, field: '' }));
  }
  return created;
}

import crypto from 'node:crypto';
import type { Match, MatchUpdate } from '../../../shared/types.js';
import type { StoredMatch } from '../storage/contracts.js';
import { groupRepository, matchRepository, teamRepository } from '../storage/index.js';
import type { CreateMatchInput, GoalInput, UpdateMatchInput } from '../validation.js';
import { AppError, AppErrorCode, requireFound } from '../errors.js';
import { assertBracketNotStarted } from './bracketLock.js';
import { assertTournamentEditable } from './tournamentLock.js';
import { withMutationLock } from './mutationLock.js';

function toUpdate(m: StoredMatch): MatchUpdate {
  return {
    matchId: m.id,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.status,
    rev: m.rev,
  };
}

function assertFreshRev(current: StoredMatch, expectedRev?: number): void {
  if (expectedRev !== undefined && expectedRev !== current.rev) {
    throw new AppError(
      AppErrorCode.RevConflict,
      `Stale update: expected rev ${expectedRev} but current is ${current.rev}.`,
      409,
    );
  }
}

async function getStored(id: string): Promise<StoredMatch> {
  return requireFound(await matchRepository.getStored(id), `Match ${id} not found.`);
}

/** A tournament's matches as resolved DTOs (teams embedded) — the
 * read/broadcast shape. */
export function listMatches(tournamentId: string): Promise<Match[]> {
  return matchRepository.list(tournamentId);
}

/** One match as a resolved DTO. Throws NOT_FOUND for an unknown id. */
export async function getMatch(id: string): Promise<Match> {
  return requireFound(await matchRepository.get(id), `Match ${id} not found.`);
}

/** Apply a partial edit (scores/status/schedule) with optimistic concurrency.
 * Schedule fields join the wire diff only when actually sent. Returns the
 * owning tournament alongside so routes can scope broadcasts. */
export function applyUpdate(id: string, input: UpdateMatchInput): Promise<{ update: MatchUpdate; tournamentId: string }> {
  return withMutationLock(async () => {
    const current = await getStored(id);
    await assertTournamentEditable(current.tournamentId);
    await assertBracketNotStarted(current.tournamentId);
    assertFreshRev(current, input.expectedRev);

    const next: StoredMatch = {
      ...current,
      homeScore: input.homeScore ?? current.homeScore,
      awayScore: input.awayScore ?? current.awayScore,
      status: input.status ?? current.status,
      startsAt: input.startsAt ?? current.startsAt,
      field: input.field ?? current.field,
      rev: current.rev + 1,
    };
    await matchRepository.save(next);
    const update = toUpdate(next);
    if (input.startsAt !== undefined) update.startsAt = next.startsAt;
    if (input.field !== undefined) update.field = next.field;
    return { update, tournamentId: current.tournamentId };
  });
}

/** +1 / -1 goal for one side. Never lets a score drop below zero. */
export function applyGoal(id: string, input: GoalInput): Promise<{ update: MatchUpdate; tournamentId: string }> {
  return withMutationLock(async () => {
    const current = await getStored(id);
    await assertTournamentEditable(current.tournamentId);
    await assertBracketNotStarted(current.tournamentId);
    assertFreshRev(current, input.expectedRev);

    const field = input.team === 'home' ? 'homeScore' : 'awayScore';
    const nextScore = current[field] + input.delta;
    if (nextScore < 0) {
      throw new AppError(AppErrorCode.Invalid, 'Score cannot go below zero.', 400);
    }

    const next: StoredMatch = {
      ...current,
      [field]: nextScore,
      // A goal on a scheduled match implicitly kicks it off.
      status: current.status === 'scheduled' ? 'live' : current.status,
      rev: current.rev + 1,
    };
    await matchRepository.save(next);
    return { update: toUpdate(next), tournamentId: current.tournamentId };
  });
}

/** Lock-free body shared by createMatch (locked entry point) and
 * generateGroupFixtures (already inside the lock). */
async function createMatchInner(input: CreateMatchInput): Promise<{ match: Match; tournamentId: string }> {
  if (input.homeId === input.awayId) {
    throw new AppError(AppErrorCode.Invalid, 'A team cannot play itself.', 400);
  }
  const home = await teamRepository.getStored(input.homeId);
  const away = await teamRepository.getStored(input.awayId);
  if (!home) {
    throw new AppError(AppErrorCode.Invalid, 'Home team does not exist.', 400);
  }
  if (!away) {
    throw new AppError(AppErrorCode.Invalid, 'Away team does not exist.', 400);
  }
  if (!home.groupId || !away.groupId || home.groupId !== away.groupId) {
    throw new AppError(AppErrorCode.Invalid, 'Both teams must be in the same group.', 400);
  }
  await assertTournamentEditable(home.tournamentId);
  await assertBracketNotStarted(home.tournamentId);
  const stored: StoredMatch = {
    id: crypto.randomUUID(),
    tournamentId: home.tournamentId,
    group: home.groupId,
    homeId: input.homeId,
    awayId: input.awayId,
    homeScore: 0,
    awayScore: 0,
    status: 'scheduled',
    startsAt: input.startsAt,
    field: input.field,
    rev: 1,
  };
  const match = await matchRepository.save(stored);
  return { match, tournamentId: home.tournamentId };
}

/** Admin: create a new group match from two existing teams. The group — and
 * through it the tournament — is derived from the teams (both must share one
 * group). Returns the full Match plus the owning tournament. */
export function createMatch(input: CreateMatchInput): Promise<{ match: Match; tournamentId: string }> {
  return withMutationLock(() => createMatchInner(input));
}

/** Admin: remove a match. Returns the owning tournament. */
export function removeMatch(id: string): Promise<string> {
  return withMutationLock(async () => {
    const current = await getStored(id);
    await assertTournamentEditable(current.tournamentId);
    await assertBracketNotStarted(current.tournamentId);
    await matchRepository.remove(id);
    return current.tournamentId;
  });
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
export function generateGroupFixtures(groupId: string): Promise<{ matches: Match[]; tournamentId: string }> {
  return withMutationLock(async () => {
    const group = requireFound(await groupRepository.getStored(groupId), `Group ${groupId} not found.`);
    await assertTournamentEditable(group.tournamentId);
    await assertBracketNotStarted(group.tournamentId);

    // Deterministic seeding order (groupAddedAt, then id) so repeated calls
    // produce the same schedule shape.
    const members = (await teamRepository.listSeed(group.tournamentId))
      .filter((tm) => tm.groupId === groupId)
      .sort((a, b) => (a.groupAddedAt ?? '').localeCompare(b.groupAddedAt ?? '') || a.id.localeCompare(b.id));
    if (members.length < 2) {
      throw new AppError(AppErrorCode.Invalid, 'A group needs at least two teams to generate games.', 400);
    }

    const covered = new Set<string>();
    const all = await matchRepository.list(group.tournamentId);
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
      created.push((await createMatchInner({ homeId, awayId, startsAt, field: '' })).match);
    }
    return { matches: created, tournamentId: group.tournamentId };
  });
}

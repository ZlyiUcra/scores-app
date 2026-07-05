import type { Tournament } from '../../../shared/types.js';
import {
  bracketRepository,
  groupRepository,
  matchRepository,
  teamRepository,
  tournamentRepository,
} from '../storage/index.js';
import type { CreateTournamentInput, UpdateTournamentInput } from '../validation.js';
import { AppError, AppErrorCode, requireFound } from '../errors.js';
import { withMutationLock } from './mutationLock.js';

/** All tournaments in stable creation order. */
export function listTournaments(): Promise<Tournament[]> {
  return tournamentRepository.list();
}

/** One tournament. Throws NOT_FOUND for an unknown id. */
export async function getTournament(id: string): Promise<Tournament> {
  return requireFound(await tournamentRepository.get(id), `Tournament ${id} not found.`);
}

/**
 * The tournament a request lands in when it names none — the compatibility
 * seam that keeps the pre-tournament client working. The last-created ACTIVE
 * tournament wins (several can be active at once); with none active, the
 * last-created tournament overall. Bootstrap guarantees at least one exists
 * at boot, and the last one cannot be deleted, so this never comes up empty.
 */
export async function defaultTournamentId(): Promise<string> {
  const all = await tournamentRepository.list(); // creation order
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].status === 'active') return all[i].id;
  }
  return all[all.length - 1].id;
}

/** Resolve an optional client-supplied tournament id: validate it when given,
 * fall back to the default when absent. Every scoped route funnels through
 * here so the not-found behavior stays uniform. */
export async function resolveTournamentId(requested: string | undefined): Promise<string> {
  if (requested === undefined) return defaultTournamentId();
  return (await getTournament(requested)).id;
}

/** Admin: create a tournament. */
export function createTournament(input: CreateTournamentInput): Promise<Tournament> {
  return withMutationLock(() =>
    tournamentRepository.create({
      name: input.name,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      status: input.status ?? 'upcoming',
    }),
  );
}

/** Admin: rename a tournament / adjust its dates or status. */
export function updateTournament(id: string, patch: UpdateTournamentInput): Promise<Tournament> {
  return withMutationLock(() => tournamentRepository.update(id, patch));
}

/** Admin: remove a tournament — only an EMPTY one (no groups, teams, matches
 * or knockout rows; mirrors the empty-group delete guard) and never the last
 * one, so the default-tournament resolution always has something to return. */
export function removeTournament(id: string): Promise<void> {
  return withMutationLock(async () => {
    await getTournament(id); // NOT_FOUND for unknown ids before any guard fires
    if ((await tournamentRepository.list()).length <= 1) {
      throw new AppError(AppErrorCode.LastTournament, 'The last tournament cannot be deleted.', 409);
    }
    const used =
      (await groupRepository.countByTournament(id)) > 0 ||
      (await teamRepository.countByTournament(id)) > 0 ||
      (await matchRepository.countByTournament(id)) > 0 ||
      (await bracketRepository.hasAny(id));
    if (used) {
      throw new AppError(
        AppErrorCode.TournamentInUse,
        'Remove the tournament\'s groups, teams and games before deleting it.',
        409,
      );
    }
    await tournamentRepository.remove(id);
  });
}

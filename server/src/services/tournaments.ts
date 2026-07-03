import type { Tournament } from '../../../shared/types.js';
import { tournamentRepository } from '../repos/tournaments.js';
import { groupRepository } from '../repos/groups.js';
import { teamRepository } from '../repos/teams.js';
import { matchRepository } from '../repos/matches.js';
import { bracketRepository } from '../repos/bracket.js';
import type { CreateTournamentInput, UpdateTournamentInput } from '../validation.js';
import { AppError } from '../errors.js';

/** All tournaments in stable creation order. */
export function listTournaments(): Tournament[] {
  return tournamentRepository.list();
}

/** One tournament. Throws NOT_FOUND for an unknown id. */
export function getTournament(id: string): Tournament {
  const t = tournamentRepository.get(id);
  if (!t) throw new AppError('NOT_FOUND', `Tournament ${id} not found.`, 404);
  return t;
}

/**
 * The tournament a request lands in when it names none — the compatibility
 * seam that keeps the pre-tournament client working. The last-created ACTIVE
 * tournament wins (several can be active at once); with none active, the
 * last-created tournament overall. db.ts guarantees at least one exists at
 * boot, and the last one cannot be deleted, so this never comes up empty.
 */
export function defaultTournamentId(): string {
  const all = tournamentRepository.list(); // creation order
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].status === 'active') return all[i].id;
  }
  return all[all.length - 1].id;
}

/** Resolve an optional client-supplied tournament id: validate it when given,
 * fall back to the default when absent. Every scoped route funnels through
 * here so the not-found behavior stays uniform. */
export function resolveTournamentId(requested: string | undefined): string {
  if (requested === undefined) return defaultTournamentId();
  return getTournament(requested).id;
}

/** Admin: create a tournament. */
export function createTournament(input: CreateTournamentInput): Tournament {
  return tournamentRepository.create({
    name: input.name,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    status: input.status ?? 'upcoming',
  });
}

/** Admin: rename a tournament / adjust its dates or status. */
export function updateTournament(id: string, patch: UpdateTournamentInput): Tournament {
  return tournamentRepository.update(id, patch);
}

/** Admin: remove a tournament — only an EMPTY one (no groups, teams, matches
 * or knockout rows; mirrors the empty-group delete guard) and never the last
 * one, so the default-tournament resolution always has something to return. */
export function removeTournament(id: string): void {
  getTournament(id); // NOT_FOUND for unknown ids before any guard fires
  if (tournamentRepository.list().length <= 1) {
    throw new AppError('LAST_TOURNAMENT', 'The last tournament cannot be deleted.', 409);
  }
  const used =
    groupRepository.countByTournament(id) > 0 ||
    teamRepository.countByTournament(id) > 0 ||
    matchRepository.countByTournament(id) > 0 ||
    bracketRepository.hasAny(id);
  if (used) {
    throw new AppError(
      'TOURNAMENT_IN_USE',
      'Remove the tournament\'s groups, teams and games before deleting it.',
      409,
    );
  }
  tournamentRepository.remove(id);
}

import { tournamentRepository } from '../repos/tournaments.js';
import { AppError } from '../errors.js';

/**
 * A FINISHED tournament is an archive: every mutation inside it (roster,
 * matches, squads, knockout) is rejected until an admin reopens it by setting
 * the status back — the tournament PATCH itself is deliberately NOT guarded,
 * it is the escape hatch. Same leaf-module shape as bracketLock: repos-only
 * imports, shared by every mutation service.
 */
export function assertTournamentEditable(tournamentId: string): void {
  if (tournamentRepository.get(tournamentId)?.status === 'finished') {
    throw new AppError(
      'TOURNAMENT_FINISHED',
      'This tournament is finished. Set it back to active to make changes.',
      409,
    );
  }
}

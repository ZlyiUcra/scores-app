import { tournamentRepository } from '../storage/index.js';
import { AppError, AppErrorCode } from '../errors.js';

/**
 * A FINISHED tournament is an archive: every mutation inside it (roster,
 * matches, squads, knockout) is rejected until an admin reopens it by setting
 * the status back - the tournament PATCH itself is deliberately NOT guarded,
 * it is the escape hatch. Same leaf-module shape as bracketGuard: storage-only
 * imports, shared by every mutation service.
 */
export async function assertTournamentEditable(tournamentId: string): Promise<void> {
  if ((await tournamentRepository.get(tournamentId))?.status === 'finished') {
    throw new AppError(
      AppErrorCode.TournamentFinished,
      'This tournament is finished. Set it back to active to make changes.',
      409,
    );
  }
}

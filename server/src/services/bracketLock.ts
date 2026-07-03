import { bracketRepository } from '../repos/bracket.js';
import { AppError } from '../errors.js';

/**
 * Group results (and group membership, since it drives seeding and bracket
 * size) feed the derived bracket. Once any knockout slot has a result OR a
 * pinned participant (override), changing a group match OR the group setup
 * could silently change who qualified — or delete/repoint the very team an
 * override references — while the entered knockout state stays attached to its
 * slots: a divergence. So those mutations are blocked until the admin
 * explicitly resets the knockout stage.
 *
 * This is the ONE invariant shared by the match and roster services; it stays
 * a leaf module (repos-only imports) so neither service has to import a peer.
 */
export function assertBracketNotStarted(tournamentId: string): void {
  if (bracketRepository.hasStarted(tournamentId)) {
    throw new AppError(
      'BRACKET_STARTED',
      'Reset the knockout stage before changing groups, teams or group matches.',
      409,
    );
  }
}

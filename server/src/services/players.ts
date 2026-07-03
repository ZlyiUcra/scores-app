import type { Player } from '../../../shared/types.js';
import { teamRepository } from '../repos/teams.js';
import { playerRepository } from '../repos/players.js';
import type { CreatePlayerInput, UpdatePlayerInput } from '../validation.js';
import { AppError } from '../errors.js';
import { assertTournamentEditable } from './tournamentLock.js';

// Squads are purely descriptive (no effect on standings/seeding), so none of
// these mutations take the bracket lock. Players inherit their tournament
// from the owning team; mutations RETURN it so routes can scope broadcasts.

function assertNumberFree(teamId: string, number: number | null | undefined, exceptId?: string): void {
  if (number == null) return;
  if (playerRepository.numberInUse(teamId, number, exceptId)) {
    throw new AppError('NUMBER_TAKEN', `Number ${number} is already used in this team.`, 409);
  }
}

/** The owning team's tournament (the player's scope). */
function tournamentOfTeam(teamId: string): string {
  const team = teamRepository.getStored(teamId);
  if (!team) throw new AppError('NOT_FOUND', `Team ${teamId} not found.`, 404);
  return team.tournamentId;
}

/** Admin: add a player to a team. Jersey number (if given) must be free. */
export function createPlayer(teamId: string, input: CreatePlayerInput): { player: Player; tournamentId: string } {
  const tournamentId = tournamentOfTeam(teamId);
  assertTournamentEditable(tournamentId);
  const number = input.number ?? null;
  assertNumberFree(teamId, number);
  return {
    player: playerRepository.create({ teamId, name: input.name, number, position: input.position ?? null }),
    tournamentId,
  };
}

/** Admin: edit a player (name/number/position). */
export function updatePlayer(id: string, input: UpdatePlayerInput): { player: Player; tournamentId: string } {
  const player = playerRepository.get(id);
  if (!player) throw new AppError('NOT_FOUND', `Player ${id} not found.`, 404);
  const tournamentId = tournamentOfTeam(player.teamId);
  assertTournamentEditable(tournamentId);
  if (input.number !== undefined) assertNumberFree(player.teamId, input.number, id);
  return { player: playerRepository.update(id, input), tournamentId };
}

/** Admin: remove a player. Returns the owning tournament. */
export function removePlayer(id: string): string {
  const player = playerRepository.get(id);
  if (!player) throw new AppError('NOT_FOUND', `Player ${id} not found.`, 404);
  const tournamentId = tournamentOfTeam(player.teamId);
  assertTournamentEditable(tournamentId);
  playerRepository.remove(id);
  return tournamentId;
}

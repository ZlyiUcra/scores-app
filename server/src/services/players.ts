import type { Player } from '../../../shared/types.js';
import { teamRepository } from '../repos/teams.js';
import { playerRepository } from '../repos/players.js';
import type { CreatePlayerInput, UpdatePlayerInput } from '../validation.js';
import { AppError } from '../errors.js';

// Squads are purely descriptive (no effect on standings/seeding), so none of
// these mutations take the bracket lock.

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

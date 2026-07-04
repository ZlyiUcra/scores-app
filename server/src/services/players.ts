import type { Player } from '../../../shared/types.js';
import { playerRepository, teamRepository } from '../storage/index.js';
import type { CreatePlayerInput, UpdatePlayerInput } from '../validation.js';
import { AppError } from '../errors.js';
import { assertTournamentEditable } from './tournamentLock.js';
import { withMutationLock } from './mutationLock.js';

// Squads are purely descriptive (no effect on standings/seeding), so none of
// these mutations take the bracket lock. Players inherit their tournament
// from the owning team; mutations RETURN it so routes can scope broadcasts.

async function assertNumberFree(teamId: string, number: number | null | undefined, exceptId?: string): Promise<void> {
  if (number == null) return;
  if (await playerRepository.numberInUse(teamId, number, exceptId)) {
    throw new AppError('NUMBER_TAKEN', `Number ${number} is already used in this team.`, 409);
  }
}

/** The owning team's tournament (the player's scope). */
async function tournamentOfTeam(teamId: string): Promise<string> {
  const team = await teamRepository.getStored(teamId);
  if (!team) throw new AppError('NOT_FOUND', `Team ${teamId} not found.`, 404);
  return team.tournamentId;
}

/** Admin: add a player to a team. Jersey number (if given) must be free. */
export function createPlayer(teamId: string, input: CreatePlayerInput): Promise<{ player: Player; tournamentId: string }> {
  return withMutationLock(async () => {
    const tournamentId = await tournamentOfTeam(teamId);
    await assertTournamentEditable(tournamentId);
    const number = input.number ?? null;
    await assertNumberFree(teamId, number);
    return {
      player: await playerRepository.create({ teamId, name: input.name, number, position: input.position ?? null }),
      tournamentId,
    };
  });
}

/** Admin: edit a player (name/number/position). */
export function updatePlayer(id: string, input: UpdatePlayerInput): Promise<{ player: Player; tournamentId: string }> {
  return withMutationLock(async () => {
    const player = await playerRepository.get(id);
    if (!player) throw new AppError('NOT_FOUND', `Player ${id} not found.`, 404);
    const tournamentId = await tournamentOfTeam(player.teamId);
    await assertTournamentEditable(tournamentId);
    if (input.number !== undefined) await assertNumberFree(player.teamId, input.number, id);
    return { player: await playerRepository.update(id, input), tournamentId };
  });
}

/** Admin: remove a player. Returns the owning tournament. */
export function removePlayer(id: string): Promise<string> {
  return withMutationLock(async () => {
    const player = await playerRepository.get(id);
    if (!player) throw new AppError('NOT_FOUND', `Player ${id} not found.`, 404);
    const tournamentId = await tournamentOfTeam(player.teamId);
    await assertTournamentEditable(tournamentId);
    await playerRepository.remove(id);
    return tournamentId;
  });
}

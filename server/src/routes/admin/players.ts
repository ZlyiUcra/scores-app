import { Router } from 'express';
import { createPlayerSchema, parseOrThrow, updatePlayerSchema } from '../../validation.js';
import { audit } from '../../audit.js';
import { createPlayer, removePlayer, updatePlayer } from '../../services/players.js';
import { getRoster } from '../../services/roster.js';
import { broadcastRoster } from '../../socket.js';
import { adminMutationLimiter } from './mutationLimiter.js';

/** Admin squad management: players are purely descriptive (no effect on
 * standings/seeding), so no bracket rebroadcasts here - squads ride the
 * roster snapshot of the owning team's tournament. Mounted under /api/admin
 * (auth applied in the parent). */
export const adminPlayersRouter = Router();

// Add a player to a team. The team comes from the URL, never the body.
adminPlayersRouter.post('/teams/:id/players', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(createPlayerSchema, req.body, 'Invalid body.');
    const { player, tournamentId } = await createPlayer(req.params.id, parsed);
    broadcastRoster(tournamentId, await getRoster(tournamentId)); // squads ride the roster snapshot
    audit(req.user!.id, 'player.create', player.id);
    res.status(201).json({ player });
  } catch (err) {
    next(err);
  }
});

// Edit a player (name/number/position). Team is not editable - delete + re-add.
adminPlayersRouter.patch('/players/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(updatePlayerSchema, req.body, 'Invalid body.');
    const { player, tournamentId } = await updatePlayer(req.params.id, parsed);
    broadcastRoster(tournamentId, await getRoster(tournamentId));
    audit(req.user!.id, `player.update(${JSON.stringify(parsed)})`, req.params.id);
    res.json({ player });
  } catch (err) {
    next(err);
  }
});

adminPlayersRouter.delete('/players/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    const tournamentId = await removePlayer(req.params.id);
    broadcastRoster(tournamentId, await getRoster(tournamentId));
    audit(req.user!.id, 'player.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

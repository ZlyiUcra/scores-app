import { Router } from 'express';
import { createPlayerSchema, updatePlayerSchema } from '../../validation.js';
import { audit } from '../../audit.js';
import { createPlayer, removePlayer, updatePlayer } from '../../services/players.js';
import { getRoster } from '../../services/roster.js';
import { broadcastRoster } from '../../socket.js';
import { adminMutationLimiter } from './mutationLimiter.js';

/** Admin squad management: players are purely descriptive (no effect on
 * standings/seeding), so no bracket rebroadcasts here — squads ride the
 * roster snapshot of the owning team's tournament. Mounted under /api/admin
 * (auth applied in the parent). */
export const adminPlayersRouter = Router();

// Add a player to a team. The team comes from the URL, never the body.
adminPlayersRouter.post('/teams/:id/players', adminMutationLimiter, (req, res, next) => {
  const parsed = createPlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const { player, tournamentId } = createPlayer(req.params.id, parsed.data);
    broadcastRoster(tournamentId, getRoster(tournamentId)); // squads ride the roster snapshot
    audit(req.user!.id, 'player.create', player.id);
    res.status(201).json({ player });
  } catch (err) {
    next(err);
  }
});

// Edit a player (name/number/position). Team is not editable — delete + re-add.
adminPlayersRouter.patch('/players/:id', adminMutationLimiter, (req, res, next) => {
  const parsed = updatePlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const { player, tournamentId } = updatePlayer(req.params.id, parsed.data);
    broadcastRoster(tournamentId, getRoster(tournamentId));
    audit(req.user!.id, `player.update(${JSON.stringify(parsed.data)})`, req.params.id);
    res.json({ player });
  } catch (err) {
    next(err);
  }
});

adminPlayersRouter.delete('/players/:id', adminMutationLimiter, (req, res, next) => {
  try {
    const tournamentId = removePlayer(req.params.id);
    broadcastRoster(tournamentId, getRoster(tournamentId));
    audit(req.user!.id, 'player.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

import { Router } from 'express';
import { createTournamentSchema, parseOrThrow, updateTournamentSchema } from '../../validation.js';
import { audit } from '../../audit.js';
import { createTournament, removeTournament, updateTournament } from '../../services/tournaments.js';
import { adminMutationLimiter } from './mutationLimiter.js';

/** Admin tournament lifecycle: create / rename / dates / status / delete.
 * No broadcasts — the tournament list is not pushed over the socket (clients
 * fetch it over REST); everything inside a tournament rides the existing
 * scoped events. Mounted under /api/admin (auth applied in the parent). */
export const adminTournamentsRouter = Router();

adminTournamentsRouter.post('/tournaments', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(createTournamentSchema, req.body, 'Invalid body.');
    const tournament = await createTournament(parsed);
    audit(req.user!.id, 'tournament.create', tournament.id);
    res.status(201).json({ tournament });
  } catch (err) {
    next(err);
  }
});

adminTournamentsRouter.patch('/tournaments/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(updateTournamentSchema, req.body, 'Invalid body.');
    const tournament = await updateTournament(req.params.id, parsed);
    audit(req.user!.id, `tournament.update(${JSON.stringify(parsed)})`, req.params.id);
    res.json({ tournament });
  } catch (err) {
    next(err);
  }
});

adminTournamentsRouter.delete('/tournaments/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    await removeTournament(req.params.id); // 409 unless empty and not the last one
    audit(req.user!.id, 'tournament.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

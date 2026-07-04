import { Router } from 'express';
import { createTournamentSchema, updateTournamentSchema } from '../../validation.js';
import { audit } from '../../audit.js';
import { createTournament, removeTournament, updateTournament } from '../../services/tournaments.js';
import { adminMutationLimiter } from './mutationLimiter.js';

/** Admin tournament lifecycle: create / rename / dates / status / delete.
 * No broadcasts — the tournament list is not pushed over the socket (clients
 * fetch it over REST); everything inside a tournament rides the existing
 * scoped events. Mounted under /api/admin (auth applied in the parent). */
export const adminTournamentsRouter = Router();

adminTournamentsRouter.post('/tournaments', adminMutationLimiter, async (req, res, next) => {
  const parsed = createTournamentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const tournament = await createTournament(parsed.data);
    audit(req.user!.id, 'tournament.create', tournament.id);
    res.status(201).json({ tournament });
  } catch (err) {
    next(err);
  }
});

adminTournamentsRouter.patch('/tournaments/:id', adminMutationLimiter, async (req, res, next) => {
  const parsed = updateTournamentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const tournament = await updateTournament(req.params.id, parsed.data);
    audit(req.user!.id, `tournament.update(${JSON.stringify(parsed.data)})`, req.params.id);
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

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { defaultTournamentId, listTournaments } from '../services/tournaments.js';

/** /api/tournaments - read-only list for any logged-in user. `defaultId` names
 * the tournament every unscoped request lands in, so clients can tell which
 * one they are looking at without re-implementing the resolution rule. */
export const tournamentsRouter = Router();

tournamentsRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    res.json({ tournaments: await listTournaments(), defaultId: await defaultTournamentId() });
  } catch (err) {
    next(err);
  }
});

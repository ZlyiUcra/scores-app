import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getRoster } from '../services/roster.js';
import { requestTournamentId } from './scope.js';

/** /api/roster — read-only aggregate (groups + teams + players) of one
 * tournament for any logged-in user; the same shape rides the roster:snapshot
 * socket event. */
export const rosterRouter = Router();

// Groups + teams (with membership). Any logged-in user; drives client standings.
rosterRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json({ roster: await getRoster(await requestTournamentId(req)) });
  } catch (err) {
    next(err);
  }
});

import { Router } from 'express';
import { createMatchSchema, parseOrThrow } from '../../validation.js';
import { audit } from '../../audit.js';
import { createMatch, removeMatch } from '../../services/matches.js';
import { listBracket } from '../../services/bracket.js';
import { broadcastBracket, broadcastMatchCreated, broadcastMatchRemoved } from '../../socket.js';
import { adminMutationLimiter } from './mutationLimiter.js';

/** Admin match lifecycle: create/delete only — score edits stay on the public
 * /api/matches routes. The tournament is derived from the match's teams, never
 * supplied. Mounted under /api/admin (auth applied in the parent). */
export const adminMatchesRouter = Router();

adminMatchesRouter.post('/matches', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(createMatchSchema, req.body, 'Invalid body.');
    const { match, tournamentId } = await createMatch(parsed);
    broadcastMatchCreated(tournamentId, match); // appears live for everyone
    broadcastBracket(tournamentId, await listBracket(tournamentId)); // a new group match can change seeding
    audit(req.user!.id, 'match.create', match.id);
    res.status(201).json({ match });
  } catch (err) {
    next(err);
  }
});

adminMatchesRouter.delete('/matches/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    const tournamentId = await removeMatch(req.params.id);
    broadcastMatchRemoved(tournamentId, req.params.id);
    broadcastBracket(tournamentId, await listBracket(tournamentId));
    audit(req.user!.id, 'match.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

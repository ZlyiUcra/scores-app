import { Router } from 'express';
import { createMatchSchema } from '../../validation.js';
import { audit } from '../../audit.js';
import { createMatch, removeMatch } from '../../services/matches.js';
import { listBracket } from '../../services/bracket.js';
import { broadcastBracket, broadcastMatchCreated, broadcastMatchRemoved } from '../../socket.js';
import { adminMutationLimiter } from './mutationLimiter.js';

/** Admin match lifecycle: create/delete only — score edits stay on the public
 * /api/matches routes. Mounted under /api/admin (auth applied in the parent). */
export const adminMatchesRouter = Router();

adminMatchesRouter.post('/matches', adminMutationLimiter, (req, res, next) => {
  const parsed = createMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const match = createMatch(parsed.data);
    broadcastMatchCreated(match); // appears live for everyone
    broadcastBracket(listBracket()); // a new group match can change seeding
    audit(req.user!.id, 'match.create', match.id);
    res.status(201).json({ match });
  } catch (err) {
    next(err);
  }
});

adminMatchesRouter.delete('/matches/:id', adminMutationLimiter, (req, res, next) => {
  try {
    removeMatch(req.params.id);
    broadcastMatchRemoved(req.params.id);
    broadcastBracket(listBracket());
    audit(req.user!.id, 'match.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

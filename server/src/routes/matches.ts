import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import { goalSchema, updateMatchSchema } from '../validation.js';
import { applyGoal, applyUpdate, getMatch, listBracket, listMatches } from '../service.js';
import { broadcastBracket, broadcastMatchUpdate } from '../socket.js';

export const matchesRouter = Router();

// Reads require a logged-in user (any role).
matchesRouter.get('/', requireAuth, (_req, res) => {
  res.json({ matches: listMatches() });
});

matchesRouter.get('/:id', requireAuth, (req, res, next) => {
  try {
    res.json({ match: getMatch(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// Writes require admin. Client-side hiding of these controls is UX only;
// this middleware is the actual gate.
matchesRouter.patch('/:id', requireAdmin, (req, res, next) => {
  const parsed = updateMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const update = applyUpdate(req.params.id, parsed.data);
    broadcastMatchUpdate(update);
    // A group result may complete a group and re-seed the bracket.
    broadcastBracket(listBracket());
    res.json({ update });
  } catch (err) {
    next(err);
  }
});

matchesRouter.post('/:id/goal', requireAdmin, (req, res, next) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const update = applyGoal(req.params.id, parsed.data);
    broadcastMatchUpdate(update);
    broadcastBracket(listBracket());
    res.json({ update });
  } catch (err) {
    next(err);
  }
});

import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import { goalSchema, updateMatchSchema } from '../validation.js';
import { applyGoal, applyUpdate, getMatch, listMatches } from '../services/matches.js';
import { listBracket } from '../services/bracket.js';
import { broadcastBracket, broadcastMatchUpdate } from '../socket.js';
import { requestTournamentId } from './scope.js';

/** /api/matches — reads for any logged-in user; live score/status edits are
 * admin-only and each write broadcasts a compact diff plus a bracket refresh
 * (a group result can re-seed the knockout). The list is tournament-scoped;
 * id-addressed routes need no scope (ids are global) and derive the
 * tournament for their broadcasts from the match itself. */
export const matchesRouter = Router();

// Reads require a logged-in user (any role).
matchesRouter.get('/', requireAuth, (req, res, next) => {
  try {
    res.json({ matches: listMatches(requestTournamentId(req)) });
  } catch (err) {
    next(err);
  }
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
    const { update, tournamentId } = applyUpdate(req.params.id, parsed.data);
    broadcastMatchUpdate(tournamentId, update);
    // A group result may complete a group and re-seed the bracket.
    broadcastBracket(tournamentId, listBracket(tournamentId));
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
    const { update, tournamentId } = applyGoal(req.params.id, parsed.data);
    broadcastMatchUpdate(tournamentId, update);
    broadcastBracket(tournamentId, listBracket(tournamentId));
    res.json({ update });
  } catch (err) {
    next(err);
  }
});

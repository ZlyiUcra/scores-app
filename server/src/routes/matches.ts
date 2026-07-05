import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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
 * tournament for their broadcasts from the match itself.
 * Express 4 note: every await sits INSIDE the try — rejections must reach
 * next(err) by hand, the framework won't route them. */
export const matchesRouter = Router();

// Same 60/min brake as the bracket and admin write routes. Each score edit
// re-broadcasts the match and recomputes the bracket, so a runaway client (or
// a leaked admin cookie) must not flood the live path.
const matchMutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many match actions. Slow down.' } },
});

// Reads require a logged-in user (any role).
matchesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json({ matches: await listMatches(await requestTournamentId(req)) });
  } catch (err) {
    next(err);
  }
});

matchesRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    res.json({ match: await getMatch(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// Writes require admin. Client-side hiding of these controls is UX only;
// this middleware is the actual gate. Broadcast payloads (incl. the bracket
// recompute) are built AFTER the service call returns — outside the lock.
matchesRouter.patch('/:id', requireAdmin, matchMutationLimiter, async (req, res, next) => {
  const parsed = updateMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const { update, tournamentId } = await applyUpdate(req.params.id, parsed.data);
    broadcastMatchUpdate(tournamentId, update);
    // A group result may complete a group and re-seed the bracket.
    broadcastBracket(tournamentId, await listBracket(tournamentId));
    res.json({ update });
  } catch (err) {
    next(err);
  }
});

matchesRouter.post('/:id/goal', requireAdmin, matchMutationLimiter, async (req, res, next) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const { update, tournamentId } = await applyGoal(req.params.id, parsed.data);
    broadcastMatchUpdate(tournamentId, update);
    broadcastBracket(tournamentId, await listBracket(tournamentId));
    res.json({ update });
  } catch (err) {
    next(err);
  }
});

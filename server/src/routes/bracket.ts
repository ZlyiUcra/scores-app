import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin, requireAuth } from '../auth.js';
import { audit } from '../audit.js';
import { parseOrThrow, updateBracketSchema } from '../validation.js';
import { listBracket, resetBracket, updateBracketSlot } from '../services/bracket.js';
import { broadcastBracket } from '../socket.js';
import { requestTournamentId } from './scope.js';

/** /api/bracket — knockout view for any logged-in user; slot writes and the
 * full reset are admin-only and re-broadcast the resolved bracket. All routes
 * are tournament-scoped (slot ids repeat across tournaments), resolved from
 * the optional `?tournamentId=` with the default-tournament fallback. */
export const bracketRouter = Router();

const bracketMutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many bracket actions. Slow down.' } },
});

// Read: any logged-in user.
bracketRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json({ bracket: await listBracket(await requestTournamentId(req)) });
  } catch (err) {
    next(err);
  }
});

// Write one slot's result and/or participant pins: admin only. The slot comes
// from the URL; override ids in the body are the one sanctioned way to place a
// team manually (validated in the service).
bracketRouter.patch('/:slot', requireAdmin, bracketMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(updateBracketSchema, req.body, 'Invalid body.');
    const tournamentId = await requestTournamentId(req);
    const bracket = await updateBracketSlot(tournamentId, req.params.slot, parsed);
    // Rewiring who plays is the highest-impact bracket write — leave a trace.
    if (parsed.homeOverrideId !== undefined || parsed.awayOverrideId !== undefined) {
      const pins = { home: parsed.homeOverrideId, away: parsed.awayOverrideId };
      audit(req.user!.id, `bracket.override(${JSON.stringify(pins)})`, req.params.slot);
    }
    broadcastBracket(tournamentId, bracket);
    res.json({ bracket });
  } catch (err) {
    next(err);
  }
});

// Clear the tournament's knockout results (unlocks group-match editing).
bracketRouter.post('/reset', requireAdmin, bracketMutationLimiter, async (req, res, next) => {
  try {
    const tournamentId = await requestTournamentId(req);
    const bracket = await resetBracket(tournamentId);
    broadcastBracket(tournamentId, bracket);
    res.json({ bracket });
  } catch (err) {
    next(err);
  }
});

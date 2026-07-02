import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin, requireAuth } from '../auth.js';
import { audit } from '../audit.js';
import { updateBracketSchema } from '../validation.js';
import { listBracket, resetBracket, updateBracketSlot } from '../services/bracket.js';
import { broadcastBracket } from '../socket.js';

/** /api/bracket — knockout view for any logged-in user; slot writes and the
 * full reset are admin-only and re-broadcast the resolved bracket. */
export const bracketRouter = Router();

const bracketMutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many bracket actions. Slow down.' } },
});

// Read: any logged-in user.
bracketRouter.get('/', requireAuth, (_req, res) => {
  res.json({ bracket: listBracket() });
});

// Write one slot's result and/or participant pins: admin only. The slot comes
// from the URL; override ids in the body are the one sanctioned way to place a
// team manually (validated in the service).
bracketRouter.patch('/:slot', requireAdmin, bracketMutationLimiter, (req, res, next) => {
  const parsed = updateBracketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const bracket = updateBracketSlot(req.params.slot, parsed.data);
    // Rewiring who plays is the highest-impact bracket write — leave a trace.
    if (parsed.data.homeOverrideId !== undefined || parsed.data.awayOverrideId !== undefined) {
      const pins = { home: parsed.data.homeOverrideId, away: parsed.data.awayOverrideId };
      audit(req.user!.id, `bracket.override(${JSON.stringify(pins)})`, req.params.slot);
    }
    broadcastBracket(bracket);
    res.json({ bracket });
  } catch (err) {
    next(err);
  }
});

// Clear all knockout results (unlocks group-match editing).
bracketRouter.post('/reset', requireAdmin, bracketMutationLimiter, (_req, res, next) => {
  try {
    const bracket = resetBracket();
    broadcastBracket(bracket);
    res.json({ bracket });
  } catch (err) {
    next(err);
  }
});

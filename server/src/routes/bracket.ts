import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin, requireAuth } from '../auth.js';
import { updateBracketSchema } from '../validation.js';
import { listBracket, resetBracket, updateBracketSlot } from '../service.js';
import { broadcastBracket } from '../socket.js';

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

// Write one slot's result: admin only. The slot comes from the URL; the body
// carries only scores/status/pens — never team ids.
bracketRouter.patch('/:slot', requireAdmin, bracketMutationLimiter, (req, res, next) => {
  const parsed = updateBracketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const bracket = updateBracketSlot(req.params.slot, parsed.data);
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

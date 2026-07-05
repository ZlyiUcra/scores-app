import rateLimit from 'express-rate-limit';
import { AppErrorCode } from '../../errors.js';

/** Extra brake on destructive admin actions (on top of per-endpoint authz).
 * Shared by every admin sub-router so the 60/min budget covers them all. */
export const adminMutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: AppErrorCode.RateLimited, message: 'Too many admin actions. Slow down.' } },
});

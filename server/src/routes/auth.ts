import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { AuthUser } from '../../../shared/types.js';
import { loginSchema, registerSchema } from '../validation.js';
import {
  clearAuthCookie,
  createUser,
  readUserFromCookies,
  setAuthCookie,
  signToken,
  verifyCredentials,
} from '../auth.js';

export const authRouter = Router();

// Throttle auth writes to blunt online password guessing & registration spam.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again shortly.' } },
});

const registerLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again shortly.' } },
});

/**
 * Lightweight CSRF guard for unauthenticated auth writes. `register` auto-logs
 * in (sets a cookie), so a cross-site forced POST is a login-CSRF vector.
 * Modern browsers send Sec-Fetch-Site; reject explicit cross-site requests.
 * Absent header (curl/older clients) is allowed so tooling still works.
 */
function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    res.status(403).json({ error: { code: 'CROSS_ORIGIN', message: 'Cross-origin request rejected.' } });
    return;
  }
  next();
}

/** Single session-issuing path shared by login and register. */
function issueSession(res: Response, user: AuthUser): void {
  setAuthCookie(res, signToken(user));
  res.json({ user });
}

authRouter.post('/login', sameOriginOnly, loginLimiter, async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid credentials payload.' } });
    return;
  }
  try {
    const user = await verifyCredentials(parsed.data.username, parsed.data.password);
    if (!user) {
      // Generic message — no user-enumeration.
      res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong username or password.' } });
      return;
    }
    issueSession(res, user);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/register', sameOriginOnly, registerLimiter, async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    // Surface the first field message so the form can guide the user.
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid input.' } });
    return;
  }
  try {
    // Role is forced to 'user' inside createUser — never taken from the body.
    const user = await createUser(parsed.data.username, parsed.data.password);
    issueSession(res, user); // auto-login through the exact same path as login
  } catch (err) {
    next(err); // AppError('USERNAME_TAKEN') -> 409 via the error middleware
  }
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const user = readUserFromCookies(req.cookies);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not logged in.' } });
    return;
  }
  res.json({ user });
});

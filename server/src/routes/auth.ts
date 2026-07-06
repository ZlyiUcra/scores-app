import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { AuthUser } from '../../../shared/types.js';
import { loginSchema, parseOrThrow, registerSchema } from '../validation.js';
import { AppError, AppErrorCode } from '../errors.js';
import {
  clearAuthCookie,
  createUser,
  readUserFromCookies,
  revokeSession,
  setAuthCookie,
  signToken,
  verifyCredentials,
} from '../auth.js';

/** /api/auth - login/register/logout/me. Sessions live in an httpOnly cookie;
 * registration always creates the read-only viewer role. */
export const authRouter = Router();

// Throttle auth writes to blunt online password guessing & registration spam.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: AppErrorCode.RateLimited, message: 'Too many attempts. Try again shortly.' } },
});

const registerLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: AppErrorCode.RateLimited, message: 'Too many attempts. Try again shortly.' } },
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
    throw new AppError(AppErrorCode.CrossOrigin, 'Cross-origin request rejected.', 403);
  }
  next();
}

/** Single session-issuing path shared by login and register. */
function issueSession(res: Response, user: AuthUser): void {
  setAuthCookie(res, signToken(user));
  res.json({ user });
}

authRouter.post('/login', sameOriginOnly, loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    // Generic message - bounds only, no field hint that would aid enumeration.
    if (!parsed.success) {
      throw new AppError(AppErrorCode.BadRequest, 'Invalid credentials payload.', 400);
    }
    const user = await verifyCredentials(parsed.data.username, parsed.data.password);
    if (!user) {
      // Generic message - no user-enumeration.
      throw new AppError(AppErrorCode.InvalidCredentials, 'Wrong username or password.', 401);
    }
    issueSession(res, user);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/register', sameOriginOnly, registerLimiter, async (req, res, next) => {
  try {
    // Surface the first field message so the form can guide the user.
    const parsed = parseOrThrow(registerSchema, req.body, 'Invalid input.');
    // Role is forced to 'user' inside createUser - never taken from the body.
    const user = await createUser(parsed.username, parsed.password);
    issueSession(res, user); // auto-login through the exact same path as login
  } catch (err) {
    next(err); // AppError(UsernameTaken) -> 409 via the error middleware
  }
});

authRouter.post('/logout', (req, res) => {
  revokeSession(req.cookies); // revoke the token server-side (per-token jti)
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res, next) => {
  try {
    const user = await readUserFromCookies(req.cookies);
    if (!user) {
      throw new AppError(AppErrorCode.Unauthenticated, 'Not logged in.', 401);
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

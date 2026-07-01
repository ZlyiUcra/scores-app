import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '../../shared/types.js';
import { config } from './config.js';
import { AppError } from './errors.js';
import { BCRYPT_COST, toPublic, userRepository } from './users.js';

// A valid bcrypt hash of a random value, used to keep the "unknown user" login
// path taking the same time as a real compare (anti user-enumeration).
const DUMMY_HASH = bcrypt.hashSync('unused-timing-defense', BCRYPT_COST);

export async function verifyCredentials(username: string, password: string): Promise<AuthUser | null> {
  const found = userRepository.findByUsername(username); // O(1) Map lookup
  // Always run a compare (even on unknown user) so timing doesn't reveal
  // whether the account exists.
  const hash = found?.passwordHash ?? DUMMY_HASH;
  const ok = await bcrypt.compare(password, hash);
  if (!found || !ok) return null;
  // Password is correct but the account was deactivated by an admin — block the
  // login itself (not just later requests) with a clear, non-generic message.
  if (!found.active) {
    throw new AppError('ACCOUNT_DISABLED', 'Your account has been deactivated. Contact an administrator.', 403);
  }
  return toPublic(found);
}

/** Create a self-registered account. Role is ALWAYS 'user' — never client input. */
export async function createUser(username: string, password: string): Promise<AuthUser> {
  // Hash BEFORE the repository's atomic check-and-insert, so the only `await`
  // sits outside the critical section and two concurrent registers can't race.
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const created = userRepository.create({ username, passwordHash, role: 'user' });
  return toPublic(created);
}

interface TokenClaims extends AuthUser {}

export function signToken(user: AuthUser): string {
  const claims: TokenClaims = { id: user.id, username: user.username, role: user.role };
  return jwt.sign(claims, config.jwtSecret, {
    algorithm: config.jwtAlgorithm,
    expiresIn: config.tokenTtlSeconds,
  });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    // Pin the algorithm to block alg=none / algorithm-confusion attacks.
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: [config.jwtAlgorithm],
    }) as jwt.JwtPayload & TokenClaims;
    if (!decoded.id || !decoded.username || !decoded.role) return null;
    return { id: decoded.id, username: decoded.username, role: decoded.role };
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true, // JS can't read it -> XSS can't steal the token
    sameSite: 'strict', // blunts CSRF on state-changing endpoints
    secure: config.isProd, // HTTPS-only in production
    maxAge: config.tokenTtlSeconds * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(config.cookieName, { path: '/' });
}

// ---- Express middleware ----

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Resolve the CURRENT user from the cookie. Critically, we don't trust the
 * token's claims for role/active — we re-load the user from the store on every
 * request. That way deactivating, deleting, or demoting a user takes effect
 * immediately, even though their JWT is still cryptographically valid.
 */
export function readUserFromCookies(cookies: Record<string, string> | undefined): AuthUser | null {
  const token = cookies?.[config.cookieName];
  if (!token) return null;
  const claims = verifyToken(token);
  if (!claims) return null;
  const fresh = userRepository.getById(claims.id);
  if (!fresh || !fresh.active) return null; // deleted or deactivated -> revoked
  return toPublic(fresh); // role reflects the store, not the (possibly stale) token
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = readUserFromCookies(req.cookies);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required.' } });
    return;
  }
  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user ?? readUserFromCookies(req.cookies);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required.' } });
    return;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin role required.' } });
    return;
  }
  req.user = user;
  next();
}

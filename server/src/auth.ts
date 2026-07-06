import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import cookie from 'cookie';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '../../shared/types.js';
import { config } from './config.js';
import { AppError, AppErrorCode } from './errors.js';
import { userRepository } from './storage/index.js';
import { toPublicUser } from './storage/mapping.js';
import { withMutationLock } from './services/mutationLock.js';

// A valid bcrypt hash of a random value, used to keep the "unknown user" login
// path taking the same time as a real compare (anti user-enumeration).
const DUMMY_HASH = bcrypt.hashSync('unused-timing-defense', config.bcryptCost);

/**
 * Check a username/password pair. Returns the public user on success, null on
 * a wrong username OR password (indistinguishable on purpose), and throws
 * ACCOUNT_DISABLED when the password is right but an admin deactivated the
 * account. Timing-safe against user enumeration (see DUMMY_HASH).
 */
export async function verifyCredentials(username: string, password: string): Promise<AuthUser | null> {
  const found = await userRepository.findByUsername(username);
  // Always run a compare (even on unknown user) so timing doesn't reveal
  // whether the account exists.
  const hash = found?.passwordHash ?? DUMMY_HASH;
  const ok = await bcrypt.compare(password, hash);
  if (!found || !ok) return null;
  // Password is correct but the account was deactivated by an admin - block the
  // login itself (not just later requests) with a clear, non-generic message.
  if (!found.active) {
    throw new AppError(AppErrorCode.AccountDisabled, 'Your account has been deactivated. Contact an administrator.', 403);
  }
  return toPublicUser(found);
}

/** Create a self-registered account. Role is ALWAYS 'user' - never client input.
 * Uniqueness and the global cap are checked INSIDE the mutation lock (the same
 * queue as every other write), so two concurrent registers cannot race them;
 * the password is hashed BEFORE entering so the lock is never held across
 * bcrypt work. */
export async function createUser(username: string, password: string): Promise<AuthUser> {
  const passwordHash = await bcrypt.hash(password, config.bcryptCost);
  return withMutationLock(async () => {
    if (await userRepository.findByUsername(username)) {
      throw new AppError(AppErrorCode.UsernameTaken, 'This username is already taken.', 409);
    }
    if ((await userRepository.count()) >= config.maxUsers) {
      throw new AppError(AppErrorCode.UserLimit, 'Registration is temporarily closed.', 503);
    }
    const created = await userRepository.create({ username, passwordHash, role: 'user' });
    return toPublicUser(created);
  });
}

/** What goes inside the JWT: identity only. Role/active are RE-CHECKED against
 * the store on every request (see readUserFromCookies), never trusted from here. */
interface TokenClaims extends AuthUser {}

/** Sign a short-lived (8h) JWT for the user (pinned HS256). Each token gets a
 * unique jti so an explicit logout can revoke just this token without touching
 * other sessions of the same account (see revokeSession). */
export function signToken(user: AuthUser): string {
  const claims: TokenClaims = { id: user.id, username: user.username, role: user.role };
  return jwt.sign(claims, config.jwtSecret, {
    algorithm: config.jwtAlgorithm,
    expiresIn: config.tokenTtlSeconds,
    jwtid: randomUUID(), // per-token id -> the logout denylist key
  });
}

/** Verified JWT payload - the identity claims plus `jti` (per-token revocation
 * key, set by signToken) and `exp`, both added by jsonwebtoken. */
type VerifiedToken = TokenClaims & { jti?: string; exp?: number };

/** Verify a JWT and return its payload. null on ANY failure (expired, tampered,
 * malformed, wrong algorithm) - callers treat null as "not logged in". */
function decodeVerified(token: string): VerifiedToken | null {
  try {
    // Pin the algorithm to block alg=none / algorithm-confusion attacks.
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: [config.jwtAlgorithm],
    }) as jwt.JwtPayload & VerifiedToken;
    if (!decoded.id || !decoded.username || !decoded.role) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Verify a JWT and extract its identity claims. Returns null on ANY failure. */
export function verifyToken(token: string): AuthUser | null {
  const decoded = decodeVerified(token);
  if (!decoded) return null;
  return { id: decoded.id, username: decoded.username, role: decoded.role };
}

// ---- Per-token revocation (logout) ----

// In-memory revoked-token set: jti -> exp (epoch seconds). An explicit logout
// puts the token's jti here so it stops authenticating even though it is still
// cryptographically valid until its 8h TTL. IN-MEMORY ONLY: a server restart
// empties the set, so a logged-out token is valid again until it expires - the
// agreed tradeoff for a single local instance. Only THIS token is revoked, so
// two sessions sharing one login stay independent (one logout does not kick the
// other). Expired entries are harmless (jwt.verify rejects them before this
// check) but are purged on each write to bound growth.
const revokedTokens = new Map<string, number>();

function revokeToken(jti: string, exp: number): void {
  revokedTokens.set(jti, exp);
  const now = Math.floor(Date.now() / 1000);
  for (const [k, v] of revokedTokens) if (v <= now) revokedTokens.delete(k);
}

function isRevoked(jti: string): boolean {
  return revokedTokens.has(jti);
}

/** Attach the session JWT as an httpOnly cookie (the ONLY place the token
 * lives - clients never see it, so XSS cannot exfiltrate a session). */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true, // JS can't read it -> XSS can't steal the token
    sameSite: 'strict', // blunts CSRF on state-changing endpoints
    secure: config.isProd, // HTTPS-only in production
    maxAge: config.tokenTtlSeconds * 1000,
    path: '/',
  });
}

/** Logout: drop the session cookie. The JWT itself simply expires later. */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(config.cookieName, { path: '/' });
}

/** Logout (server-side half): revoke the token in the cookie by its jti so it
 * stops authenticating before its TTL. Pair with clearAuthCookie. No-op when
 * there is no cookie or the token is already invalid/expired (e.g. a token
 * minted before jti was added). */
export function revokeSession(cookies: Record<string, string> | undefined): void {
  const token = cookies?.[config.cookieName];
  if (!token) return;
  const claims = decodeVerified(token);
  if (claims?.jti && claims.exp) revokeToken(claims.jti, claims.exp);
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
 * token's claims for role/active - we re-load the user from the store on every
 * request. That way deactivating, deleting, or demoting a user takes effect
 * immediately, even though their JWT is still cryptographically valid.
 */
export async function readUserFromCookies(cookies: Record<string, string> | undefined): Promise<AuthUser | null> {
  const token = cookies?.[config.cookieName];
  if (!token) return null;
  const claims = decodeVerified(token);
  if (!claims) return null;
  if (claims.jti && isRevoked(claims.jti)) return null; // explicitly logged out -> revoked
  const fresh = await userRepository.getById(claims.id);
  if (!fresh || !fresh.active) return null; // deleted or deactivated -> revoked
  return toPublicUser(fresh); // role reflects the store, not the (possibly stale) token
}

/** Same resolution from a raw Cookie header - the socket handshake path. */
export async function readUserFromCookieHeader(header: string | undefined): Promise<AuthUser | null> {
  if (!header) return null;
  return readUserFromCookies(cookie.parse(header));
}

/** Middleware: any logged-in, active user. Populates req.user or answers 401.
 * Express 4 does NOT route rejected promises to the error middleware - every
 * await here stays inside the try, and failures go through next(err). */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await readUserFromCookies(req.cookies);
    if (!user) {
      throw new AppError(AppErrorCode.Unauthenticated, 'Login required.', 401);
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Middleware: admin role required - THE server-side gate for every mutation
 * under /api/admin (and any route that mounts it). 401 unauthenticated, 403
 * for a non-admin. Role comes from the store, not the token. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user ?? (await readUserFromCookies(req.cookies));
    if (!user) {
      throw new AppError(AppErrorCode.Unauthenticated, 'Login required.', 401);
    }
    if (user.role !== 'admin') {
      throw new AppError(AppErrorCode.Forbidden, 'Admin role required.', 403);
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isProd = NODE_ENV === 'production';

function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  // Security board rule: never ship an insecure default in production.
  if (isProd) {
    throw new Error(
      'JWT_SECRET must be set (>= 16 chars) in production. Refusing to start.',
    );
  }
  // Dev convenience: random per-boot secret. Tokens invalidate on restart,
  // which is fine locally and avoids a committed default.
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET not set - using a random dev secret.');
  return generated;
}

function resolveAdminPassword(): string {
  const fromEnv = process.env.ADMIN_PASSWORD?.trim();
  // >= 8 mirrors registerSchema's password rule - a trivially short admin
  // password is one dictionary run away from full /api/admin.
  if (fromEnv && fromEnv.length >= 8) return fromEnv;

  // Same rule as JWT_SECRET: a wiped/fresh production database reseeds the
  // admin account, so the well-known dev password must never reach prod.
  if (isProd) {
    throw new Error(
      'ADMIN_PASSWORD must be set (>= 8 chars) in production. Refusing to start.',
    );
  }
  return 'admin123';
}

function resolveViewerPassword(): string {
  const fromEnv = process.env.VIEWER_PASSWORD?.trim();
  // >= 8 mirrors registerSchema's password rule; bcrypt truncates at 72 bytes
  // anyway, so a trivially short value is the real risk here.
  if (fromEnv && fromEnv.length >= 8) return fromEnv;

  // Same rule as ADMIN_PASSWORD, and for a sharper reason: there is no
  // password-change endpoint at all, so the seed is the ONLY point where the
  // viewer password can ever be set - a role promotion keeps it forever.
  if (isProd) {
    throw new Error(
      'VIEWER_PASSWORD must be set (>= 8 chars) in production. Refusing to start.',
    );
  }
  return 'viewer123';
}

function resolveDataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  if (fromEnv) return fromEnv;

  // A prod boot with no explicit DATA_DIR defaults under the app's own
  // directory, which is exactly the shape that silently loses everything on
  // an ephemeral-filesystem redeploy - require it explicitly, like the other
  // production secrets.
  if (isProd) {
    throw new Error(
      'DATA_DIR must be set in production. Refusing to start.',
    );
  }
  return path.join(__dirname, '..', 'data');
}

function resolveMaxUsers(): number {
  const fromEnv = process.env.MAX_USERS?.trim();
  if (!fromEnv) return 500;

  const parsed = Number(fromEnv);
  // A malformed cap would silently disable or invert the guard, so fall back
  // to the safe default instead of trusting a bad value.
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.warn(`[config] MAX_USERS="${fromEnv}" is not a positive integer - using 500.`);
    return 500;
  }
  return parsed;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** All environment-derived settings, resolved once at boot. */
export const config = {
  nodeEnv: NODE_ENV,
  isProd,
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: resolveJwtSecret(),
  jwtAlgorithm: 'HS256' as const,
  tokenTtlSeconds: 60 * 60 * 8, // 8h
  cookieName: 'scores_token',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  /** Where the storage driver keeps its files - overridable so a host with a
   * persistent disk can point it at the mount. Required in production: a
   * default relative to the app directory is exactly the shape that loses
   * everything on an ephemeral-filesystem redeploy. */
  dataDir: resolveDataDir(),
  /** Cost for every bcrypt hash (auth + seeded accounts). */
  bcryptCost: 12,
  /** Global account cap - blunts registration flooding. Override via MAX_USERS
   * to size it to the real event (defaults to 500). */
  maxUsers: resolveMaxUsers(),
  /** Password of the seeded admin (first boot / empty users table only).
   * Required in production; dev falls back to the well-known default. */
  adminPassword: resolveAdminPassword(),
  /** Password of the seeded viewer. Consumed on first boot / empty users
   * table only - NOT a rotation mechanism: changing the env on a live
   * database is a no-op. Required in production; dev falls back to the
   * well-known default. */
  viewerPassword: resolveViewerPassword(),
};

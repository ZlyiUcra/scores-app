import crypto from 'node:crypto';

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
  console.warn('[config] JWT_SECRET not set — using a random dev secret.');
  return generated;
}

export const config = {
  nodeEnv: NODE_ENV,
  isProd,
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: resolveJwtSecret(),
  jwtAlgorithm: 'HS256' as const,
  tokenTtlSeconds: 60 * 60 * 8, // 8h
  cookieName: 'scores_token',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
};

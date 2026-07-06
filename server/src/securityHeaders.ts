import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

// Content-Security-Policy for the SPA (the built client is served only in prod,
// so that is where it bites). Tuned to this app: no inline scripts - Vite emits
// a single same-origin module bundle with no modulepreload polyfill - and no web
// fonts; the only inline styling is a few dynamic `style={{}}` grid positions in
// the bracket (computed values, so not hashable), hence `style-src 'unsafe-inline'`.
// `connect-src 'self'` covers same-origin REST + the Socket.IO WebSocket.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Defense-in-depth security response headers, applied to every response
 * (routes, errors, the SPA shell and its static assets alike).
 *
 * Strict-Transport-Security is emitted only in production: dev runs on plain
 * http://localhost, and pinning it to HTTPS would break the dev server.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', contentSecurityPolicy);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

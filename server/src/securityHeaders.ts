import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

/**
 * Defense-in-depth security response headers, applied to every response
 * (routes, errors, the SPA shell and its static assets alike). No
 * Content-Security-Policy here - that needs a build-tested policy (Vite's
 * inline modulepreload script + a few inline styles), tracked separately.
 *
 * Strict-Transport-Security is emitted only in production: dev runs on plain
 * http://localhost, and pinning it to HTTPS would break the dev server.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
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

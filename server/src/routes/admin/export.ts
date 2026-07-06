import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AppErrorCode } from '../../errors.js';
import { buildTournamentExport } from '../../services/export.js';

/** Admin data export: a full single-tournament JSON snapshot for download
 * (doubles as a manual backup). Mounted under /api/admin (auth applied in the
 * parent). A pure read - no writes, no audit - so a cookie-authed cross-site
 * GET cannot be turned into a side effect. */
export const adminExportRouter = Router();

// Export is a full-tournament data egress on a GET, so the per-mutation limiter
// (POST/PATCH/DELETE only) does not cover it - give it its own, tighter brake
// against a hammering or compromised admin exhausting memory on repeated dumps.
const exportLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: AppErrorCode.RateLimited, message: 'Too many exports. Slow down.' } },
});

adminExportRouter.get('/tournaments/:id/export', exportLimiter, async (req, res, next) => {
  try {
    const data = await buildTournamentExport(req.params.id); // NOT_FOUND (404) on unknown id
    // Filename from the STORED id (a server-minted uuid), never the raw name or
    // URL param, so nothing user-controlled reaches the header (no response
    // splitting / filename injection). Ids are ASCII uuids.
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tournament-${data.tournament.id}.json"`);
    res.setHeader('Cache-Control', 'no-store'); // PII payload behind cookie auth - keep it out of caches
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    next(err);
  }
});

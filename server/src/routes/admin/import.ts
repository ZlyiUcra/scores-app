import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AppErrorCode } from '../../errors.js';
import { parseOrThrow, tournamentExportSchema } from '../../validation.js';
import { importTournament } from '../../services/import.js';
import { audit } from '../../audit.js';

/** Admin tournament restore from an export file (disaster recovery / moving a
 * tournament between environments). Mounted under /api/admin (auth applied in
 * the parent); the larger body limit for this one route is wired in index.ts,
 * ahead of the global 16 KB json parser. */
export const adminImportRouter = Router();

// Import is the single largest mutation in the system (a whole tournament's
// worth of writes per call) - its own tight brake, modeled on exportLimiter,
// on top of (not instead of) whatever broader admin-mutation budget applies.
const importLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: AppErrorCode.RateLimited, message: 'Too many imports. Slow down.' } },
});

adminImportRouter.post('/tournaments/import', importLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(tournamentExportSchema, req.body, 'Invalid import file.');
    const { tournament, counts } = await importTournament(parsed);
    audit(
      req.user!,
      `tournament.import(schemaVersion=${parsed.schemaVersion},exportedAt=${parsed.exportedAt},` +
        `groups=${counts.groups},teams=${counts.teams},players=${counts.players},matches=${counts.matches},` +
        `bracket=${counts.bracket})`,
      tournament.id,
    );
    res.status(201).json({ tournament });
  } catch (err) {
    next(err);
  }
});

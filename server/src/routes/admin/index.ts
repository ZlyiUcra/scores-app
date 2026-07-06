import { Router } from 'express';
import { requireAdmin } from '../../auth.js';
import { adminUsersRouter } from './users.js';
import { adminTournamentsRouter } from './tournaments.js';
import { adminRosterRouter } from './roster.js';
import { adminPlayersRouter } from './players.js';
import { adminMatchesRouter } from './matches.js';
import { adminAuditRouter } from './audit.js';
import { adminExportRouter } from './export.js';

/** Everything under /api/admin, composed from the per-domain sub-routers. */
export const adminRouter = Router();

// The admin trust boundary is applied ONCE here - every sub-router below is
// admin-only, so no route can accidentally ship unguarded.
adminRouter.use(requireAdmin);

// Sub-routers keep their full paths (e.g. '/teams/:id/players' lives in
// players.ts by domain, not by URL prefix), so mounting is order-agnostic.
adminRouter.use(adminUsersRouter);
adminRouter.use(adminTournamentsRouter);
adminRouter.use(adminRosterRouter);
adminRouter.use(adminPlayersRouter);
adminRouter.use(adminMatchesRouter);
adminRouter.use(adminAuditRouter);
adminRouter.use(adminExportRouter);

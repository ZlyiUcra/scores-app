import { Router } from 'express';
import { listAudit } from '../../audit.js';

/** Admin audit-trail viewer: the most recent admin actions, newest first. */
export const adminAuditRouter = Router();

adminAuditRouter.get('/audit', async (_req, res, next) => {
  try {
    res.json({ entries: await listAudit() });
  } catch (err) {
    next(err);
  }
});

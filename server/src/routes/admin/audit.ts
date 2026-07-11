import { Router } from 'express';
import { listAuditQuerySchema, parseOrThrow } from '../../validation.js';
import { listAudit } from '../../audit.js';

/** Admin audit-trail viewer: paginated admin actions, newest first. */
export const adminAuditRouter = Router();

adminAuditRouter.get('/audit', async (req, res, next) => {
  try {
    const { page, pageSize } = parseOrThrow(listAuditQuerySchema, req.query, 'Invalid query.');
    res.json(await listAudit(page, pageSize));
  } catch (err) {
    next(err);
  }
});

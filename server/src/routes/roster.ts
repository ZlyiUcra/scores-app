import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getRoster } from '../services/roster.js';

export const rosterRouter = Router();

// Groups + teams (with membership). Any logged-in user; drives client standings.
rosterRouter.get('/', requireAuth, (_req, res) => {
  res.json({ roster: getRoster() });
});

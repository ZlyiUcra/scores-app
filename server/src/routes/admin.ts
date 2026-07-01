import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../auth.js';
import {
  createMatchSchema,
  createTeamSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from '../validation.js';
import { deleteUser, listUsers, updateUser } from '../adminService.js';
import { createMatch, createTeam, listTeams, removeMatch, removeTeam } from '../service.js';
import { broadcastMatchCreated, broadcastMatchRemoved, disconnectUser } from '../socket.js';

export const adminRouter = Router();

// The admin trust boundary is applied ONCE here — every route below is
// admin-only, so no route can accidentally ship unguarded.
adminRouter.use(requireAdmin);

// Extra brake on destructive admin actions (on top of per-endpoint authz).
const adminMutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many admin actions. Slow down.' } },
});

/** Minimal audit trail. A file/DB-backed log is a documented fast-follow. */
function audit(actor: string, action: string, target: string): void {
  console.log(`[audit] ${new Date().toISOString()} actor=${actor} action=${action} target=${target}`);
}

// ---- Users ----

adminRouter.get('/users', (req, res) => {
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid query.' } });
    return;
  }
  res.json(listUsers(parsed.data));
});

adminRouter.patch('/users/:id', adminMutationLimiter, (req, res, next) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const actor = req.user!.id;
    const view = updateUser(req.params.id, actor, parsed.data);
    // Revocation: if we just deactivated them, cut their live sockets now.
    if (parsed.data.active === false) disconnectUser(req.params.id);
    audit(actor, `user.update(${JSON.stringify(parsed.data)})`, req.params.id);
    res.json({ user: view });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/users/:id', adminMutationLimiter, (req, res, next) => {
  try {
    const actor = req.user!.id;
    deleteUser(req.params.id, actor);
    disconnectUser(req.params.id); // revoke live sockets of the deleted user
    audit(actor, 'user.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Teams ----

adminRouter.get('/teams', (_req, res) => {
  res.json({ teams: listTeams() });
});

adminRouter.post('/teams', adminMutationLimiter, (req, res, next) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const team = createTeam(parsed.data);
    audit(req.user!.id, 'team.create', team.id);
    res.status(201).json({ team });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/teams/:id', adminMutationLimiter, (req, res, next) => {
  try {
    removeTeam(req.params.id); // 409 if referenced by a match
    audit(req.user!.id, 'team.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Matches (admin create/delete; score edits stay on /api/matches) ----

adminRouter.post('/matches', adminMutationLimiter, (req, res, next) => {
  const parsed = createMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const match = createMatch(parsed.data);
    broadcastMatchCreated(match); // appears live for everyone
    audit(req.user!.id, 'match.create', match.id);
    res.status(201).json({ match });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/matches/:id', adminMutationLimiter, (req, res, next) => {
  try {
    removeMatch(req.params.id);
    broadcastMatchRemoved(req.params.id);
    audit(req.user!.id, 'match.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

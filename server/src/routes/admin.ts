import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../auth.js';
import {
  assignTeamSchema,
  createGroupSchema,
  createMatchSchema,
  createPlayerSchema,
  createTeamSchema,
  listUsersQuerySchema,
  updatePlayerSchema,
  updateTeamSchema,
  updateUserSchema,
} from '../validation.js';
import { audit } from '../audit.js';
import { deleteUser, listUsers, updateUser } from '../services/admin.js';
import { createMatch, generateGroupFixtures, listMatches, removeMatch } from '../services/matches.js';
import {
  assignTeam,
  createGroup,
  createTeam,
  getRoster,
  listGroups,
  listTeams,
  removeGroup,
  removeTeam,
  updateGroup,
  updateTeam,
} from '../services/roster.js';
import { createPlayer, removePlayer, updatePlayer } from '../services/players.js';
import { listBracket } from '../services/bracket.js';
import {
  broadcastBracket,
  broadcastMatchCreated,
  broadcastMatchRemoved,
  broadcastMatchSnapshot,
  broadcastRoster,
  disconnectUser,
} from '../socket.js';

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

// ---- Groups ----

adminRouter.get('/groups', (_req, res) => {
  res.json({ groups: listGroups() });
});

adminRouter.post('/groups', adminMutationLimiter, (req, res, next) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const group = createGroup(parsed.data.name);
    broadcastRoster(getRoster());
    broadcastBracket(listBracket());
    audit(req.user!.id, 'group.create', group.id);
    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
});

// Rename a group (reuses the create-group body shape: just { name }).
adminRouter.patch('/groups/:id', adminMutationLimiter, (req, res, next) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const group = updateGroup(req.params.id, parsed.data.name);
    broadcastRoster(getRoster()); // group name shows in standings + match rows
    audit(req.user!.id, 'group.update', req.params.id);
    res.json({ group });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/groups/:id', adminMutationLimiter, (req, res, next) => {
  try {
    removeGroup(req.params.id); // 409 if it still has teams / bracket started
    broadcastRoster(getRoster());
    broadcastBracket(listBracket());
    audit(req.user!.id, 'group.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Generate the group's missing round-robin fixtures (idempotent top-up).
adminRouter.post('/groups/:id/fixtures', adminMutationLimiter, (req, res, next) => {
  try {
    const created = generateGroupFixtures(req.params.id);
    broadcastMatchSnapshot(listMatches()); // batch create -> one snapshot
    audit(req.user!.id, `group.fixtures(created=${created.length})`, req.params.id);
    res.json({ matches: created });
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
    broadcastRoster(getRoster());
    audit(req.user!.id, 'team.create', team.id);
    res.status(201).json({ team });
  } catch (err) {
    next(err);
  }
});

// Rename a team (name and/or code).
adminRouter.patch('/teams/:id', adminMutationLimiter, (req, res, next) => {
  const parsed = updateTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const team = updateTeam(req.params.id, parsed.data);
    broadcastRoster(getRoster()); // standings names
    broadcastMatchSnapshot(listMatches()); // names embedded in match DTOs
    broadcastBracket(listBracket()); // names embedded in resolved bracket
    audit(req.user!.id, `team.update(${JSON.stringify(parsed.data)})`, req.params.id);
    res.json({ team });
  } catch (err) {
    next(err);
  }
});

// Add/move a team to a group, or remove it from its group (groupId: null).
adminRouter.patch('/teams/:id/group', adminMutationLimiter, (req, res, next) => {
  const parsed = assignTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const team = assignTeam(req.params.id, parsed.data);
    broadcastRoster(getRoster());
    broadcastBracket(listBracket()); // membership changes bracket seeding/size
    audit(req.user!.id, `team.assign(${JSON.stringify(parsed.data)})`, req.params.id);
    res.json({ team });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/teams/:id', adminMutationLimiter, (req, res, next) => {
  try {
    removeTeam(req.params.id); // 409 if referenced by a match / bracket started
    broadcastRoster(getRoster());
    broadcastBracket(listBracket());
    audit(req.user!.id, 'team.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Players (squads) ----

// Add a player to a team. The team comes from the URL, never the body.
adminRouter.post('/teams/:id/players', adminMutationLimiter, (req, res, next) => {
  const parsed = createPlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const player = createPlayer(req.params.id, parsed.data);
    broadcastRoster(getRoster()); // squads ride the roster snapshot
    audit(req.user!.id, 'player.create', player.id);
    res.status(201).json({ player });
  } catch (err) {
    next(err);
  }
});

// Edit a player (name/number/position). Team is not editable — delete + re-add.
adminRouter.patch('/players/:id', adminMutationLimiter, (req, res, next) => {
  const parsed = updatePlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const player = updatePlayer(req.params.id, parsed.data);
    broadcastRoster(getRoster());
    audit(req.user!.id, `player.update(${JSON.stringify(parsed.data)})`, req.params.id);
    res.json({ player });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/players/:id', adminMutationLimiter, (req, res, next) => {
  try {
    removePlayer(req.params.id);
    broadcastRoster(getRoster());
    audit(req.user!.id, 'player.delete', req.params.id);
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
    broadcastBracket(listBracket()); // a new group match can change seeding
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
    broadcastBracket(listBracket());
    audit(req.user!.id, 'match.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

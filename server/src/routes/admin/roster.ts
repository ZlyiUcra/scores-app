import { Router } from 'express';
import { assignTeamSchema, createGroupSchema, createTeamSchema, updateTeamSchema } from '../../validation.js';
import { audit } from '../../audit.js';
import { generateGroupFixtures, listMatches } from '../../services/matches.js';
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
} from '../../services/roster.js';
import { listBracket } from '../../services/bracket.js';
import { broadcastBracket, broadcastMatchSnapshot, broadcastRoster } from '../../socket.js';
import { adminMutationLimiter } from './mutationLimiter.js';

/** Admin roster management: groups, teams and group membership — the entities
 * bracket seeding is derived from, hence the bracket rebroadcasts.
 * Mounted under /api/admin (auth applied once in the parent router). */
export const adminRosterRouter = Router();

// ---- Groups ----

adminRosterRouter.get('/groups', (_req, res) => {
  res.json({ groups: listGroups() });
});

adminRosterRouter.post('/groups', adminMutationLimiter, (req, res, next) => {
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
adminRosterRouter.patch('/groups/:id', adminMutationLimiter, (req, res, next) => {
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

adminRosterRouter.delete('/groups/:id', adminMutationLimiter, (req, res, next) => {
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
adminRosterRouter.post('/groups/:id/fixtures', adminMutationLimiter, (req, res, next) => {
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

adminRosterRouter.get('/teams', (_req, res) => {
  res.json({ teams: listTeams() });
});

adminRosterRouter.post('/teams', adminMutationLimiter, (req, res, next) => {
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
adminRosterRouter.patch('/teams/:id', adminMutationLimiter, (req, res, next) => {
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
adminRosterRouter.patch('/teams/:id/group', adminMutationLimiter, (req, res, next) => {
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

adminRosterRouter.delete('/teams/:id', adminMutationLimiter, (req, res, next) => {
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

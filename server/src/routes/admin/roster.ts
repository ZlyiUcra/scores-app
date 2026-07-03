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
import { requestTournamentId } from '../scope.js';
import { adminMutationLimiter } from './mutationLimiter.js';

/** Admin roster management: groups, teams and group membership — the entities
 * bracket seeding is derived from, hence the bracket rebroadcasts. Creations
 * and listings are tournament-scoped (`?tournamentId=`, default fallback);
 * id-addressed mutations derive the tournament from the entity so broadcasts
 * always land in the right room. Mounted under /api/admin (auth in parent). */
export const adminRosterRouter = Router();

// ---- Groups ----

adminRosterRouter.get('/groups', (req, res, next) => {
  try {
    res.json({ groups: listGroups(requestTournamentId(req)) });
  } catch (err) {
    next(err);
  }
});

adminRosterRouter.post('/groups', adminMutationLimiter, (req, res, next) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const tournamentId = requestTournamentId(req);
    const group = createGroup(tournamentId, parsed.data.name);
    broadcastRoster(tournamentId, getRoster(tournamentId));
    broadcastBracket(tournamentId, listBracket(tournamentId));
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
    const { group, tournamentId } = updateGroup(req.params.id, parsed.data.name);
    broadcastRoster(tournamentId, getRoster(tournamentId)); // group name shows in standings + match rows
    audit(req.user!.id, 'group.update', req.params.id);
    res.json({ group });
  } catch (err) {
    next(err);
  }
});

adminRosterRouter.delete('/groups/:id', adminMutationLimiter, (req, res, next) => {
  try {
    const tournamentId = removeGroup(req.params.id); // 409 if it still has teams / bracket started
    broadcastRoster(tournamentId, getRoster(tournamentId));
    broadcastBracket(tournamentId, listBracket(tournamentId));
    audit(req.user!.id, 'group.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Generate the group's missing round-robin fixtures (idempotent top-up).
adminRosterRouter.post('/groups/:id/fixtures', adminMutationLimiter, (req, res, next) => {
  try {
    const { matches: created, tournamentId } = generateGroupFixtures(req.params.id);
    broadcastMatchSnapshot(tournamentId, listMatches(tournamentId)); // batch create -> one snapshot
    audit(req.user!.id, `group.fixtures(created=${created.length})`, req.params.id);
    res.json({ matches: created });
  } catch (err) {
    next(err);
  }
});

// ---- Teams ----

adminRosterRouter.get('/teams', (req, res, next) => {
  try {
    res.json({ teams: listTeams(requestTournamentId(req)) });
  } catch (err) {
    next(err);
  }
});

adminRosterRouter.post('/teams', adminMutationLimiter, (req, res, next) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const tournamentId = requestTournamentId(req);
    const team = createTeam(tournamentId, parsed.data);
    broadcastRoster(tournamentId, getRoster(tournamentId));
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
    const { team, tournamentId } = updateTeam(req.params.id, parsed.data);
    broadcastRoster(tournamentId, getRoster(tournamentId)); // standings names
    broadcastMatchSnapshot(tournamentId, listMatches(tournamentId)); // names embedded in match DTOs
    broadcastBracket(tournamentId, listBracket(tournamentId)); // names embedded in resolved bracket
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
    const { team, tournamentId } = assignTeam(req.params.id, parsed.data);
    broadcastRoster(tournamentId, getRoster(tournamentId));
    broadcastBracket(tournamentId, listBracket(tournamentId)); // membership changes bracket seeding/size
    audit(req.user!.id, `team.assign(${JSON.stringify(parsed.data)})`, req.params.id);
    res.json({ team });
  } catch (err) {
    next(err);
  }
});

adminRosterRouter.delete('/teams/:id', adminMutationLimiter, (req, res, next) => {
  try {
    const tournamentId = removeTeam(req.params.id); // 409 if referenced by a match / bracket started
    broadcastRoster(tournamentId, getRoster(tournamentId));
    broadcastBracket(tournamentId, listBracket(tournamentId));
    audit(req.user!.id, 'team.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

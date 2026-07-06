import { Router } from 'express';
import { assignTeamSchema, createGroupSchema, createTeamSchema, parseOrThrow, updateTeamSchema } from '../../validation.js';
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

/** Admin roster management: groups, teams and group membership - the entities
 * bracket seeding is derived from, hence the bracket rebroadcasts. Creations
 * and listings are tournament-scoped (`?tournamentId=`, default fallback);
 * id-addressed mutations derive the tournament from the entity so broadcasts
 * always land in the right room. Broadcast payloads are recomputed AFTER the
 * awaited service call - outside the mutation lock, deliberately.
 * Mounted under /api/admin (auth in parent). */
export const adminRosterRouter = Router();

// ---- Groups ----

adminRosterRouter.get('/groups', async (req, res, next) => {
  try {
    res.json({ groups: await listGroups(await requestTournamentId(req)) });
  } catch (err) {
    next(err);
  }
});

adminRosterRouter.post('/groups', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(createGroupSchema, req.body, 'Invalid body.');
    const tournamentId = await requestTournamentId(req);
    const group = await createGroup(tournamentId, parsed.name);
    broadcastRoster(tournamentId, await getRoster(tournamentId));
    broadcastBracket(tournamentId, await listBracket(tournamentId));
    audit(req.user!, 'group.create', group.id);
    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
});

// Rename a group (reuses the create-group body shape: just { name }).
adminRosterRouter.patch('/groups/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(createGroupSchema, req.body, 'Invalid body.');
    const { group, tournamentId } = await updateGroup(req.params.id, parsed.name);
    broadcastRoster(tournamentId, await getRoster(tournamentId)); // group name shows in standings + match rows
    audit(req.user!, 'group.update', req.params.id);
    res.json({ group });
  } catch (err) {
    next(err);
  }
});

adminRosterRouter.delete('/groups/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    const tournamentId = await removeGroup(req.params.id); // 409 if it still has teams / bracket started
    broadcastRoster(tournamentId, await getRoster(tournamentId));
    broadcastBracket(tournamentId, await listBracket(tournamentId));
    audit(req.user!, 'group.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Generate the group's missing round-robin fixtures (idempotent top-up).
adminRosterRouter.post('/groups/:id/fixtures', adminMutationLimiter, async (req, res, next) => {
  try {
    const { matches: created, tournamentId } = await generateGroupFixtures(req.params.id);
    broadcastMatchSnapshot(tournamentId, await listMatches(tournamentId)); // batch create -> one snapshot
    audit(req.user!, `group.fixtures(created=${created.length})`, req.params.id);
    res.json({ matches: created });
  } catch (err) {
    next(err);
  }
});

// ---- Teams ----

adminRosterRouter.get('/teams', async (req, res, next) => {
  try {
    res.json({ teams: await listTeams(await requestTournamentId(req)) });
  } catch (err) {
    next(err);
  }
});

adminRosterRouter.post('/teams', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(createTeamSchema, req.body, 'Invalid body.');
    const tournamentId = await requestTournamentId(req);
    const team = await createTeam(tournamentId, parsed);
    broadcastRoster(tournamentId, await getRoster(tournamentId));
    audit(req.user!, 'team.create', team.id);
    res.status(201).json({ team });
  } catch (err) {
    next(err);
  }
});

// Rename a team (name and/or code).
adminRosterRouter.patch('/teams/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(updateTeamSchema, req.body, 'Invalid body.');
    const { team, tournamentId } = await updateTeam(req.params.id, parsed);
    broadcastRoster(tournamentId, await getRoster(tournamentId)); // standings names
    broadcastMatchSnapshot(tournamentId, await listMatches(tournamentId)); // names embedded in match DTOs
    broadcastBracket(tournamentId, await listBracket(tournamentId)); // names embedded in resolved bracket
    audit(req.user!, `team.update(${JSON.stringify(parsed)})`, req.params.id);
    res.json({ team });
  } catch (err) {
    next(err);
  }
});

// Add/move a team to a group, or remove it from its group (groupId: null).
adminRosterRouter.patch('/teams/:id/group', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(assignTeamSchema, req.body, 'Invalid body.');
    const { team, tournamentId } = await assignTeam(req.params.id, parsed);
    broadcastRoster(tournamentId, await getRoster(tournamentId));
    broadcastBracket(tournamentId, await listBracket(tournamentId)); // membership changes bracket seeding/size
    audit(req.user!, `team.assign(${JSON.stringify(parsed)})`, req.params.id);
    res.json({ team });
  } catch (err) {
    next(err);
  }
});

adminRosterRouter.delete('/teams/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    const tournamentId = await removeTeam(req.params.id); // 409 if referenced by a match / bracket started
    broadcastRoster(tournamentId, await getRoster(tournamentId));
    broadcastBracket(tournamentId, await listBracket(tournamentId));
    audit(req.user!, 'team.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { MatchStatus, Team } from '../../../shared/types.js';
import { config } from '../config.js';
import type { Storage, StoredMatch } from './contracts.js';

/**
 * Driver-neutral first-boot bootstrap. Runs through the storage CONTRACTS
 * only, so every driver gets identical domain guarantees without duplicating
 * them:
 *  - at least one tournament always exists (default-tournament resolution and
 *    creation flows rely on it);
 *  - a completely empty roster gets a small demo (3 groups x 3 teams, a
 *    round of matches in every state, one demo squad) so the app shows
 *    something on first boot;
 *  - an empty account table gets the seeded operators.
 * Existing data is NEVER touched: every step is guarded by an emptiness
 * check, so a customized instance boots through here as a no-op.
 */
export async function runBootstrap(storage: Storage): Promise<void> {
  let tournaments = await storage.tournaments.list();
  if (tournaments.length === 0) {
    await storage.tournaments.create({ name: 'Tournament 1', startsAt: null, endsAt: null, status: 'active' });
    tournaments = await storage.tournaments.list();
  }
  const tournamentId = tournaments[0].id;

  await seedDemoRoster(storage, tournamentId);
  await seedUsers(storage);
}

/** Demo groups/teams/matches/players - ONLY when all three collections are
 * empty across the board, i.e. a genuinely fresh database. A customized
 * roster (even a partially cleared one) is left alone: seeding into it could
 * create matches pointing at foreign teams. */
async function seedDemoRoster(storage: Storage, tournamentId: string): Promise<void> {
  const groupCount = await storage.groups.countByTournament(tournamentId);
  const teamCount = await storage.teams.countByTournament(tournamentId);
  const matchCount = await storage.matches.countByTournament(tournamentId);
  if (groupCount > 0 || teamCount > 0 || matchCount > 0) return;

  const groupNames = ['Group A', 'Group B', 'Group C'];
  const teamSpecs: Array<Array<{ name: string; shortName: string }>> = [
    [
      { name: 'FC Lions', shortName: 'LIO' },
      { name: 'Eagles United', shortName: 'EAG' },
      { name: 'Blue Sharks', shortName: 'SHA' },
    ],
    [
      { name: 'Grey Wolves', shortName: 'WOL' },
      { name: 'Red Foxes', shortName: 'FOX' },
      { name: 'City Bears', shortName: 'BEA' },
    ],
    [
      { name: 'Sky Hawks', shortName: 'HAW' },
      { name: 'Iron Bulls', shortName: 'BUL' },
      { name: 'Green Vipers', shortName: 'VIP' },
    ],
  ];

  // Create groups and teams; assign with strictly increasing groupAddedAt so
  // the knockout seeding order is deterministic.
  const now = Date.now();
  const groupIds: string[] = [];
  const teams: Team[][] = [];
  let order = 0;
  for (let g = 0; g < groupNames.length; g++) {
    const group = await storage.groups.create(tournamentId, groupNames[g]);
    groupIds.push(group.id);
    const members: Team[] = [];
    for (const spec of teamSpecs[g]) {
      const team = await storage.teams.create(tournamentId, spec);
      members.push(await storage.teams.assign(team.id, group.id, new Date(now + order++).toISOString()));
    }
    teams.push(members);
  }

  // Round-robin within each group. Group A is fully played, B is in progress,
  // C is upcoming - so both resolved and symbolic bracket slots show.
  const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString();
  const fixture = (
    group: number,
    home: number,
    away: number,
    status: MatchStatus,
    homeScore: number,
    awayScore: number,
    offsetMin: number,
    field: string,
  ): StoredMatch => ({
    id: crypto.randomUUID(),
    tournamentId,
    group: groupIds[group],
    homeId: teams[group][home].id,
    awayId: teams[group][away].id,
    homeScore,
    awayScore,
    status,
    startsAt: iso(offsetMin),
    field,
    rev: 1,
  });
  const fixtures = [
    // Group A (all finished)
    fixture(0, 0, 1, 'finished', 2, 1, -220, 'Campo 1'),
    fixture(0, 0, 2, 'finished', 1, 1, -190, 'Campo 2'),
    fixture(0, 1, 2, 'finished', 0, 3, -160, 'Campo 1'),
    // Group B (two finished, one live)
    fixture(1, 0, 1, 'finished', 1, 0, -130, 'Campo 2'),
    fixture(1, 0, 2, 'finished', 2, 2, -100, 'Campo 3'),
    fixture(1, 1, 2, 'live', 1, 0, -54, 'Campo 1'),
    // Group C (one finished, two scheduled)
    fixture(2, 0, 1, 'finished', 3, 2, -70, 'Campo 3'),
    fixture(2, 0, 2, 'scheduled', 0, 0, 30, 'Campo 2'),
    fixture(2, 1, 2, 'scheduled', 0, 0, 60, 'Campo 3'),
  ];
  for (const f of fixtures) await storage.matches.save(f);

  // A small demo squad on the first team so the squads view shows something.
  const squad = [
    { name: 'Miguel Costa', number: 1, position: 'GK' },
    { name: 'Diogo Santos', number: 7, position: 'FW' },
    { name: 'Rui Almeida', number: 10, position: 'MF' },
  ];
  for (const p of squad) {
    await storage.players.create({ teamId: teams[0][0].id, name: p.name, number: p.number, position: p.position });
  }
}

/** Seeded operators - only on a completely empty account table (a legacy
 * users.json import, when present, runs first inside the driver and makes
 * this a no-op). Reserved usernames (validation.ts) keep strangers from
 * squatting these names. On a public deploy the well-known dev passwords
 * MUST be overridden via ADMIN_PASSWORD and VIEWER_PASSWORD; both apply to
 * this seed only and never rotate an existing account. */
async function seedUsers(storage: Storage): Promise<void> {
  if ((await storage.users.count()) > 0) return;
  const seeds = [
    { username: 'admin', password: config.adminPassword, role: 'admin' as const },
    { username: 'viewer', password: config.viewerPassword, role: 'user' as const },
  ];
  for (const s of seeds) {
    await storage.users.create({
      username: s.username,
      passwordHash: bcrypt.hashSync(s.password, config.bcryptCost),
      role: s.role,
    });
  }
}

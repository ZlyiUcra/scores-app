import crypto from 'node:crypto';
import type { Team } from '../../shared/types.js';
import type { SeedTeam } from '../../shared/tournament.js';
import { AppError } from './errors.js';
import { db, transaction } from './db.js';

/** Stored team: identity + membership FK + the server-only seeding key. */
interface StoredTeam {
  id: string;
  name: string;
  shortName: string;
  groupId: string | null;
  /** When the team was added to its current group — the knockout seeding key.
   * Server-set only; never leaves the server. Null while unassigned. */
  groupAddedAt: string | null;
}

/**
 * Team registry — the single source of truth for team identity and group
 * membership. Teams are created WITHOUT a group and added to one later, which
 * stamps `groupAddedAt` (the seeding key).
 */
export interface TeamRepository {
  /** Public DTO (no groupAddedAt). */
  list(): Team[];
  /** Server-only view carrying the seeding key, for bracket resolution. */
  listSeed(): SeedTeam[];
  get(id: string): Team | undefined;
  getStored(id: string): StoredTeam | undefined;
  countInGroup(groupId: string): number;
  create(input: { name: string; shortName: string }): Team;
  /** Rename a team (name and/or code). Membership is untouched. */
  update(id: string, patch: { name?: string; shortName?: string }): Team;
  /** Set/clear a team's group. `groupAddedAt` is server-set here (null clears). */
  assign(id: string, groupId: string | null, groupAddedAt: string | null): Team;
  remove(id: string): void;
}

/** Seed a small demo (3 groups x 3 teams) so the app shows something on boot.
 * `groupAddedAt` increments so seeding order is deterministic. */
function seedTeams(): StoredTeam[] {
  const now = Date.now();
  const iso = (i: number) => new Date(now + i).toISOString();
  const mk = (id: string, name: string, shortName: string, groupId: string, order: number): StoredTeam => ({
    id,
    name,
    shortName,
    groupId,
    groupAddedAt: iso(order),
  });
  return [
    mk('t1', 'FC Lions', 'LIO', 'gA', 0),
    mk('t2', 'Eagles United', 'EAG', 'gA', 1),
    mk('t3', 'Blue Sharks', 'SHA', 'gA', 2),
    mk('t4', 'Grey Wolves', 'WOL', 'gB', 3),
    mk('t5', 'Red Foxes', 'FOX', 'gB', 4),
    mk('t6', 'City Bears', 'BEA', 'gB', 5),
    mk('t7', 'Sky Hawks', 'HAW', 'gC', 6),
    mk('t8', 'Iron Bulls', 'BUL', 'gC', 7),
    mk('t9', 'Green Vipers', 'VIP', 'gC', 8),
  ];
}

function toDto(t: StoredTeam): Team {
  return { id: t.id, name: t.name, shortName: t.shortName, groupId: t.groupId };
}

class SqliteTeamRepository implements TeamRepository {
  private byId = new Map<string, StoredTeam>();

  constructor() {
    this.load();
  }

  private index(teams: StoredTeam[]): void {
    this.byId.clear();
    for (let i = 0; i < teams.length; i++) this.byId.set(teams[i].id, teams[i]);
  }

  private load(): void {
    const rows = db
      .prepare('SELECT id, name, shortName, groupId, groupAddedAt FROM teams')
      .all() as Array<{
      id: string;
      name: string;
      shortName: string;
      groupId: string | null;
      groupAddedAt: string | null;
    }>;
    if (rows.length === 0) {
      this.index(seedTeams());
      this.persist();
      return;
    }
    this.index(rows);
  }

  private persist(): void {
    transaction(() => {
      db.exec('DELETE FROM teams');
      const ins = db.prepare('INSERT INTO teams (id, name, shortName, groupId, groupAddedAt) VALUES (?, ?, ?, ?, ?)');
      for (const t of this.byId.values()) ins.run(t.id, t.name, t.shortName, t.groupId, t.groupAddedAt);
    });
  }

  list(): Team[] {
    return Array.from(this.byId.values()).map(toDto);
  }

  listSeed(): SeedTeam[] {
    return Array.from(this.byId.values()).map((t) => ({ ...toDto(t), groupAddedAt: t.groupAddedAt }));
  }

  get(id: string): Team | undefined {
    const t = this.byId.get(id);
    return t ? toDto(t) : undefined;
  }

  getStored(id: string): StoredTeam | undefined {
    return this.byId.get(id);
  }

  countInGroup(groupId: string): number {
    let n = 0;
    for (const t of this.byId.values()) if (t.groupId === groupId) n++;
    return n;
  }

  create(input: { name: string; shortName: string }): Team {
    const team: StoredTeam = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      shortName: input.shortName.trim().toUpperCase(),
      groupId: null,
      groupAddedAt: null,
    };
    this.byId.set(team.id, team);
    try {
      this.persist();
    } catch (err) {
      console.error('[teams] persist failed during create:', err);
      this.byId.delete(team.id);
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the team. Try again.', 500);
    }
    return toDto(team);
  }

  update(id: string, patch: { name?: string; shortName?: string }): Team {
    const team = this.byId.get(id);
    if (!team) throw new AppError('NOT_FOUND', `Team ${id} not found.`, 404);
    const prev = { name: team.name, shortName: team.shortName };
    if (patch.name !== undefined) team.name = patch.name.trim();
    if (patch.shortName !== undefined) team.shortName = patch.shortName.trim().toUpperCase();
    try {
      this.persist();
    } catch (err) {
      console.error('[teams] persist failed during update:', err);
      team.name = prev.name;
      team.shortName = prev.shortName;
      throw new AppError('STORE_WRITE_FAILED', 'Could not update the team. Try again.', 500);
    }
    return toDto(team);
  }

  assign(id: string, groupId: string | null, groupAddedAt: string | null): Team {
    const team = this.byId.get(id);
    if (!team) throw new AppError('NOT_FOUND', `Team ${id} not found.`, 404);
    const prev = { groupId: team.groupId, groupAddedAt: team.groupAddedAt };
    team.groupId = groupId;
    team.groupAddedAt = groupAddedAt;
    try {
      this.persist();
    } catch (err) {
      console.error('[teams] persist failed during assign:', err);
      team.groupId = prev.groupId;
      team.groupAddedAt = prev.groupAddedAt;
      throw new AppError('STORE_WRITE_FAILED', 'Could not update the team. Try again.', 500);
    }
    return toDto(team);
  }

  remove(id: string): void {
    const removed = this.byId.get(id);
    if (!removed) throw new AppError('NOT_FOUND', `Team ${id} not found.`, 404);
    this.byId.delete(id);
    try {
      this.persist();
    } catch (err) {
      console.error('[teams] persist failed during remove:', err);
      this.byId.set(id, removed); // roll back
      throw new AppError('STORE_WRITE_FAILED', 'Could not remove the team. Try again.', 500);
    }
  }
}

export const teamRepository: TeamRepository = new SqliteTeamRepository();

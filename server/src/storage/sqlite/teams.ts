import crypto from 'node:crypto';
import type { Team } from '../../../../shared/types.js';
import type { SeedTeam } from '../../../../shared/tournament.js';
import { AppError, AppErrorCode } from '../../errors.js';
import type { StoredTeam, TeamRepository } from '../contracts.js';
import { toSeedTeam, toTeamDto } from '../mapping.js';
import type { SqliteContext } from './db.js';

/** SQLite teams: full collection in a Map, persist = rewrite-all inside a
 * transaction. Also serves the driver-internal sync lookup the match
 * repository uses to embed teams without a per-row query. */
export class SqliteTeamRepository implements TeamRepository {
  private byId = new Map<string, StoredTeam>();

  constructor(private ctx: SqliteContext) {
    this.load();
  }

  private load(): void {
    const rows = this.ctx.db
      .prepare('SELECT id, tournamentId, name, shortName, groupId, groupAddedAt FROM teams')
      .all() as Array<{
      id: string;
      tournamentId: string;
      name: string;
      shortName: string;
      groupId: string | null;
      groupAddedAt: string | null;
    }>;
    this.byId.clear();
    for (let i = 0; i < rows.length; i++) this.byId.set(rows[i].id, rows[i]);
  }

  private persist(): void {
    this.ctx.transaction(() => {
      this.ctx.db.exec('DELETE FROM teams');
      const ins = this.ctx.db.prepare(
        'INSERT INTO teams (id, tournamentId, name, shortName, groupId, groupAddedAt) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const t of this.byId.values()) ins.run(t.id, t.tournamentId, t.name, t.shortName, t.groupId, t.groupAddedAt);
    });
  }

  /** Driver-internal SYNC lookup (the sqlite "join") - matches.ts only. */
  getDtoSync(id: string): Team | undefined {
    const t = this.byId.get(id);
    return t ? toTeamDto(t) : undefined;
  }

  async list(tournamentId: string): Promise<Team[]> {
    const out: Team[] = [];
    for (const t of this.byId.values()) if (t.tournamentId === tournamentId) out.push(toTeamDto(t));
    return out;
  }

  async listSeed(tournamentId: string): Promise<SeedTeam[]> {
    const out: SeedTeam[] = [];
    for (const t of this.byId.values()) {
      if (t.tournamentId === tournamentId) out.push(toSeedTeam(t));
    }
    return out;
  }

  async get(id: string): Promise<Team | undefined> {
    return this.getDtoSync(id);
  }

  async getStored(id: string): Promise<StoredTeam | undefined> {
    return this.byId.get(id);
  }

  async countInGroup(groupId: string): Promise<number> {
    let n = 0;
    for (const t of this.byId.values()) if (t.groupId === groupId) n++;
    return n;
  }

  async countByTournament(tournamentId: string): Promise<number> {
    let n = 0;
    for (const t of this.byId.values()) if (t.tournamentId === tournamentId) n++;
    return n;
  }

  async create(tournamentId: string, input: { name: string; shortName: string }): Promise<Team> {
    const team: StoredTeam = {
      id: crypto.randomUUID(),
      tournamentId,
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
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not save the team. Try again.', 500);
    }
    return toTeamDto(team);
  }

  async update(id: string, patch: { name?: string; shortName?: string }): Promise<Team> {
    const team = this.byId.get(id);
    if (!team) throw new AppError(AppErrorCode.NotFound, `Team ${id} not found.`, 404);
    const prev = { name: team.name, shortName: team.shortName };
    if (patch.name !== undefined) team.name = patch.name.trim();
    if (patch.shortName !== undefined) team.shortName = patch.shortName.trim().toUpperCase();
    try {
      this.persist();
    } catch (err) {
      console.error('[teams] persist failed during update:', err);
      team.name = prev.name;
      team.shortName = prev.shortName;
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not update the team. Try again.', 500);
    }
    return toTeamDto(team);
  }

  async assign(id: string, groupId: string | null, groupAddedAt: string | null): Promise<Team> {
    const team = this.byId.get(id);
    if (!team) throw new AppError(AppErrorCode.NotFound, `Team ${id} not found.`, 404);
    const prev = { groupId: team.groupId, groupAddedAt: team.groupAddedAt };
    team.groupId = groupId;
    team.groupAddedAt = groupAddedAt;
    try {
      this.persist();
    } catch (err) {
      console.error('[teams] persist failed during assign:', err);
      team.groupId = prev.groupId;
      team.groupAddedAt = prev.groupAddedAt;
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not update the team. Try again.', 500);
    }
    return toTeamDto(team);
  }

  async remove(id: string): Promise<void> {
    const removed = this.byId.get(id);
    if (!removed) throw new AppError(AppErrorCode.NotFound, `Team ${id} not found.`, 404);
    this.byId.delete(id);
    try {
      this.persist();
    } catch (err) {
      console.error('[teams] persist failed during remove:', err);
      this.byId.set(id, removed); // roll back
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not remove the team. Try again.', 500);
    }
  }
}

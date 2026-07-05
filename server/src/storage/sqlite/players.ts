import crypto from 'node:crypto';
import type { Player } from '../../../../shared/types.js';
import { AppError, AppErrorCode } from '../../errors.js';
import type { PlayerRepository } from '../contracts.js';
import type { SqliteContext } from './db.js';

/** SQLite players: full collection in a Map, persist = rewrite-all inside a
 * transaction. The partial unique index on (teamId, number) backs the
 * service-level jersey-number guard. */
export class SqlitePlayerRepository implements PlayerRepository {
  private byId = new Map<string, Player>();

  constructor(private ctx: SqliteContext) {
    this.load();
  }

  private load(): void {
    const rows = this.ctx.db
      .prepare('SELECT id, teamId, name, number, position FROM players')
      .all() as Array<{ id: string; teamId: string; name: string; number: number | null; position: string | null }>;
    this.byId.clear();
    for (let i = 0; i < rows.length; i++) this.byId.set(rows[i].id, rows[i]);
  }

  private persist(): void {
    this.ctx.transaction(() => {
      this.ctx.db.exec('DELETE FROM players');
      const ins = this.ctx.db.prepare('INSERT INTO players (id, teamId, name, number, position) VALUES (?, ?, ?, ?, ?)');
      for (const p of this.byId.values()) ins.run(p.id, p.teamId, p.name, p.number, p.position);
    });
  }

  async list(): Promise<Player[]> {
    return Array.from(this.byId.values());
  }

  async get(id: string): Promise<Player | undefined> {
    return this.byId.get(id);
  }

  async listByTeams(teamIds: Set<string>): Promise<Player[]> {
    const out: Player[] = [];
    for (const p of this.byId.values()) {
      if (teamIds.has(p.teamId)) out.push(p);
    }
    return out;
  }

  async numberInUse(teamId: string, number: number, exceptId?: string): Promise<boolean> {
    for (const p of this.byId.values()) {
      if (p.teamId === teamId && p.number === number && p.id !== exceptId) return true;
    }
    return false;
  }

  async create(input: { teamId: string; name: string; number: number | null; position: string | null }): Promise<Player> {
    const player: Player = {
      id: crypto.randomUUID(),
      teamId: input.teamId,
      name: input.name.trim(),
      number: input.number,
      position: input.position,
    };
    this.byId.set(player.id, player);
    try {
      this.persist();
    } catch (err) {
      console.error('[players] persist failed during create:', err);
      this.byId.delete(player.id);
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not save the player. Try again.', 500);
    }
    return player;
  }

  async update(id: string, patch: { name?: string; number?: number | null; position?: string | null }): Promise<Player> {
    const player = this.byId.get(id);
    if (!player) throw new AppError(AppErrorCode.NotFound, `Player ${id} not found.`, 404);
    const prev = { name: player.name, number: player.number, position: player.position };
    if (patch.name !== undefined) player.name = patch.name.trim();
    if (patch.number !== undefined) player.number = patch.number;
    if (patch.position !== undefined) player.position = patch.position;
    try {
      this.persist();
    } catch (err) {
      console.error('[players] persist failed during update:', err);
      player.name = prev.name;
      player.number = prev.number;
      player.position = prev.position;
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not update the player. Try again.', 500);
    }
    return player;
  }

  async remove(id: string): Promise<void> {
    const removed = this.byId.get(id);
    if (!removed) throw new AppError(AppErrorCode.NotFound, `Player ${id} not found.`, 404);
    this.byId.delete(id);
    try {
      this.persist();
    } catch (err) {
      console.error('[players] persist failed during remove:', err);
      this.byId.set(id, removed);
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not remove the player. Try again.', 500);
    }
  }

  async removeByTeam(teamId: string): Promise<void> {
    const removed: Player[] = [];
    for (const p of this.byId.values()) {
      if (p.teamId === teamId) removed.push(p);
    }
    if (removed.length === 0) return;
    for (let i = 0; i < removed.length; i++) this.byId.delete(removed[i].id);
    try {
      this.persist();
    } catch (err) {
      console.error('[players] persist failed during removeByTeam:', err);
      for (let i = 0; i < removed.length; i++) this.byId.set(removed[i].id, removed[i]);
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not remove the team\'s players. Try again.', 500);
    }
  }
}

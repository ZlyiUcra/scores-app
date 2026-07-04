import crypto from 'node:crypto';
import type { Group } from '../../../../shared/types.js';
import { AppError } from '../../errors.js';
import type { GroupRepository, StoredGroup } from '../contracts.js';
import type { SqliteContext } from './db.js';

function toDto(g: StoredGroup): Group {
  return { id: g.id, name: g.name };
}

/** SQLite groups: full collection in a Map (kept in creation order), persist =
 * rewrite-all inside a transaction. */
export class SqliteGroupRepository implements GroupRepository {
  private byId = new Map<string, StoredGroup>();

  constructor(private ctx: SqliteContext) {
    this.load();
  }

  private index(groups: StoredGroup[]): void {
    this.byId.clear();
    // Keep creation order stable.
    const sorted = [...groups].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i++) this.byId.set(sorted[i].id, sorted[i]);
  }

  private load(): void {
    const rows = this.ctx.db
      .prepare('SELECT id, tournamentId, name, createdAt FROM groups')
      .all() as Array<{ id: string; tournamentId: string; name: string; createdAt: string }>;
    this.index(rows);
  }

  private persist(): void {
    this.ctx.transaction(() => {
      this.ctx.db.exec('DELETE FROM groups');
      const ins = this.ctx.db.prepare('INSERT INTO groups (id, tournamentId, name, createdAt) VALUES (?, ?, ?, ?)');
      for (const g of this.byId.values()) ins.run(g.id, g.tournamentId, g.name, g.createdAt);
    });
  }

  async list(tournamentId: string): Promise<Group[]> {
    const out: Group[] = [];
    for (const g of this.byId.values()) {
      if (g.tournamentId === tournamentId) out.push(toDto(g));
    }
    return out;
  }

  async get(id: string): Promise<Group | undefined> {
    const g = this.byId.get(id);
    return g ? toDto(g) : undefined;
  }

  async getStored(id: string): Promise<StoredGroup | undefined> {
    return this.byId.get(id);
  }

  async countByTournament(tournamentId: string): Promise<number> {
    let n = 0;
    for (const g of this.byId.values()) if (g.tournamentId === tournamentId) n++;
    return n;
  }

  async create(tournamentId: string, name: string): Promise<Group> {
    const group: StoredGroup = { id: crypto.randomUUID(), tournamentId, name: name.trim(), createdAt: new Date().toISOString() };
    this.byId.set(group.id, group);
    try {
      this.persist();
    } catch (err) {
      console.error('[groups] persist failed during create:', err);
      this.byId.delete(group.id);
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the group. Try again.', 500);
    }
    return toDto(group);
  }

  async update(id: string, name: string): Promise<Group> {
    const group = this.byId.get(id);
    if (!group) throw new AppError('NOT_FOUND', `Group ${id} not found.`, 404);
    const prev = group.name;
    group.name = name.trim();
    try {
      this.persist();
    } catch (err) {
      console.error('[groups] persist failed during update:', err);
      group.name = prev;
      throw new AppError('STORE_WRITE_FAILED', 'Could not rename the group. Try again.', 500);
    }
    return toDto(group);
  }

  async remove(id: string): Promise<void> {
    const prev = this.byId.get(id);
    if (!prev) throw new AppError('NOT_FOUND', `Group ${id} not found.`, 404);
    this.byId.delete(id);
    try {
      this.persist();
    } catch (err) {
      console.error('[groups] persist failed during remove:', err);
      this.byId.set(id, prev);
      throw new AppError('STORE_WRITE_FAILED', 'Could not remove the group. Try again.', 500);
    }
  }
}

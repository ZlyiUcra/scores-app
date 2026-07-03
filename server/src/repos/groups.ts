import crypto from 'node:crypto';
import type { Group } from '../../../shared/types.js';
import { AppError } from '../errors.js';
import { db, transaction } from '../db.js';
import { tournamentRepository } from './tournaments.js';

/** Stored group: the public DTO plus its owning tournament and a creation
 * timestamp (for stable list ordering). */
export interface StoredGroup extends Group {
  tournamentId: string;
  createdAt: string;
}

/**
 * Group registry — first-class entity, admin-created, scoped to a tournament.
 * Teams reference a group by id (see teams.ts). Group ids stay GLOBALLY
 * unique, so id-addressed reads need no tournament.
 */
export interface GroupRepository {
  /** A tournament's groups in stable creation order (createdAt, then id). */
  list(tournamentId: string): Group[];
  /** Group by id, or undefined. */
  get(id: string): Group | undefined;
  /** Raw stored form (incl. tournamentId) for service-side scoping logic. */
  getStored(id: string): StoredGroup | undefined;
  /** How many groups a tournament has (tournament-removal guard). */
  countByTournament(tournamentId: string): number;
  /** Create a group with a fresh uuid; name arrives pre-validated. */
  create(tournamentId: string, name: string): Group;
  /** Rename a group (cosmetic — id-based references stay valid). */
  update(id: string, name: string): Group;
  /** Delete a group. Emptiness (no member teams) is the SERVICE's guard. */
  remove(id: string): void;
}

/** Seed a small demo tournament so the app shows something on first boot. */
function seedGroups(tournamentId: string): StoredGroup[] {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  return [
    { id: 'gA', tournamentId, name: 'Group A', createdAt: iso(0) },
    { id: 'gB', tournamentId, name: 'Group B', createdAt: iso(1) },
    { id: 'gC', tournamentId, name: 'Group C', createdAt: iso(2) },
  ];
}

class SqliteGroupRepository implements GroupRepository {
  private byId = new Map<string, StoredGroup>();

  constructor() {
    this.load();
  }

  private index(groups: StoredGroup[]): void {
    this.byId.clear();
    // Keep creation order stable.
    const sorted = [...groups].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i++) this.byId.set(sorted[i].id, sorted[i]);
  }

  private load(): void {
    const rows = db
      .prepare('SELECT id, tournamentId, name, createdAt FROM groups')
      .all() as Array<{ id: string; tournamentId: string; name: string; createdAt: string }>;
    if (rows.length === 0) {
      // Demo data belongs to the boot-guaranteed default tournament (db.ts).
      this.index(seedGroups(tournamentRepository.list()[0].id));
      this.persist();
      return;
    }
    this.index(rows);
  }

  private persist(): void {
    transaction(() => {
      db.exec('DELETE FROM groups');
      const ins = db.prepare('INSERT INTO groups (id, tournamentId, name, createdAt) VALUES (?, ?, ?, ?)');
      for (const g of this.byId.values()) ins.run(g.id, g.tournamentId, g.name, g.createdAt);
    });
  }

  list(tournamentId: string): Group[] {
    const out: Group[] = [];
    for (const g of this.byId.values()) {
      if (g.tournamentId === tournamentId) out.push({ id: g.id, name: g.name });
    }
    return out;
  }

  get(id: string): Group | undefined {
    const g = this.byId.get(id);
    return g ? { id: g.id, name: g.name } : undefined;
  }

  getStored(id: string): StoredGroup | undefined {
    return this.byId.get(id);
  }

  countByTournament(tournamentId: string): number {
    let n = 0;
    for (const g of this.byId.values()) if (g.tournamentId === tournamentId) n++;
    return n;
  }

  create(tournamentId: string, name: string): Group {
    const group: StoredGroup = { id: crypto.randomUUID(), tournamentId, name: name.trim(), createdAt: new Date().toISOString() };
    this.byId.set(group.id, group);
    try {
      this.persist();
    } catch (err) {
      console.error('[groups] persist failed during create:', err);
      this.byId.delete(group.id);
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the group. Try again.', 500);
    }
    return { id: group.id, name: group.name };
  }

  update(id: string, name: string): Group {
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
    return { id: group.id, name: group.name };
  }

  remove(id: string): void {
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

/** Singleton instance every service shares (state lives in one process). */
export const groupRepository: GroupRepository = new SqliteGroupRepository();

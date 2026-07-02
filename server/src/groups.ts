import crypto from 'node:crypto';
import type { Group } from '../../shared/types.js';
import { AppError } from './errors.js';
import { db, transaction } from './db.js';

/** Stored group carries a creation timestamp (for stable list ordering). */
interface StoredGroup extends Group {
  createdAt: string;
}

/**
 * Group registry — first-class entity, admin-created. Teams reference a group by
 * id (see teams.ts). Kept deliberately small: create / list / remove.
 */
export interface GroupRepository {
  list(): Group[];
  get(id: string): Group | undefined;
  create(name: string): Group;
  /** Rename a group (cosmetic — id-based references stay valid). */
  update(id: string, name: string): Group;
  remove(id: string): void;
}

/** Seed a small demo tournament so the app shows something on first boot. */
function seedGroups(): StoredGroup[] {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  return [
    { id: 'gA', name: 'Group A', createdAt: iso(0) },
    { id: 'gB', name: 'Group B', createdAt: iso(1) },
    { id: 'gC', name: 'Group C', createdAt: iso(2) },
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
      .prepare('SELECT id, name, createdAt FROM groups')
      .all() as Array<{ id: string; name: string; createdAt: string }>;
    if (rows.length === 0) {
      this.index(seedGroups());
      this.persist();
      return;
    }
    this.index(rows);
  }

  private persist(): void {
    transaction(() => {
      db.exec('DELETE FROM groups');
      const ins = db.prepare('INSERT INTO groups (id, name, createdAt) VALUES (?, ?, ?)');
      for (const g of this.byId.values()) ins.run(g.id, g.name, g.createdAt);
    });
  }

  list(): Group[] {
    return Array.from(this.byId.values()).map((g) => ({ id: g.id, name: g.name }));
  }

  get(id: string): Group | undefined {
    const g = this.byId.get(id);
    return g ? { id: g.id, name: g.name } : undefined;
  }

  create(name: string): Group {
    const group: StoredGroup = { id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString() };
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

export const groupRepository: GroupRepository = new SqliteGroupRepository();

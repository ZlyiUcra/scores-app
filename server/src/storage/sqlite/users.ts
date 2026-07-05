import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Role } from '../../../../shared/types.js';
import { AppError, AppErrorCode } from '../../errors.js';
import type { StoredUser, UserRepository } from '../contracts.js';
import { normalizeUsername } from '../mapping.js';
import type { SqliteContext } from './db.js';

interface LegacyUserFile {
  version: number;
  users: StoredUser[];
}

/**
 * SQLite accounts: full collection in two Maps (by id, by lowercased
 * username), persist = rewrite-all inside a transaction. PLAIN CRUD - all
 * domain guards (uniqueness, cap, last-admin, self-lockout) live in services
 * under the mutation lock; the UNIQUE(usernameLower) column is the DB-level
 * backstop only.
 *
 * First boot on an empty users table imports the pre-SQLite users.json if one
 * exists (fail-closed on a corrupt file - accounts could be in it). Seeding
 * fresh operator accounts is the driver-neutral bootstrap's job, not ours.
 */
export class SqliteUserRepository implements UserRepository {
  private byUsernameLower = new Map<string, StoredUser>();
  private byId = new Map<string, StoredUser>();

  constructor(private ctx: SqliteContext) {
    this.load();
  }

  private index(users: StoredUser[]): void {
    this.byUsernameLower.clear();
    this.byId.clear();
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      // Migration: legacy rows predate `active`. Missing must mean active=true,
      // otherwise every existing user (incl. admins) would be locked out.
      if (typeof u.active !== 'boolean') u.active = true;
      this.byUsernameLower.set(u.usernameLower, u);
      this.byId.set(u.id, u);
    }
  }

  private load(): void {
    const rows = this.ctx.db
      .prepare('SELECT id, username, usernameLower, passwordHash, role, createdAt, active FROM users')
      .all() as Array<{
      id: string;
      username: string;
      usernameLower: string;
      passwordHash: string;
      role: string;
      createdAt: string;
      active: number;
    }>;
    if (rows.length === 0) {
      const imported = this.importLegacyUsers();
      if (imported) {
        this.index(imported);
        this.persist();
      }
      return;
    }
    this.index(
      rows.map((r) => ({
        id: r.id,
        username: r.username,
        usernameLower: r.usernameLower,
        passwordHash: r.passwordHash,
        role: r.role as Role,
        createdAt: r.createdAt,
        active: r.active !== 0,
      })),
    );
  }

  /** One-time import of accounts from the pre-SQLite users.json. Fails CLOSED on
   * a corrupt legacy file (accounts could be in it) rather than seeding over it. */
  private importLegacyUsers(): StoredUser[] | null {
    const legacyFile = path.join(this.ctx.dataDir, 'users.json');
    if (!fs.existsSync(legacyFile)) return null;
    let parsed: LegacyUserFile;
    try {
      parsed = JSON.parse(fs.readFileSync(legacyFile, 'utf8')) as LegacyUserFile;
    } catch (err) {
      throw new Error(
        `[users] legacy ${legacyFile} is corrupt. Refusing to start so accounts are not lost. Fix or remove it. (${String(err)})`,
      );
    }
    if (!parsed || !Array.isArray(parsed.users)) {
      throw new Error(`[users] legacy ${legacyFile} has an unexpected schema. Refusing to start.`);
    }
    if (parsed.users.length === 0) return null;
    console.log(`[users] importing ${parsed.users.length} account(s) from legacy users.json into SQLite.`);
    return parsed.users;
  }

  private persist(): void {
    // Rewrite the whole table atomically. THROWS on failure so a caller reports
    // 5xx instead of returning a phantom account that never hit the DB.
    this.ctx.transaction(() => {
      this.ctx.db.exec('DELETE FROM users');
      const ins = this.ctx.db.prepare(
        'INSERT INTO users (id, username, usernameLower, passwordHash, role, createdAt, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const u of this.byId.values()) {
        ins.run(u.id, u.username, u.usernameLower, u.passwordHash, u.role, u.createdAt, u.active ? 1 : 0);
      }
    });
  }

  async findByUsername(username: string): Promise<StoredUser | undefined> {
    return this.byUsernameLower.get(normalizeUsername(username));
  }

  async getById(id: string): Promise<StoredUser | undefined> {
    return this.byId.get(id);
  }

  async listAll(): Promise<StoredUser[]> {
    return Array.from(this.byId.values());
  }

  async count(): Promise<number> {
    return this.byId.size;
  }

  async countActiveAdmins(): Promise<number> {
    let count = 0;
    for (const u of this.byId.values()) {
      if (u.role === 'admin' && u.active) count++;
    }
    return count;
  }

  async create(input: { username: string; passwordHash: string; role: Role }): Promise<StoredUser> {
    const user: StoredUser = {
      id: crypto.randomUUID(), // never positional - id collisions = auth as someone else
      username: input.username.trim(),
      usernameLower: normalizeUsername(input.username),
      role: input.role,
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString(),
      active: true,
    };
    this.byUsernameLower.set(user.usernameLower, user);
    this.byId.set(user.id, user);
    try {
      this.persist();
    } catch (err) {
      console.error('[users] persist failed during create:', err);
      this.byUsernameLower.delete(user.usernameLower);
      this.byId.delete(user.id);
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not save the account. Try again.', 500);
    }
    return user;
  }

  async update(id: string, patch: { active?: boolean; role?: Role }): Promise<StoredUser> {
    const user = this.byId.get(id);
    if (!user) throw new AppError(AppErrorCode.NotFound, 'User not found.', 404);
    const prev = { active: user.active, role: user.role };
    if (patch.active !== undefined) user.active = patch.active;
    if (patch.role !== undefined) user.role = patch.role;
    try {
      this.persist();
    } catch (err) {
      console.error('[users] persist failed during update:', err);
      user.active = prev.active;
      user.role = prev.role;
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not update the user. Try again.', 500);
    }
    return user;
  }

  async remove(id: string): Promise<void> {
    const user = this.byId.get(id);
    if (!user) throw new AppError(AppErrorCode.NotFound, 'User not found.', 404);
    this.byId.delete(id);
    this.byUsernameLower.delete(user.usernameLower);
    try {
      this.persist();
    } catch (err) {
      console.error('[users] persist failed during remove:', err);
      this.byId.set(id, user);
      this.byUsernameLower.set(user.usernameLower, user);
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not delete the user. Try again.', 500);
    }
  }
}

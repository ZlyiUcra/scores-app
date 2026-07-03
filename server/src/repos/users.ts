import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AdminUserView, AuthUser, Role } from '../../../shared/types.js';
import { AppError } from '../errors.js';
import { db, transaction, DATA_DIR_PATH } from '../db.js';

/** Pre-SQLite account store — imported ONCE into the DB on first boot. */
const LEGACY_USERS_FILE = path.join(DATA_DIR_PATH, 'users.json');
const BCRYPT_COST = 12;
const MAX_USERS = 500; // global cap — blunts registration flooding

/** Server-only shape: carries the password hash, NEVER leaves the server. */
export interface StoredUser extends AuthUser {
  usernameLower: string;
  passwordHash: string;
  createdAt: string;
  active: boolean;
}

interface UserFile {
  version: number;
  users: StoredUser[];
}

/** Public/session projection — never leaks passwordHash. */
function toPublic(u: StoredUser): AuthUser {
  return { id: u.id, username: u.username, role: u.role };
}

/** Admin-panel projection — adds createdAt/active but still no passwordHash. */
function toAdminView(u: StoredUser): AdminUserView {
  return { id: u.id, username: u.username, role: u.role, active: u.active, createdAt: u.createdAt };
}

/** Canonical form for uniqueness checks: usernames are case-insensitive. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Repository interface — mirrors MatchRepository. Uniqueness, id generation and
 * the last-admin invariant are properties of the persisted collection, so the
 * mutating methods do an atomic (await-free) check-and-write here.
 */
export interface UserRepository {
  /** Case-insensitive lookup (login path); O(1) map hit. */
  findByUsername(username: string): StoredUser | undefined;
  /** Lookup by id (per-request re-load that makes revocation instant). */
  getById(id: string): StoredUser | undefined;
  /** Every stored user, server-only shape — callers project before responding. */
  listAll(): StoredUser[];
  /** Atomic check-and-insert: unique username, global cap, uuid id. */
  create(input: { username: string; passwordHash: string; role: Role }): StoredUser;
  /** Atomic patch of active/role with self-lockout & last-admin guards. */
  update(id: string, actorId: string, patch: { active?: boolean; role?: Role }): StoredUser;
  /** Atomic delete with self & last-admin guards. */
  remove(id: string, actorId: string): void;
  /** Total stored accounts (registration-cap check). */
  count(): number;
}

class JsonFileUserRepository implements UserRepository {
  private byUsernameLower = new Map<string, StoredUser>();
  private byId = new Map<string, StoredUser>();

  constructor() {
    this.load();
  }

  private seed(): StoredUser[] {
    // Seeded operators. Passwords hashed at boot; reserved so they can't be
    // registered by a stranger (see reserved-name denylist in validation).
    // On a public deploy the well-known dev password MUST be overridden via
    // ADMIN_PASSWORD (seeds only on first boot / empty users table).
    const adminPassword = process.env.ADMIN_PASSWORD?.trim() || 'admin123';
    const raw: Array<{ username: string; password: string; role: Role }> = [
      { username: 'admin', password: adminPassword, role: 'admin' },
      { username: 'viewer', password: 'viewer123', role: 'user' },
    ];
    const now = new Date().toISOString();
    const out: StoredUser[] = [];
    for (let i = 0; i < raw.length; i++) {
      const u = raw[i];
      out.push({
        id: `u${i + 1}`,
        username: u.username,
        usernameLower: normalizeUsername(u.username),
        role: u.role,
        passwordHash: bcrypt.hashSync(u.password, BCRYPT_COST),
        createdAt: now,
        active: true,
      });
    }
    return out;
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
    const rows = db
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
      // First boot on SQLite: bring over legacy accounts if present, else seed.
      // This is the ONLY path that writes seeds.
      const imported = this.importLegacyUsers();
      this.index(imported ?? this.seed());
      this.persist();
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
    if (!fs.existsSync(LEGACY_USERS_FILE)) return null;
    let parsed: UserFile;
    try {
      parsed = JSON.parse(fs.readFileSync(LEGACY_USERS_FILE, 'utf8')) as UserFile;
    } catch (err) {
      throw new Error(
        `[users] legacy ${LEGACY_USERS_FILE} is corrupt. Refusing to start so accounts are not lost. Fix or remove it. (${String(err)})`,
      );
    }
    if (!parsed || !Array.isArray(parsed.users)) {
      throw new Error(`[users] legacy ${LEGACY_USERS_FILE} has an unexpected schema. Refusing to start.`);
    }
    if (parsed.users.length === 0) return null;
    console.log(`[users] importing ${parsed.users.length} account(s) from legacy users.json into SQLite.`);
    return parsed.users;
  }

  private persist(): void {
    // Rewrite the whole table atomically. THROWS on failure so a caller reports
    // 5xx instead of returning a phantom account that never hit the DB.
    transaction(() => {
      db.exec('DELETE FROM users');
      const ins = db.prepare(
        'INSERT INTO users (id, username, usernameLower, passwordHash, role, createdAt, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const u of this.listAll()) {
        ins.run(u.id, u.username, u.usernameLower, u.passwordHash, u.role, u.createdAt, u.active ? 1 : 0);
      }
    });
  }

  /** Count admins that could still log in — the last-admin invariant. */
  private activeAdminCount(): number {
    let count = 0;
    for (const u of this.byId.values()) {
      if (u.role === 'admin' && u.active) count++;
    }
    return count;
  }

  findByUsername(username: string): StoredUser | undefined {
    return this.byUsernameLower.get(normalizeUsername(username));
  }

  getById(id: string): StoredUser | undefined {
    return this.byId.get(id);
  }

  listAll(): StoredUser[] {
    return Array.from(this.byId.values());
  }

  count(): number {
    return this.byId.size;
  }

  create(input: { username: string; passwordHash: string; role: Role }): StoredUser {
    // ---- Atomic section: no `await` between check and insert. ----
    const lower = normalizeUsername(input.username);
    if (this.byUsernameLower.has(lower)) {
      throw new AppError('USERNAME_TAKEN', 'This username is already taken.', 409);
    }
    if (this.byId.size >= MAX_USERS) {
      throw new AppError('USER_LIMIT', 'Registration is temporarily closed.', 503);
    }
    const user: StoredUser = {
      id: crypto.randomUUID(), // never positional — id collisions = auth as someone else
      username: input.username.trim(),
      usernameLower: lower,
      role: input.role,
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString(),
      active: true,
    };
    this.byUsernameLower.set(lower, user);
    this.byId.set(user.id, user);
    try {
      this.persist();
    } catch (err) {
      console.error('[users] persist failed during create:', err);
      this.byUsernameLower.delete(lower);
      this.byId.delete(user.id);
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the account. Try again.', 500);
    }
    return user;
  }

  update(id: string, actorId: string, patch: { active?: boolean; role?: Role }): StoredUser {
    // ---- Atomic section: guards re-checked immediately before the write, with
    // no `await` in between, so two concurrent demotes can't both pass. ----
    const user = this.byId.get(id);
    if (!user) throw new AppError('NOT_FOUND', 'User not found.', 404);

    const willBeActive = patch.active ?? user.active;
    const willBeRole = patch.role ?? user.role;
    const losesAdmin = user.role === 'admin' && user.active && (willBeRole !== 'admin' || !willBeActive);

    if (id === actorId && losesAdmin) {
      throw new AppError('SELF_LOCKOUT', 'You cannot demote or deactivate your own admin account.', 400);
    }
    if (losesAdmin && this.activeAdminCount() <= 1) {
      throw new AppError('LAST_ADMIN', 'Cannot remove the last active admin.', 409);
    }

    const prev = { active: user.active, role: user.role };
    user.active = willBeActive;
    user.role = willBeRole;
    try {
      this.persist();
    } catch (err) {
      console.error('[users] persist failed during update:', err);
      user.active = prev.active;
      user.role = prev.role;
      throw new AppError('STORE_WRITE_FAILED', 'Could not update the user. Try again.', 500);
    }
    return user;
  }

  remove(id: string, actorId: string): void {
    // ---- Atomic section ----
    const user = this.byId.get(id);
    if (!user) throw new AppError('NOT_FOUND', 'User not found.', 404);
    if (id === actorId) {
      throw new AppError('SELF_LOCKOUT', 'You cannot delete your own account.', 400);
    }
    if (user.role === 'admin' && user.active && this.activeAdminCount() <= 1) {
      throw new AppError('LAST_ADMIN', 'Cannot delete the last active admin.', 409);
    }
    this.byId.delete(id);
    this.byUsernameLower.delete(user.usernameLower);
    try {
      this.persist();
    } catch (err) {
      console.error('[users] persist failed during remove:', err);
      this.byId.set(id, user);
      this.byUsernameLower.set(user.usernameLower, user);
      throw new AppError('STORE_WRITE_FAILED', 'Could not delete the user. Try again.', 500);
    }
  }
}

/** Singleton instance every service shares (state lives in one process). */
export const userRepository: UserRepository = new JsonFileUserRepository();
export { BCRYPT_COST, toPublic, toAdminView };

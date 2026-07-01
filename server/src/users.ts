import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import type { AdminUserView, AuthUser, Role } from '../../shared/types.js';
import { AppError } from './errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'users.json');

const SCHEMA_VERSION = 1;
const BCRYPT_COST = 12;
const MAX_USERS = 500; // global cap — blunts registration flooding of the flat file

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

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Repository interface — mirrors MatchRepository. Uniqueness, id generation and
 * the last-admin invariant are properties of the persisted collection, so the
 * mutating methods do an atomic (await-free) check-and-write here.
 */
export interface UserRepository {
  findByUsername(username: string): StoredUser | undefined;
  getById(id: string): StoredUser | undefined;
  listAll(): StoredUser[];
  create(input: { username: string; passwordHash: string; role: Role }): StoredUser;
  /** Atomic patch of active/role with self-lockout & last-admin guards. */
  update(id: string, actorId: string, patch: { active?: boolean; role?: Role }): StoredUser;
  /** Atomic delete with self & last-admin guards. */
  remove(id: string, actorId: string): void;
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
    const raw: Array<{ username: string; password: string; role: Role }> = [
      { username: 'admin', password: 'admin123', role: 'admin' },
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
    if (!fs.existsSync(DATA_FILE)) {
      // First boot: seed and persist. This is the ONLY path that writes seeds.
      const seeded = this.seed();
      this.index(seeded);
      this.persist();
      return;
    }
    // File exists: parse it. Do NOT reseed-overwrite on failure — that would
    // silently wipe every registered account. Fail closed instead.
    let parsed: UserFile;
    try {
      parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as UserFile;
    } catch (err) {
      throw new Error(
        `[users] ${DATA_FILE} is corrupt and was NOT overwritten. Fix or remove it. (${String(err)})`,
      );
    }
    if (!parsed || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.users)) {
      throw new Error(`[users] ${DATA_FILE} has an unexpected schema (version ${parsed?.version}). Refusing to start.`);
    }
    this.index(parsed.users);
  }

  private persist(): void {
    // Atomic temp-then-rename. THROWS on failure so a caller reports 5xx
    // instead of returning a phantom account that never hit disk.
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const payload: UserFile = { version: SCHEMA_VERSION, users: this.listAll() };
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
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

export const userRepository: UserRepository = new JsonFileUserRepository();
export { BCRYPT_COST, toPublic, toAdminView };

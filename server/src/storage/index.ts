import { config } from '../config.js';
import type { Storage } from './contracts.js';
import { createSqliteStorage } from './sqlite/index.js';
import { runBootstrap } from './bootstrap.js';

/**
 * The one storage instance of the process, fully initialized (schema,
 * migrations, bootstrap) before anything importing this module runs - ESM
 * top-level await guarantees the whole app waits, so no request can ever see
 * uninitialized storage.
 *
 * Only the sqlite driver exists today, so it is wired directly. When a second
 * driver arrives, replace this with an explicit fail-closed switch (throw on
 * an unknown driver name - NEVER silently fall back, a misconfigured fresh
 * boot would resurrect the seeded default credentials).
 */
export const storage: Storage = await createSqliteStorage({ dataDir: config.dataDir });
await runBootstrap(storage);
console.log('[storage] driver: sqlite');

// Per-domain singletons - the import surface services use.
export const tournamentRepository = storage.tournaments;
export const groupRepository = storage.groups;
export const teamRepository = storage.teams;
export const playerRepository = storage.players;
export const matchRepository = storage.matches;
export const userRepository = storage.users;
export const bracketRepository = storage.bracket;

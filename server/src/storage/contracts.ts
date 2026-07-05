import type {
  AuthUser,
  BracketSlotId,
  Group,
  Match,
  MatchStatus,
  Player,
  Role,
  Team,
  Tournament,
  TournamentStatus,
} from '../../../shared/types.js';
import type { BracketResult, SeedTeam } from '../../../shared/tournament.js';

/**
 * Storage contracts - the portability seam. Everything here is pure types:
 * no SQL, no driver imports, no node:sqlite. A storage driver (storage/sqlite
 * today, a future storage/postgres) implements these interfaces; services and
 * routes never see anything below them.
 *
 * CONCURRENCY CONTRACT: the interfaces are async and guarantee NO cross-call
 * atomicity. Check-then-write invariants (uniqueness, last-admin, group caps,
 * bracket locks) are the SERVICE layer's job and are serialized by the global
 * mutation lock (services/mutationLock.ts). Two rules keep that sound:
 *  1. No non-repository `await` between a guard and its write - hash
 *     passwords, fetch nothing, before entering the locked section.
 *  2. Only route-facing service entry points take the lock (it is not
 *     reentrant); internal service helpers stay lock-free.
 *
 * ERROR CONTRACT: drivers throw AppError with NOT_FOUND (missing id),
 * STORE_WRITE_FAILED (persist failure; state rolled back) or DATA_INTEGRITY
 * (impossible reference). Domain rules (USERNAME_TAKEN, LAST_ADMIN, ...) are
 * thrown by services, never by drivers.
 *
 * SCALE CONTRACT: collections are small (one local tournament's worth), so
 * full-scan list methods are acceptable everywhere. A future driver may
 * implement them as full SELECTs; do not add per-row round-trips (resolved
 * Match DTOs come from ONE joined read, see MatchRepository).
 */

/** Stored team: identity + owning tournament + membership FK + the
 * server-only seeding key. */
export interface StoredTeam {
  id: string;
  tournamentId: string;
  name: string;
  shortName: string;
  groupId: string | null;
  /** When the team was added to its current group - the knockout seeding key.
   * Server-set only; never leaves the server. Null while unassigned. */
  groupAddedAt: string | null;
}

/** Stored group: the public DTO plus its owning tournament and a creation
 * timestamp (for stable list ordering). */
export interface StoredGroup extends Group {
  tournamentId: string;
  createdAt: string;
}

/** Stored tournament carries a creation timestamp (stable ordering + the
 * default-tournament resolution key). */
export interface StoredTournament extends Tournament {
  createdAt: string;
}

/**
 * Persisted match shape: references teams by id (TeamRepository is the source
 * of truth). `group` is derived from the teams at creation. The public `Match`
 * DTO embeds resolved Team objects - resolution is the DRIVER's job so it can
 * be a single joined read (see storage/mapping.ts for the shared shaping).
 */
export interface StoredMatch {
  id: string;
  tournamentId: string;
  group: string;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  startsAt: string;
  field: string;
  rev: number;
}

/** Server-only shape: carries the password hash, NEVER leaves the server. */
export interface StoredUser extends AuthUser {
  usernameLower: string;
  passwordHash: string;
  createdAt: string;
  active: boolean;
}

/**
 * Tournament registry - the top-level container. Every group/team/match/
 * bracket row references a tournament by id. Bootstrap guarantees at least
 * one tournament exists before the server accepts requests. Emptiness guards
 * for removal live in the SERVICE.
 */
export interface TournamentRepository {
  /** All tournaments in stable creation order (createdAt, then id). */
  list(): Promise<Tournament[]>;
  /** Tournament by id, or undefined. */
  get(id: string): Promise<Tournament | undefined>;
  /** Create a tournament with a fresh uuid; fields arrive pre-validated. */
  create(input: {
    name: string;
    startsAt: string | null;
    endsAt: string | null;
    status: TournamentStatus;
  }): Promise<Tournament>;
  /** Patch name/dates/status. */
  update(
    id: string,
    patch: { name?: string; startsAt?: string | null; endsAt?: string | null; status?: TournamentStatus },
  ): Promise<Tournament>;
  /** Delete a tournament. Emptiness and the last-tournament guard are the
   * SERVICE's checks. */
  remove(id: string): Promise<void>;
}

/**
 * Group registry - first-class entity, admin-created, scoped to a tournament.
 * Teams reference a group by id. Group ids stay GLOBALLY unique, so
 * id-addressed reads need no tournament.
 */
export interface GroupRepository {
  /** A tournament's groups in stable creation order (createdAt, then id). */
  list(tournamentId: string): Promise<Group[]>;
  /** Group by id, or undefined. */
  get(id: string): Promise<Group | undefined>;
  /** Raw stored form (incl. tournamentId) for service-side scoping logic. */
  getStored(id: string): Promise<StoredGroup | undefined>;
  /** How many groups a tournament has (tournament-removal guard). */
  countByTournament(tournamentId: string): Promise<number>;
  /** Create a group with a fresh uuid; name arrives pre-validated. */
  create(tournamentId: string, name: string): Promise<Group>;
  /** Rename a group (cosmetic - id-based references stay valid). */
  update(id: string, name: string): Promise<Group>;
  /** Delete a group. Emptiness (no member teams) is the SERVICE's guard. */
  remove(id: string): Promise<void>;
}

/**
 * Team registry - the single source of truth for team identity and group
 * membership, scoped to a tournament (teams never move between tournaments).
 * Teams are created WITHOUT a group and added to one later, which stamps
 * `groupAddedAt` (the seeding key). Team ids stay GLOBALLY unique.
 */
export interface TeamRepository {
  /** A tournament's teams as public DTOs (no groupAddedAt). */
  list(tournamentId: string): Promise<Team[]>;
  /** Server-only view carrying the seeding key, for bracket resolution. */
  listSeed(tournamentId: string): Promise<SeedTeam[]>;
  /** Public DTO by id, or undefined. */
  get(id: string): Promise<Team | undefined>;
  /** Raw stored form (incl. tournament + seeding key) for service logic. */
  getStored(id: string): Promise<StoredTeam | undefined>;
  /** How many teams currently sit in a group (max-per-group guard). */
  countInGroup(groupId: string): Promise<number>;
  /** How many teams a tournament has (tournament-removal guard). */
  countByTournament(tournamentId: string): Promise<number>;
  /** Create an UNASSIGNED team (groupId/groupAddedAt start null). */
  create(tournamentId: string, input: { name: string; shortName: string }): Promise<Team>;
  /** Rename a team (name and/or code). Membership is untouched. */
  update(id: string, patch: { name?: string; shortName?: string }): Promise<Team>;
  /** Set/clear a team's group. `groupAddedAt` is server-set here (null clears). */
  assign(id: string, groupId: string | null, groupAddedAt: string | null): Promise<Team>;
  /** Delete a team. Referential integrity (matches/players) is the SERVICE's
   * job - this is a plain store removal with persist-or-rollback. */
  remove(id: string): Promise<void>;
}

/**
 * Squad registry - players belong to a team by id. Purely descriptive (no
 * effect on standings/seeding). Jersey-number uniqueness within a team is the
 * SERVICE's guard (drivers may back it with a constraint additionally).
 */
export interface PlayerRepository {
  /** Every player across all teams (rides the roster snapshot). */
  list(): Promise<Player[]>;
  /** Player by id, or undefined. */
  get(id: string): Promise<Player | undefined>;
  /** All players of one team (a squad), unordered - display sorting is client-side. */
  listByTeam(teamId: string): Promise<Player[]>;
  /** All players across the given teams, one pass over the store. The roster
   * snapshot uses this instead of list() + a JS filter, so the whole collection
   * isn't copied when only one tournament's teams are needed. Unordered. */
  listByTeams(teamIds: Set<string>): Promise<Player[]>;
  /** Squad size of a team. */
  countInTeam(teamId: string): Promise<number>;
  /** Is a jersey number already taken in a team (optionally ignoring one player)? */
  numberInUse(teamId: string, number: number, exceptId?: string): Promise<boolean>;
  /** Insert a player with a fresh uuid. */
  create(input: { teamId: string; name: string; number: number | null; position: string | null }): Promise<Player>;
  /** Patch name/number/position; team membership is immutable (delete + re-add). */
  update(id: string, patch: { name?: string; number?: number | null; position?: string | null }): Promise<Player>;
  /** Delete one player; throws NOT_FOUND for an unknown id. */
  remove(id: string): Promise<void>;
  /** Cascade: drop all players of a team (used when the team is deleted). */
  removeByTeam(teamId: string): Promise<void>;
}

/** Persistence seam for group matches. Matches are tournament-scoped; ids stay
 * GLOBALLY unique. Reads return RESOLVED DTOs (teams embedded) - one joined
 * read per call, never a lookup per row. */
export interface MatchRepository {
  /** A tournament's resolved matches (teams embedded) for read/broadcast. */
  list(tournamentId: string): Promise<Match[]>;
  /** One resolved match, or undefined. */
  get(id: string): Promise<Match | undefined>;
  /** Raw stored form for mutation logic. */
  getStored(id: string): Promise<StoredMatch | undefined>;
  /** Insert-or-replace by id (rev bumping is the service's responsibility).
   * Returns the RESOLVED match so callers never re-derive the wire DTO. */
  save(match: StoredMatch): Promise<Match>;
  /** Delete a match; throws NOT_FOUND for an unknown id. */
  remove(id: string): Promise<void>;
  /** How many stored matches reference a given team (referential-integrity guard). */
  countByTeam(teamId: string): Promise<number>;
  /** How many matches a tournament has (tournament-removal guard). */
  countByTournament(tournamentId: string): Promise<number>;
}

/**
 * Account store - PLAIN CRUD plus the queries the domain guards need. All
 * domain rules (username uniqueness, user cap, self-lockout, last-admin) are
 * enforced by services INSIDE the mutation lock, not here.
 */
export interface UserRepository {
  /** Case-insensitive lookup (login path). */
  findByUsername(username: string): Promise<StoredUser | undefined>;
  /** Lookup by id (per-request re-load that makes revocation instant). */
  getById(id: string): Promise<StoredUser | undefined>;
  /** Every stored user, server-only shape - callers project before responding. */
  listAll(): Promise<StoredUser[]>;
  /** Total stored accounts (registration-cap guard input). */
  count(): Promise<number>;
  /** Admins that could still log in (last-admin guard input). */
  countActiveAdmins(): Promise<number>;
  /** Plain insert with a fresh uuid; active starts true. Uniqueness is the
   * SERVICE's guard (a driver may additionally enforce it). */
  create(input: { username: string; passwordHash: string; role: Role }): Promise<StoredUser>;
  /** Plain patch of active/role; throws NOT_FOUND for an unknown id. */
  update(id: string, patch: { active?: boolean; role?: Role }): Promise<StoredUser>;
  /** Plain delete; throws NOT_FOUND for an unknown id. */
  remove(id: string): Promise<void>;
}

/**
 * Bracket store - per tournament, a partial map of slotId -> result (the key
 * is the (tournamentId, slot) pair). Deliberately narrow: aside from the
 * sanctioned per-side overrides (validated in the service), it can only set a
 * slot's RESULT, so the seed/format integrity can't be bypassed here. Which
 * slots exist is a pure function of the group setup, computed elsewhere.
 */
export interface BracketRepository {
  /** A tournament's written slot results (partial), for the pure resolver. */
  results(tournamentId: string): Promise<Partial<Record<BracketSlotId, BracketResult>>>;
  /** Stored result for a slot, or an empty scheduled result. */
  get(tournamentId: string, slot: BracketSlotId): Promise<BracketResult>;
  /** Insert-or-replace one slot's result (slot validity is the service's check). */
  save(tournamentId: string, slot: BracketSlotId, result: BracketResult): Promise<void>;
  /** Clear a tournament's slots (needed before its bracket size can change). */
  reset(tournamentId: string): Promise<void>;
  /** True once the tournament's knockout was touched: any slot off `scheduled`
   * OR any pinned participant. Both couple bracket state to the group setup,
   * so both must lock group/team mutations until an explicit reset. */
  hasStarted(tournamentId: string): Promise<boolean>;
  /** Whether any slot row exists at all (tournament-removal guard). */
  hasAny(tournamentId: string): Promise<boolean>;
}

/** Everything a storage driver provides. One instance per process. */
export interface Storage {
  tournaments: TournamentRepository;
  groups: GroupRepository;
  teams: TeamRepository;
  players: PlayerRepository;
  matches: MatchRepository;
  users: UserRepository;
  bracket: BracketRepository;
}

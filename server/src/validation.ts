import { z } from 'zod';
import { AppError, AppErrorCode } from './errors.js';
import type {
  LoginRequest,
  RegisterRequest,
  CreateTournamentRequest,
  UpdateTournamentRequest,
  CreateTeamRequest,
  CreateGroupRequest,
  AssignTeamRequest,
  CreatePlayerRequest,
  UpdatePlayerRequest,
  CreateMatchRequest,
  UpdateBracketRequest,
  UpdateUserRequest,
} from '../../shared/types.js';
import { exportSchemaVersion, type TournamentExport } from './services/export.js';

// Zod schemas live on the server - the trust boundary. Every mutation body is
// validated here; unknown keys are stripped, scores are bounded integers.

/** Court/pitch label - untrusted free text stored and broadcast to all clients,
 * so it is length- and charset-bounded. Empty is allowed. */
const fieldLabel = z
  .string()
  .trim()
  .max(40, 'Field name is too long.')
  .regex(/^[\p{L}\p{N} .'\-]*$/u, 'Field contains invalid characters.');

/** Login body. Bounds only - no format hints that would aid enumeration. */
export const loginSchema = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(128),
  })
  .strict();

// Names a stranger must not be able to squat (impersonation / collision with
// seeded operators). Checked case-insensitively.
export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'mod',
  'moderator',
  'api',
  'viewer',
  'null',
  'undefined',
]);

/** Self-signup body: username/password rules plus a reserved-name blocklist. */
export const registerSchema = z
  .object({
    // NOTE: no `role` field - the server always assigns 'user'. Accepting a
    // role here would be a privilege-escalation hole.
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters.')
      .max(32, 'Username must be at most 32 characters.')
      .regex(/^[a-z0-9_]+$/i, 'Only letters, digits and underscore are allowed.'),
    // Max 72 bytes: bcrypt silently truncates beyond that.
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(72, 'Password must be at most 72 characters.'),
  })
  .strict()
  .refine((v) => !RESERVED_USERNAMES.has(v.username.toLowerCase()), {
    path: ['username'],
    message: 'This username is reserved.',
  })
  .refine((v) => v.password.toLowerCase() !== v.username.toLowerCase(), {
    path: ['password'],
    message: 'Password must not equal the username.',
  });

const scoreField = z.number().int().min(0).max(99);

/** PATCH body for a full score/status set (admin editing a result), plus the
 * schedule bits (kick-off, court) so generated placeholder times are fixable. */
export const updateMatchSchema = z
  .object({
    homeScore: scoreField.optional(),
    awayScore: scoreField.optional(),
    status: z.enum(['scheduled', 'live', 'finished']).optional(),
    startsAt: z.string().datetime({ message: 'startsAt must be an ISO datetime.' }).optional(),
    field: fieldLabel.optional(),
    /** Optimistic-concurrency guard: reject if it doesn't match server rev. */
    expectedRev: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update.' });

/** POST body for the +goal / -goal quick action. */
export const goalSchema = z
  .object({
    team: z.enum(['home', 'away']),
    delta: z.union([z.literal(1), z.literal(-1)]),
    expectedRev: z.number().int().min(1).optional(),
  })
  .strict();

// ---- Admin: tournaments ----

const tournamentName = z
  .string()
  .trim()
  .min(2, 'Tournament name must be at least 2 characters.')
  .max(60, 'Tournament name must be at most 60 characters.')
  .regex(/^[\p{L}\p{N} .'\-]+$/u, 'Tournament name contains invalid characters.');

/** Planned tournament dates are DATE-ONLY (YYYY-MM-DD) - they describe a
 * period of the year, not a kickoff instant, so no time/zone component. */
const tournamentDate = z.string().date('Must be a date (YYYY-MM-DD).').nullable();

const tournamentStatus = z.enum(['upcoming', 'active', 'finished']);

/** Create-tournament body. Status defaults to `upcoming` in the service. */
export const createTournamentSchema = z
  .object({
    name: tournamentName,
    startsAt: tournamentDate.optional(),
    endsAt: tournamentDate.optional(),
    status: tournamentStatus.optional(),
  })
  .strict()
  .refine((v) => v.startsAt == null || v.endsAt == null || v.startsAt <= v.endsAt, {
    path: ['endsAt'],
    message: 'End date must not be before the start date.',
  });

/** Patch-tournament body: any subset of name/dates/status, but not empty.
 * NOTE: no cross-field date check here - a partial patch cannot see the
 * stored counterpart, and planned dates are informational anyway. */
export const updateTournamentSchema = z
  .object({
    name: tournamentName.optional(),
    startsAt: tournamentDate.optional(),
    endsAt: tournamentDate.optional(),
    status: tournamentStatus.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update.' });

// ---- Admin: teams & matches ----

// Team display name + short code. The charset allowlist blunts stored-XSS via
// names that render in every client. Shared by create (both required) and
// rename (each field optional).
const teamName = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(40, 'Name must be at most 40 characters.')
  .regex(/^[\p{L}\p{N} .'\-]+$/u, 'Name contains invalid characters.');
const teamShortName = z
  .string()
  .trim()
  .min(2, 'Short name must be at least 2 characters.')
  .max(5, 'Short name must be at most 5 characters.')
  .regex(/^[\p{L}\p{N}]+$/u, 'Short name must be letters/digits only.');

// A team is created WITHOUT a group; group is assigned separately.
export const createTeamSchema = z
  .object({ name: teamName, shortName: teamShortName })
  .strict();

// Rename a team (name and/or code). id-based references stay intact, so this is
// safe. Group membership is changed via the separate assign endpoint.
export const updateTeamSchema = z
  .object({ name: teamName.optional(), shortName: teamShortName.optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.shortName !== undefined, { message: 'Nothing to update.' });

const groupName = z
  .string()
  .trim()
  .min(2, 'Group name must be at least 2 characters.')
  .max(40, 'Group name must be at most 40 characters.')
  .regex(/^[\p{L}\p{N} .'\-]+$/u, 'Group name contains invalid characters.');

/** Create/rename-group body: just a bounded, charset-limited name. */
export const createGroupSchema = z.object({ name: groupName }).strict();

// Add/move a team to a group, or remove it (groupId: null). NOTE: no
// `groupAddedAt` - the seeding key is stamped server-side, never client-supplied.
export const assignTeamSchema = z
  .object({
    groupId: z.string().min(1).max(64).nullable(),
  })
  .strict();

const playerName = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(40, 'Name must be at most 40 characters.')
  .regex(/^[\p{L}\p{N} .'\-]+$/u, 'Name contains invalid characters.');
const jerseyNumber = z.number().int().min(1, 'Number must be 1..99.').max(99, 'Number must be 1..99.').nullable();
const playerPosition = z
  .string()
  .trim()
  .max(20, 'Position is too long.')
  .regex(/^[\p{L}\p{N} .\-/]*$/u, 'Position contains invalid characters.')
  .nullable();

/** Add-player body. The owning team comes from the URL, never from here. */
export const createPlayerSchema = z
  .object({
    name: playerName,
    number: jerseyNumber.optional(),
    position: playerPosition.optional(),
  })
  .strict();

/** Edit-player body: any subset of name/number/position, but not empty. */
export const updatePlayerSchema = z
  .object({
    name: playerName.optional(),
    number: jerseyNumber.optional(),
    position: playerPosition.optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.number !== undefined || v.position !== undefined, {
    message: 'Nothing to update.',
  });

// A group match is defined by two existing teams; its group is DERIVED from the
// teams (both must share one), never supplied here.
export const createMatchSchema = z
  .object({
    homeId: z.string().min(1).max(64),
    awayId: z.string().min(1).max(64),
    startsAt: z.string().datetime({ message: 'startsAt must be an ISO datetime.' }),
    field: fieldLabel,
  })
  .strict()
  .refine((v) => v.homeId !== v.awayId, { path: ['awayId'], message: 'A team cannot play itself.' });

// Admin write to one knockout slot. The slot comes from the URL. Participants
// are derived from the format; the override ids are the one sanctioned way to
// pin a side manually (existence and same-team rules enforced in the service).
// Tri-state: string pins, null clears back to derived, absent keeps.
/** Knockout-slot PATCH: partial result fields, schedule bits, per-side team
 * pins (overrides) and the optimistic-concurrency rev. The slot id is URL-only. */
export const updateBracketSchema = z
  .object({
    homeScore: scoreField.optional(),
    awayScore: scoreField.optional(),
    homePens: z.number().int().min(0).max(99).nullable().optional(),
    awayPens: z.number().int().min(0).max(99).nullable().optional(),
    status: z.enum(['scheduled', 'live', 'finished']).optional(),
    field: fieldLabel.optional(),
    startsAt: z.string().datetime().nullable().optional(),
    homeOverrideId: z.string().min(1).max(64).nullable().optional(),
    awayOverrideId: z.string().min(1).max(64).nullable().optional(),
    expectedRev: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update.' });

// ---- Admin: user management ----

// Strict allowlist - accepting anything else (e.g. passwordHash) would be a
// mass-assignment hole. Role change goes through this same guarded path.
export const updateUserSchema = z
  .object({
    active: z.boolean().optional(),
    role: z.enum(['admin', 'user']).optional(),
  })
  .strict()
  .refine((v) => v.active !== undefined || v.role !== undefined, {
    message: 'Nothing to update.',
  });

// Shared by every paginated admin listing - one named ceiling for both page
// and pageSize, so neither number drifts independently in a second schema.
const pagination = {
  maxPage: 100_000,
  maxPageSize: 100,
  defaultPageSize: 20,
};

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(pagination.maxPage).default(1),
  pageSize: z.coerce.number().int().min(1).max(pagination.maxPageSize).default(pagination.defaultPageSize),
});

/** Admin user-list query: optional username filter + bounded pagination. */
export const listUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(64).optional(),
});

/** Admin audit-trail query: bounded pagination, newest first. */
export const listAuditQuerySchema = paginationQuerySchema;

// ---- Admin: tournament import ----

// Shared per-slot result shape (bracket record values below). Mirrors
// updateBracketSchema's fields but every field is REQUIRED (a full stored
// slot, not a partial patch).
const bracketResultSchema = z
  .object({
    homeScore: scoreField,
    awayScore: scoreField,
    homePens: z.number().int().min(0).max(99).nullable(),
    awayPens: z.number().int().min(0).max(99).nullable(),
    status: z.enum(['scheduled', 'live', 'finished']),
    field: fieldLabel,
    startsAt: z.string().datetime().nullable(),
    homeOverrideId: z.string().min(1).max(64).nullable(),
    awayOverrideId: z.string().min(1).max(64).nullable(),
    rev: z.number().int().min(1),
  })
  .strict();

/**
 * A whole `TournamentExport` file as untrusted input (import). `.strict()` at
 * every level - an unknown key anywhere (including a top-level "bonus"
 * collection) rejects the whole file, unlike mutation bodies where unknown
 * keys are stripped. Structural/charset checks only: cross-item rules
 * (in-file id references resolve, `homeId !== awayId`, jersey-number
 * uniqueness, bracket size/slot-key validity) are the graph pass in
 * services/import.ts, which needs the whole parsed file at once.
 */
export const tournamentExportSchema = z
  .object({
    schemaVersion: z.literal(exportSchemaVersion),
    exportedAt: z.string().datetime({ message: 'exportedAt must be an ISO datetime.' }),
    tournament: z
      .object({
        id: z.string().min(1).max(64),
        name: tournamentName,
        startsAt: tournamentDate,
        endsAt: tournamentDate,
        status: tournamentStatus,
      })
      .strict(),
    groups: z.array(z.object({ id: z.string().min(1).max(64), name: groupName }).strict()),
    teams: z.array(
      z
        .object({
          id: z.string().min(1).max(64),
          name: teamName,
          shortName: teamShortName,
          groupId: z.string().min(1).max(64).nullable(),
          groupAddedAt: z.string().datetime().nullable(),
        })
        .strict(),
    ),
    players: z.array(
      z
        .object({
          id: z.string().min(1).max(64),
          teamId: z.string().min(1).max(64),
          name: playerName,
          number: jerseyNumber,
          position: playerPosition,
        })
        .strict(),
    ),
    matches: z.array(
      z
        .object({
          id: z.string().min(1).max(64),
          tournamentId: z.string().min(1).max(64),
          group: z.string().min(1).max(64),
          homeId: z.string().min(1).max(64),
          awayId: z.string().min(1).max(64),
          homeScore: scoreField,
          awayScore: scoreField,
          status: z.enum(['scheduled', 'live', 'finished']),
          startsAt: z.string().datetime({ message: 'startsAt must be an ISO datetime.' }),
          field: fieldLabel,
          rev: z.number().int().min(1),
        })
        .strict(),
    ),
    bracket: z.record(z.string(), bracketResultSchema.optional()),
  })
  .strict();

/**
 * Parse `input` against `schema`, returning the typed data, or throw a uniform
 * BAD_REQUEST (400) carrying the first issue's message (or `fallback` when zod
 * supplied none). Collapses the hand-rolled `safeParse + res.status(400).json`
 * envelope repeated across the routes; the throw rides the route's try/catch +
 * next(err) to the error middleware, so the wire shape is unchanged.
 */
export function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  fallback: string,
): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(AppErrorCode.BadRequest, result.error.issues[0]?.message ?? fallback, 400);
  }
  return result.data;
}

// Inferred input types - the schemas above are the single source of truth.
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
export type ListAuditQueryInput = z.infer<typeof listAuditQuerySchema>;
export type UpdateMatchInput = z.infer<typeof updateMatchSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type UpdateBracketInput = z.infer<typeof updateBracketSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type AssignTeamInput = z.infer<typeof assignTeamSchema>;
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;
export type TournamentExportInput = z.infer<typeof tournamentExportSchema>;

// ---- Drift guards ----
//
// The zod schemas above are the runtime trust boundary; the `XxxRequest`
// interfaces in shared/types.ts are the compile-time wire contract the client
// also imports. They duplicate each other's shape, so this block pins them
// together: each schema's inferred shape must EXACTLY match its shared type
// (bidirectional - catches a field forgotten on either side, not just a type
// mismatch). `Eq` is `true` only on an exact match; `_assert<Eq<...>>(true)`
// then fails to compile on drift (the `T extends true` constraint rejects the
// `false`). NOTE: updateTeam/updateMatch/goal/listUsers have no shared request
// type yet, so they are not bound here.
type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function _assert<T extends true>(value: T): T {
  return value;
}
_assert<Eq<z.infer<typeof loginSchema>, LoginRequest>>(true);
_assert<Eq<z.infer<typeof registerSchema>, RegisterRequest>>(true);
_assert<Eq<z.infer<typeof createTournamentSchema>, CreateTournamentRequest>>(true);
_assert<Eq<z.infer<typeof updateTournamentSchema>, UpdateTournamentRequest>>(true);
_assert<Eq<z.infer<typeof createTeamSchema>, CreateTeamRequest>>(true);
_assert<Eq<z.infer<typeof createGroupSchema>, CreateGroupRequest>>(true);
_assert<Eq<z.infer<typeof assignTeamSchema>, AssignTeamRequest>>(true);
_assert<Eq<z.infer<typeof createPlayerSchema>, CreatePlayerRequest>>(true);
_assert<Eq<z.infer<typeof updatePlayerSchema>, UpdatePlayerRequest>>(true);
_assert<Eq<z.infer<typeof createMatchSchema>, CreateMatchRequest>>(true);
_assert<Eq<z.infer<typeof updateBracketSchema>, UpdateBracketRequest>>(true);
_assert<Eq<z.infer<typeof updateUserSchema>, UpdateUserRequest>>(true);
_assert<Eq<z.infer<typeof tournamentExportSchema>, TournamentExport>>(true);

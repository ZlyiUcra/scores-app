import { z } from 'zod';

// Zod schemas live on the server — the trust boundary. Every mutation body is
// validated here; unknown keys are stripped, scores are bounded integers.

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

export const registerSchema = z
  .object({
    // NOTE: no `role` field — the server always assigns 'user'. Accepting a
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

/** PATCH body for a full score/status set (admin editing a result). */
export const updateMatchSchema = z
  .object({
    homeScore: scoreField.optional(),
    awayScore: scoreField.optional(),
    status: z.enum(['scheduled', 'live', 'finished']).optional(),
    minute: z.number().int().min(0).max(130).optional(),
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

// ---- Admin: teams & matches ----

export const createTeamSchema = z
  .object({
    // Charset allowlist blunts stored-XSS via names that render in every client.
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters.')
      .max(40, 'Name must be at most 40 characters.')
      .regex(/^[\p{L}\p{N} .'\-]+$/u, 'Name contains invalid characters.'),
    shortName: z
      .string()
      .trim()
      .min(2, 'Short name must be at least 2 characters.')
      .max(5, 'Short name must be at most 5 characters.')
      .regex(/^[\p{L}\p{N}]+$/u, 'Short name must be letters/digits only.'),
  })
  .strict();

export const createMatchSchema = z
  .object({
    homeId: z.string().min(1).max(64),
    awayId: z.string().min(1).max(64),
    group: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(/^[\p{L}\p{N} \-]+$/u, 'Group contains invalid characters.'),
    startsAt: z.string().datetime({ message: 'startsAt must be an ISO datetime.' }),
  })
  .strict()
  .refine((v) => v.homeId !== v.awayId, { path: ['awayId'], message: 'A team cannot play itself.' });

// ---- Admin: user management ----

// Strict allowlist — accepting anything else (e.g. passwordHash) would be a
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

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
export type UpdateMatchInput = z.infer<typeof updateMatchSchema>;
export type GoalInput = z.infer<typeof goalSchema>;

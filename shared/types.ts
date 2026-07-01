// Shared domain types — imported by BOTH client and server so the wire
// contract has a single source of truth. Runtime validation (Zod) lives on
// the server (the trust boundary); these are compile-time types only.

export type Role = 'admin' | 'user';

export type MatchStatus = 'scheduled' | 'live' | 'finished';

export interface Team {
  id: string;
  name: string;
  shortName: string;
}

export interface Match {
  id: string;
  group: string;
  home: Team;
  away: Team;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  /** Match clock in minutes (0..120). Only meaningful while `live`. */
  minute: number;
  /** ISO timestamp of scheduled kickoff. */
  startsAt: string;
  /** Monotonic revision. Bumped on every mutation; clients drop stale events. */
  rev: number;
}

/** Compact diff broadcast over the socket on every mutation (not the full Match). */
export interface MatchUpdate {
  matchId: string;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  minute: number;
  rev: number;
}

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

/** Admin-panel projection of a user. Never carries passwordHash. */
export interface AdminUserView {
  id: string;
  username: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

/** Generic paginated list envelope, reused by admin listings. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- REST payloads ----

export interface LoginRequest {
  username: string;
  password: string;
}

// Registration never carries a `role` — the server always assigns 'user'.
export interface RegisterRequest {
  username: string;
  password: string;
}

export interface CreateTeamRequest {
  name: string;
  shortName: string;
}

// A match is defined by two existing teams (by id) — never free-text, so the
// same team stays a single identity across the tournament.
export interface CreateMatchRequest {
  homeId: string;
  awayId: string;
  group: string;
  startsAt: string;
}

// Strict allowlist for admin user edits — no other fields are accepted.
export interface UpdateUserRequest {
  active?: boolean;
  role?: Role;
}

export interface ApiError {
  error: { code: string; message: string };
}

// ---- Socket event names & payload map ----

export const SOCKET_EVENTS = {
  /** server -> client: a match changed (compact diff) */
  matchUpdate: 'match:update',
  /** server -> client: full snapshot sent right after (re)connect */
  matchSnapshot: 'match:snapshot',
  /** server -> client: an admin created a new match (full object) */
  matchCreated: 'match:created',
  /** server -> client: an admin removed a match */
  matchRemoved: 'match:removed',
} as const;

export interface MatchRemoved {
  matchId: string;
}

export interface ServerToClientEvents {
  'match:update': (payload: MatchUpdate) => void;
  'match:snapshot': (payload: Match[]) => void;
  'match:created': (payload: Match) => void;
  'match:removed': (payload: MatchRemoved) => void;
}

// Clients never mutate over the socket — writes go through authorized REST.
export interface ClientToServerEvents {}

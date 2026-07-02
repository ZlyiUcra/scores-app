// Shared domain types — imported by BOTH client and server so the wire
// contract has a single source of truth. Runtime validation (Zod) lives on
// the server (the trust boundary); these are compile-time types only.

export type Role = 'admin' | 'user';

export type MatchStatus = 'scheduled' | 'live' | 'finished';

/** Tournament phase. Group matches live in the match store; knockout matches
 * live in the bracket store (slot-keyed, teams resolved lazily). */
export type Stage = 'group' | 'knockout';

/** Knockout round. String-union (consistent with `MatchStatus`/`Role`); the
 * label is DERIVED from a round's team-count by `roundName()` — no numeric enum
 * on the wire. `r16` is the largest supported (bracket size capped at 16). */
export type Round = 'r16' | 'qf' | 'sf' | 'final' | 'third';

/** A tournament group — first-class entity now (admin-created). */
export interface Group {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  /** The group this team was ADDED to, or null if unassigned. Membership is a
   * simple FK (a team is in at most one group). The seeding key `groupAddedAt`
   * is server-only and never leaves the server. */
  groupId: string | null;
}

/** A squad member. Belongs to one team. Purely descriptive — players do NOT
 * affect standings, seeding or the bracket. */
export interface Player {
  id: string;
  teamId: string;
  name: string;
  /** Jersey number (1..99), optional; unique within a team when present. */
  number: number | null;
  /** Free-form position label (e.g. "GK", "Defender"), optional. */
  position: string | null;
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
  /** Court/pitch label, e.g. "Campo 1". */
  field: string;
  /** Monotonic revision. Bumped on every mutation; clients drop stale events. */
  rev: number;
}

/** Compact diff broadcast over the socket on every mutation (not the full Match).
 * Schedule fields ride along only when that edit actually changed them. */
export interface MatchUpdate {
  matchId: string;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  minute: number;
  startsAt?: string;
  field?: string;
  rev: number;
}

// ---- Standings (derived — never stored, never broadcast) ----

/** One team's row in a group table. Computed from finished matches only. */
export interface StandingRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /** 1-based position within the group. */
  rank: number;
}

export interface GroupTable {
  group: Group;
  rows: StandingRow[];
}

// ---- Knockout bracket ----

/**
 * Dynamic slot identifier. Encodes the round's team-count so ids stay stable
 * when total bracket size changes: `R{roundSize}M{index}` (e.g. `R8M0`) plus
 * the special `THIRD`. Not a fixed union anymore — bracket size is derived.
 */
export type BracketSlotId = string;

/**
 * A structured reference to whatever fills a slot side before it is known.
 * Machine-readable only — the client renders a localized label from it, so we
 * never parse a display string. Seeding is global (all qualifiers ordered by
 * when they were added to a group), so a first-round side is a `qualifier`
 * index; later rounds reference an earlier slot's winner/loser.
 */
export type SeedRef =
  | { kind: 'qualifier'; index: number } // 0-based position in the seeded qualifier list
  | { kind: 'winner'; slot: BracketSlotId } // winner of an earlier slot
  | { kind: 'loser'; slot: BracketSlotId }; // loser of an earlier slot

/** A slot side is either a resolved team or a still-symbolic seed. `manual`
 * marks a side pinned by an admin override rather than derived from results. */
export type BracketParticipant = { team: Team; manual?: boolean } | { seed: SeedRef };

/** Resolved knockout match DTO (participants embedded or left symbolic). */
export interface BracketMatch {
  slot: BracketSlotId;
  round: Round;
  home: BracketParticipant;
  away: BracketParticipant;
  homeScore: number;
  awayScore: number;
  homePens: number | null;
  awayPens: number | null;
  status: MatchStatus;
  field: string;
  startsAt: string | null;
  rev: number;
}

/** Why a bracket cannot be formed from the current groups (i18n key). */
export type BracketUnformableReason =
  | 'noGroups'
  | 'groupTooSmall' // a group has fewer than 2 teams
  | 'notEnoughThirds' // can't reach a power of 2 with available third places
  | 'tooManyGroups'; // computed size would exceed the supported cap (16)

/**
 * The whole knockout view: whether a bracket can be formed at all, its size,
 * and the resolved matches (empty when not formable). Sides stay symbolic until
 * every group is complete.
 */
export interface BracketView {
  formable: boolean;
  reason: BracketUnformableReason | null;
  size: number;
  matches: BracketMatch[];
}

/** Public roster: groups + teams (with membership) + players (squads). Drives
 * client standings, the admin assignment UI and the public squads view. */
export interface Roster {
  groups: Group[];
  teams: Team[];
  players: Player[];
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

// A team is created WITHOUT a group; it is added to a group as a separate step.
export interface CreateTeamRequest {
  name: string;
  shortName: string;
}

export interface CreateGroupRequest {
  name: string;
}

// Add/move a team into a group, or remove it (groupId: null). The server stamps
// the seeding key (groupAddedAt) itself — clients never supply it.
export interface AssignTeamRequest {
  groupId: string | null;
}

// The team a player belongs to comes from the URL, never the body.
export interface CreatePlayerRequest {
  name: string;
  number?: number | null;
  position?: string | null;
}

export interface UpdatePlayerRequest {
  name?: string;
  number?: number | null;
  position?: string | null;
}

// A match is defined by two existing teams (by id) — never free-text, so the
// same team stays a single identity across the tournament. The group is NOT
// supplied: it is derived from the teams (both must share one group).
export interface CreateMatchRequest {
  homeId: string;
  awayId: string;
  startsAt: string;
  field: string;
}

/** Admin write to a single knockout slot. Participants are normally derived
 * from the format/results; the override ids are the one sanctioned way to pin
 * a side manually (walkover, disqualification, correction). Tri-state per
 * side: string pins, null clears back to derived, absent keeps. */
export interface UpdateBracketRequest {
  homeScore?: number;
  awayScore?: number;
  /** Penalty shootout result, required to break a level knockout tie. */
  homePens?: number | null;
  awayPens?: number | null;
  status?: MatchStatus;
  field?: string;
  startsAt?: string | null;
  homeOverrideId?: string | null;
  awayOverrideId?: string | null;
  expectedRev?: number;
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
  /** server -> client: the full knockout view. Sent on connect and re-sent
   * whenever the bracket can change (a group completes, or a knockout result is
   * entered). Idempotent — client replaces wholesale. */
  bracketSnapshot: 'bracket:snapshot',
  /** server -> client: groups + teams roster. Sent on connect and whenever a
   * team/group/membership changes, so client standings stay correct. */
  rosterSnapshot: 'roster:snapshot',
} as const;

export interface MatchRemoved {
  matchId: string;
}

export interface ServerToClientEvents {
  'match:update': (payload: MatchUpdate) => void;
  'match:snapshot': (payload: Match[]) => void;
  'match:created': (payload: Match) => void;
  'match:removed': (payload: MatchRemoved) => void;
  'bracket:snapshot': (payload: BracketView) => void;
  'roster:snapshot': (payload: Roster) => void;
}

// Clients never mutate over the socket — writes go through authorized REST.
export interface ClientToServerEvents {}

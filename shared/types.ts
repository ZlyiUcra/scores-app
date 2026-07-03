// Shared domain types — imported by BOTH client and server so the wire
// contract has a single source of truth. Runtime validation (Zod) lives on
// the server (the trust boundary); these are compile-time types only.

export type Role = 'admin' | 'user';

/** Lifecycle of any game, group or knockout. */
export type MatchStatus = 'scheduled' | 'live' | 'finished';

/** Tournament phase. Group matches live in the match store; knockout matches
 * live in the bracket store (slot-keyed, teams resolved lazily). */
export type Stage = 'group' | 'knockout';

/** Knockout round. String-union (consistent with `MatchStatus`/`Role`); the
 * label is DERIVED from a round's team-count by `roundName()` — no numeric enum
 * on the wire. `r32` is the largest supported (bracket size capped at 32). */
export type Round = 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'third';

/** Tournament lifecycle. Set explicitly by an admin — dates are informational
 * (a tournament may start late or run over), the status is the truth. */
export type TournamentStatus = 'upcoming' | 'active' | 'finished';

/** A tournament — the top-level container every group, team, match and
 * bracket slot belongs to. Groups/teams/matches never move between
 * tournaments; ids stay globally unique so entity URLs need no tournament. */
export interface Tournament {
  id: string;
  name: string;
  /** ISO date (YYYY-MM-DD) the tournament is planned to start, or null. */
  startsAt: string | null;
  /** ISO date the tournament is planned to end, or null. */
  endsAt: string | null;
  status: TournamentStatus;
}

/** A tournament group — first-class entity now (admin-created). */
export interface Group {
  id: string;
  name: string;
}

/** A tournament team — one identity across groups, matches and the bracket. */
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

/** A group-stage game as it travels the wire: teams embedded (resolved by the
 * server from stored ids), so clients never join by hand. */
export interface Match {
  id: string;
  group: string;
  home: Team;
  away: Team;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
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

/** One group's computed standings, rows already sorted by rank. */
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
 * marks a side pinned by an admin override rather than derived from results.
 * A symbolic seed may carry `projected` — the team CURRENTLY holding that
 * position per the live group standings (preview views only); it disappears
 * once the side resolves for real. */
export type BracketParticipant = { team: Team; manual?: boolean } | { seed: SeedRef; projected?: Team };

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
  | 'tooManyGroups'; // computed size would exceed the supported cap (32)

/**
 * The whole knockout view: whether a bracket can be formed at all, its size,
 * and the resolved matches (empty when not formable). Sides resolve for real
 * only when every group is complete; before that a view built with the preview
 * option annotates the symbolic seeds with `projected` teams.
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

/** The session's own identity (login/me responses). Never anyone else's. */
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

// Also reused as the rename-group PATCH body (same single field).
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

// Partial edit; `null` clears an optional field, absence keeps it. The team is
// not editable — delete and re-add to move a player.
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

/** Uniform error envelope every non-2xx REST response carries. */
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

/** Payload of match:removed — the id is all a client needs to drop the row. */
export interface MatchRemoved {
  matchId: string;
}

/** Typed socket.io event map (see SOCKET_EVENTS for when each fires). */
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

import type { AdminUserView, AuthUser, Match, Team, Tournament } from '../../../shared/types.js';
import type { SeedTeam } from '../../../shared/tournament.js';
import { AppError } from '../errors.js';
import type { StoredMatch, StoredTeam, StoredTournament, StoredUser } from './contracts.js';

// Driver-neutral DTO shaping. Every storage driver funnels its rows through
// these, so the wire shapes have exactly ONE source of truth — a new driver
// can never fork what a Team or a resolved Match looks like.

/** Public team DTO (drops the server-only seeding key). */
export function toTeamDto(t: StoredTeam): Team {
  return { id: t.id, name: t.name, shortName: t.shortName, groupId: t.groupId };
}

/** Server-only seeding view of a team. */
export function toSeedTeam(t: StoredTeam): SeedTeam {
  return { ...toTeamDto(t), groupAddedAt: t.groupAddedAt };
}

/** Public tournament DTO (drops createdAt — an internal ordering key). */
export function toTournamentDto(t: StoredTournament): Tournament {
  return { id: t.id, name: t.name, startsAt: t.startsAt, endsAt: t.endsAt, status: t.status };
}

/** Public/session projection of an account — never leaks passwordHash. */
export function toPublicUser(u: StoredUser): AuthUser {
  return { id: u.id, username: u.username, role: u.role };
}

/** Admin-panel projection — adds createdAt/active but still no passwordHash. */
export function toAdminUserView(u: StoredUser): AdminUserView {
  return { id: u.id, username: u.username, role: u.role, active: u.active, createdAt: u.createdAt };
}

/** Canonical form for uniqueness checks: usernames are case-insensitive. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Shape a stored match into the public Match DTO (teams embedded). The team
 * lookup is the driver's: a Map hit in the sqlite driver, the joined columns
 * of a single SELECT in a SQL driver — never a per-row query.
 */
export function resolveMatch(m: StoredMatch, getTeam: (id: string) => Team | undefined): Match {
  const home = getTeam(m.homeId);
  const away = getTeam(m.awayId);
  if (!home || !away) {
    // Should never happen: team deletion is blocked while referenced.
    throw new AppError('DATA_INTEGRITY', `Match ${m.id} references a missing team.`, 500);
  }
  return {
    id: m.id,
    group: m.group,
    home,
    away,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.status,
    startsAt: m.startsAt,
    field: m.field,
    rev: m.rev,
  };
}

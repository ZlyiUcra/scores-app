import type {
  AdminUserView,
  AssignTeamRequest,
  AuditLogEntry,
  BracketSlotId,
  BracketView,
  CreateGroupRequest,
  CreateMatchRequest,
  CreatePlayerRequest,
  CreateTeamRequest,
  CreateTournamentRequest,
  Group,
  Match,
  Paginated,
  Player,
  Role,
  Team,
  Tournament,
  UpdateBracketRequest,
  UpdatePlayerRequest,
  UpdateTournamentRequest,
  UpdateUserRequest,
} from '../../../shared/types';
import { request } from './client';

/** `?tournamentId=` suffix for the endpoints that create into / list from a
 * specific tournament (id-addressed mutations derive it server-side). */
function scope(tournamentId: string): string {
  return `?tournamentId=${encodeURIComponent(tournamentId)}`;
}

/** Admin-only endpoints (server enforces requireAdmin on the /api/admin router). */
export const adminApi = {
  listUsers: (params: { q?: string; page: number; pageSize: number }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    qs.set('page', String(params.page));
    qs.set('pageSize', String(params.pageSize));
    return request<Paginated<AdminUserView>>(`/admin/users?${qs.toString()}`);
  },

  updateUser: (id: string, patch: UpdateUserRequest) =>
    request<{ user: AdminUserView }>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteUser: (id: string) =>
    request<{ ok: true }>(`/admin/users/${id}`, { method: 'DELETE' }),

  // Tournament lifecycle. Deletion is server-guarded: only an empty
  // tournament can go, and never the last one.
  createTournament: (input: CreateTournamentRequest) =>
    request<{ tournament: Tournament }>('/admin/tournaments', { method: 'POST', body: JSON.stringify(input) }),

  updateTournament: (id: string, patch: UpdateTournamentRequest) =>
    request<{ tournament: Tournament }>(`/admin/tournaments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteTournament: (id: string) =>
    request<{ ok: true }>(`/admin/tournaments/${id}`, { method: 'DELETE' }),

  listTeams: (tournamentId: string) => request<{ teams: Team[] }>(`/admin/teams${scope(tournamentId)}`),

  listGroups: (tournamentId: string) => request<{ groups: Group[] }>(`/admin/groups${scope(tournamentId)}`),

  createGroup: (tournamentId: string, input: CreateGroupRequest) =>
    request<{ group: Group }>(`/admin/groups${scope(tournamentId)}`, { method: 'POST', body: JSON.stringify(input) }),

  updateGroup: (id: string, input: CreateGroupRequest) =>
    request<{ group: Group }>(`/admin/groups/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteGroup: (id: string) =>
    request<{ ok: true }>(`/admin/groups/${id}`, { method: 'DELETE' }),

  createTeam: (tournamentId: string, input: CreateTeamRequest) =>
    request<{ team: Team }>(`/admin/teams${scope(tournamentId)}`, { method: 'POST', body: JSON.stringify(input) }),

  // Rename a team (name and/or code).
  updateTeam: (id: string, patch: { name?: string; shortName?: string }) =>
    request<{ team: Team }>(`/admin/teams/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  // Add/move/remove a team's group (groupId: null clears it).
  assignTeamGroup: (id: string, input: AssignTeamRequest) =>
    request<{ team: Team }>(`/admin/teams/${id}/group`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteTeam: (id: string) =>
    request<{ ok: true }>(`/admin/teams/${id}`, { method: 'DELETE' }),

  // Add a player to a team (the team comes from the URL, never the body).
  createPlayer: (teamId: string, input: CreatePlayerRequest) =>
    request<{ player: Player }>(`/admin/teams/${teamId}/players`, { method: 'POST', body: JSON.stringify(input) }),

  updatePlayer: (id: string, patch: UpdatePlayerRequest) =>
    request<{ player: Player }>(`/admin/players/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deletePlayer: (id: string) =>
    request<{ ok: true }>(`/admin/players/${id}`, { method: 'DELETE' }),

  createMatch: (input: CreateMatchRequest) =>
    request<{ match: Match }>('/admin/matches', { method: 'POST', body: JSON.stringify(input) }),

  // Round-robin top-up: creates only the group's missing pairings.
  generateFixtures: (groupId: string) =>
    request<{ matches: Match[] }>(`/admin/groups/${groupId}/fixtures`, { method: 'POST' }),

  deleteMatch: (id: string) =>
    request<{ ok: true }>(`/admin/matches/${id}`, { method: 'DELETE' }),

  // Knockout (server route is /api/bracket, admin-guarded). Slot ids repeat
  // across tournaments, so bracket writes always carry the tournament.
  updateBracketSlot: (tournamentId: string, slot: BracketSlotId, patch: UpdateBracketRequest) =>
    request<{ bracket: BracketView }>(`/bracket/${slot}?tournamentId=${encodeURIComponent(tournamentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  resetBracket: (tournamentId: string) =>
    request<{ bracket: BracketView }>(`/bracket/reset?tournamentId=${encodeURIComponent(tournamentId)}`, {
      method: 'POST',
    }),

  // Audit trail (newest first, server-bounded).
  listAudit: () => request<{ entries: AuditLogEntry[] }>('/admin/audit'),
};

export type { AdminUserView, Role };

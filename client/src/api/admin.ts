import type {
  AdminUserView,
  AssignTeamRequest,
  BracketSlotId,
  BracketView,
  CreateGroupRequest,
  CreateMatchRequest,
  CreatePlayerRequest,
  CreateTeamRequest,
  Group,
  Match,
  Paginated,
  Player,
  Role,
  Team,
  UpdateBracketRequest,
  UpdatePlayerRequest,
  UpdateUserRequest,
} from '../../../shared/types';
import { request } from './client';

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

  listTeams: () => request<{ teams: Team[] }>('/admin/teams'),

  listGroups: () => request<{ groups: Group[] }>('/admin/groups'),

  createGroup: (input: CreateGroupRequest) =>
    request<{ group: Group }>('/admin/groups', { method: 'POST', body: JSON.stringify(input) }),

  updateGroup: (id: string, input: CreateGroupRequest) =>
    request<{ group: Group }>(`/admin/groups/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteGroup: (id: string) =>
    request<{ ok: true }>(`/admin/groups/${id}`, { method: 'DELETE' }),

  createTeam: (input: CreateTeamRequest) =>
    request<{ team: Team }>('/admin/teams', { method: 'POST', body: JSON.stringify(input) }),

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

  // Knockout (server route is /api/bracket, admin-guarded).
  updateBracketSlot: (slot: BracketSlotId, patch: UpdateBracketRequest) =>
    request<{ bracket: BracketView }>(`/bracket/${slot}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  resetBracket: () =>
    request<{ bracket: BracketView }>('/bracket/reset', { method: 'POST' }),
};

export type { AdminUserView, Role };

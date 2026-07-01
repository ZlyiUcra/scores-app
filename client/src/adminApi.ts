import type {
  AdminUserView,
  CreateMatchRequest,
  Match,
  Paginated,
  Role,
  Team,
  UpdateUserRequest,
} from '../../shared/types';
import { request } from './api';

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

  createTeam: (input: { name: string; shortName: string }) =>
    request<{ team: Team }>('/admin/teams', { method: 'POST', body: JSON.stringify(input) }),

  deleteTeam: (id: string) =>
    request<{ ok: true }>(`/admin/teams/${id}`, { method: 'DELETE' }),

  createMatch: (input: CreateMatchRequest) =>
    request<{ match: Match }>('/admin/matches', { method: 'POST', body: JSON.stringify(input) }),

  deleteMatch: (id: string) =>
    request<{ ok: true }>(`/admin/matches/${id}`, { method: 'DELETE' }),
};

export type { AdminUserView, Role };

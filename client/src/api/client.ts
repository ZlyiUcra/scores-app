import type { AuthUser, BracketView, Match, MatchUpdate, Roster } from '../../../shared/types';

/**
 * Thin REST client. All requests send the httpOnly cookie automatically via
 * `credentials: 'include'`. Errors are normalized to a thrown `ApiError`.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? 'Request failed.');
  }
  return body as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  register: (username: string, password: string) =>
    request<{ user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  me: () => request<{ user: AuthUser }>('/auth/me'),

  listMatches: () => request<{ matches: Match[] }>('/matches'),

  getBracket: () => request<{ bracket: BracketView }>('/bracket'),

  getRoster: () => request<{ roster: Roster }>('/roster'),

  goal: (matchId: string, team: 'home' | 'away', delta: 1 | -1, expectedRev: number) =>
    request<{ update: MatchUpdate }>(`/matches/${matchId}/goal`, {
      method: 'POST',
      body: JSON.stringify({ team, delta, expectedRev }),
    }),

  updateMatch: (
    matchId: string,
    patch: Partial<Pick<Match, 'homeScore' | 'awayScore' | 'status' | 'startsAt' | 'field'>> & {
      expectedRev: number;
    },
  ) =>
    request<{ update: MatchUpdate }>(`/matches/${matchId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
};

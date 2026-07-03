import type { AuthUser, BracketView, Match, MatchUpdate, Roster, Tournament } from '../../../shared/types';

// Thin REST client. All requests send the httpOnly cookie automatically via
// `credentials: 'include'`. Errors are normalized to a thrown `ApiError`.

/** Non-2xx response, carrying the server's HTTP status and error code. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** One JSON round-trip to `/api${path}`; throws ApiError on a non-2xx reply. */
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

/** Endpoints available to every authenticated user (admin ones: api/admin.ts). */
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

  /** All tournaments plus the id every unscoped request lands in. */
  listTournaments: () => request<{ tournaments: Tournament[]; defaultId: string }>('/tournaments'),

  listMatches: (tournamentId: string) =>
    request<{ matches: Match[] }>(`/matches?tournamentId=${encodeURIComponent(tournamentId)}`),

  getBracket: (tournamentId: string) =>
    request<{ bracket: BracketView }>(`/bracket?tournamentId=${encodeURIComponent(tournamentId)}`),

  getRoster: (tournamentId: string) =>
    request<{ roster: Roster }>(`/roster?tournamentId=${encodeURIComponent(tournamentId)}`),

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

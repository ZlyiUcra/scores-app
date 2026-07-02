import { create } from 'zustand';
import type { Match, MatchUpdate } from '../../shared/types';

/**
 * Normalized match store keyed by id (a Record, not an array) so a single
 * match update patches one entry in place. Components select their own match
 * by id, so one goal re-renders exactly one row — not the whole list.
 */
interface MatchState {
  byId: Record<string, Match>;
  order: string[]; // stable display order
  connected: boolean;
  setSnapshot: (matches: Match[]) => void;
  applyUpdate: (u: MatchUpdate) => void;
  addMatch: (m: Match) => void;
  removeMatch: (matchId: string) => void;
  setConnected: (v: boolean) => void;
}

// Canonical display order: by kickoff time, id as a stable tiebreak. Derived
// from the map so it can't drift from `byId` (deletes/dupes stay consistent).
function deriveOrder(byId: Record<string, Match>): string[] {
  return Object.values(byId)
    .sort((a, b) => {
      const t = a.startsAt.localeCompare(b.startsAt);
      return t !== 0 ? t : a.id.localeCompare(b.id);
    })
    .map((m) => m.id);
}

export const useMatchStore = create<MatchState>((set) => ({
  byId: {},
  order: [],
  connected: false,

  setSnapshot: (matches) =>
    set(() => {
      const byId: Record<string, Match> = {};
      // Classic for-loop on the (potentially) hot snapshot path.
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        byId[m.id] = m;
      }
      return { byId, order: deriveOrder(byId) };
    }),

  applyUpdate: (u) =>
    set((state) => {
      const current = state.byId[u.matchId];
      // Drop stale/out-of-order events: only move forward in rev.
      if (!current || u.rev <= current.rev) return state;
      const byId = {
        ...state.byId,
        [u.matchId]: {
          ...current,
          homeScore: u.homeScore,
          awayScore: u.awayScore,
          status: u.status,
          minute: u.minute,
          startsAt: u.startsAt ?? current.startsAt,
          field: u.field ?? current.field,
          rev: u.rev,
        },
      };
      // Display order sorts by kickoff, so a rescheduled match must re-sort.
      return u.startsAt !== undefined ? { byId, order: deriveOrder(byId) } : { byId };
    }),

  addMatch: (m) =>
    set((state) => {
      // Idempotent: a duplicate match:created (socket has no exactly-once
      // guarantee) must not create two rows.
      if (state.byId[m.id]) return state;
      const byId = { ...state.byId, [m.id]: m };
      return { byId, order: deriveOrder(byId) };
    }),

  removeMatch: (matchId) =>
    set((state) => {
      // Idempotent: removing an unknown id is a no-op.
      if (!state.byId[matchId]) return state;
      const byId = { ...state.byId };
      delete byId[matchId];
      return { byId, order: state.order.filter((id) => id !== matchId) };
    }),

  setConnected: (v) => set({ connected: v }),
}));

// Narrow selectors — subscribe to just what a component needs.
export const selectMatch = (id: string) => (s: MatchState) => s.byId[id];
export const selectOrder = (s: MatchState) => s.order;
export const selectConnected = (s: MatchState) => s.connected;

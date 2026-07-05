import { create } from 'zustand';
import type { Match, MatchUpdate } from '../../../shared/types';

/**
 * Normalized match store keyed by id (a Record, not an array) so a single
 * match update patches one entry in place. Components select their own match
 * by id, so one goal re-renders exactly one row — not the whole list.
 *
 * `order` and `byGroup` are DERIVED views of the map (display order, and the
 * per-group id buckets used by the results/overview pages). They are recomputed
 * only when the set of matches or their schedule/group changes — NOT on a plain
 * score update — so a page that lists matches by group can subscribe to them
 * and stay off the hot per-goal re-render path.
 */
interface MatchState {
  byId: Record<string, Match>;
  order: string[]; // stable display order
  byGroup: Record<string, string[]>; // group id -> its match ids, in display order
  connected: boolean;
  setSnapshot: (matches: Match[]) => void;
  applyUpdate: (u: MatchUpdate) => void;
  addMatch: (m: Match) => void;
  removeMatch: (matchId: string) => void;
  setConnected: (v: boolean) => void;
}

// Canonical display order (by kickoff, id as a stable tiebreak) plus the
// per-group id buckets, both derived from the map so they can't drift from
// `byId` (deletes/dupes stay consistent).
function derive(byId: Record<string, Match>): { order: string[]; byGroup: Record<string, string[]> } {
  const order = Object.values(byId)
    .sort((a, b) => {
      const t = a.startsAt.localeCompare(b.startsAt);
      return t !== 0 ? t : a.id.localeCompare(b.id);
    })
    .map((m) => m.id);
  const byGroup: Record<string, string[]> = {};
  for (const id of order) {
    const g = byId[id].group;
    (byGroup[g] ??= []).push(id);
  }
  return { order, byGroup };
}

/** Live group-match state fed by REST snapshots + socket diffs (see socket.ts). */
export const useMatchStore = create<MatchState>((set) => ({
  byId: {},
  order: [],
  byGroup: {},
  connected: false,

  setSnapshot: (matches) =>
    set(() => {
      const byId: Record<string, Match> = {};
      // Classic for-loop on the (potentially) hot snapshot path.
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        byId[m.id] = m;
      }
      return { byId, ...derive(byId) };
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
          startsAt: u.startsAt ?? current.startsAt,
          field: u.field ?? current.field,
          rev: u.rev,
        },
      };
      // Display order sorts by kickoff, so a rescheduled match must re-derive
      // the order/group views; a plain score change leaves them untouched
      // (their refs stay stable, so list pages don't re-render).
      return u.startsAt !== undefined ? { byId, ...derive(byId) } : { byId };
    }),

  addMatch: (m) =>
    set((state) => {
      // Idempotent: a duplicate match:created (socket has no exactly-once
      // guarantee) must not create two rows.
      if (state.byId[m.id]) return state;
      const byId = { ...state.byId, [m.id]: m };
      return { byId, ...derive(byId) };
    }),

  removeMatch: (matchId) =>
    set((state) => {
      // Idempotent: removing an unknown id is a no-op.
      if (!state.byId[matchId]) return state;
      const byId = { ...state.byId };
      delete byId[matchId];
      return { byId, ...derive(byId) };
    }),

  setConnected: (v) => set({ connected: v }),
}));

// Narrow selectors — subscribe to just what a component needs.
export const selectMatch = (id: string) => (s: MatchState) => s.byId[id];
export const selectOrder = (s: MatchState) => s.order;
export const selectByGroup = (s: MatchState) => s.byGroup;
export const selectConnected = (s: MatchState) => s.connected;

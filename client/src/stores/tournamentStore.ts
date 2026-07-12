import { create } from 'zustand';
import type { Tournament } from '../../../shared/types';
import { api } from '../api/client';

/**
 * The tournament list + the server's default tournament id (where unscoped
 * requests land). REST-only - there is no socket event for tournaments, so the
 * list is fetched on login and re-fetched when the list page mounts.
 */
interface TournamentState {
  tournaments: Tournament[];
  defaultId: string | null;
  /** False until the first fetch lands - gates the root redirect. */
  loaded: boolean;
  /** True when the last fetch failed. Gated screens show a retry instead of a
   * stuck "Loading..." (initial loads are not user actions, so there is no other
   * error surface). Cleared while a fetch is in flight. */
  error: boolean;
  setTournaments: (tournaments: Tournament[], defaultId: string) => void;
  /** Fetch the list and populate the store; flips `error` on failure. Safe to
   * call from several mounted screens - it is just a re-fetch. */
  load: () => Promise<void>;
}

export const useTournamentStore = create<TournamentState>((set) => ({
  tournaments: [],
  defaultId: null,
  loaded: false,
  error: false,
  setTournaments: (tournaments, defaultId) => set({ tournaments, defaultId, loaded: true, error: false }),
  load: async () => {
    set({ error: false });
    try {
      const { tournaments, defaultId } = await api.listTournaments();
      set({ tournaments, defaultId, loaded: true, error: false });
    } catch {
      set({ error: true });
    }
  },
}));

// Narrow selectors - subscribe to just what a component needs.
export const selectTournaments = (s: TournamentState) => s.tournaments;
export const selectDefaultId = (s: TournamentState) => s.defaultId;
export const selectLoaded = (s: TournamentState) => s.loaded;
export const selectError = (s: TournamentState) => s.error;

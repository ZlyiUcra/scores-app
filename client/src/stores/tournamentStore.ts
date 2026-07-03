import { create } from 'zustand';
import type { Tournament } from '../../../shared/types';

/**
 * The tournament list + the server's default tournament id (where unscoped
 * requests land). REST-only — there is no socket event for tournaments, so the
 * list is fetched on login and re-fetched when the list page mounts.
 */
interface TournamentState {
  tournaments: Tournament[];
  defaultId: string | null;
  /** False until the first fetch lands — gates the root redirect. */
  loaded: boolean;
  setTournaments: (tournaments: Tournament[], defaultId: string) => void;
}

export const useTournamentStore = create<TournamentState>((set) => ({
  tournaments: [],
  defaultId: null,
  loaded: false,
  setTournaments: (tournaments, defaultId) => set({ tournaments, defaultId, loaded: true }),
}));

// Narrow selectors — subscribe to just what a component needs.
export const selectTournaments = (s: TournamentState) => s.tournaments;
export const selectDefaultId = (s: TournamentState) => s.defaultId;
export const selectLoaded = (s: TournamentState) => s.loaded;

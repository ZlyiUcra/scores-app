import { create } from 'zustand';
import type { BracketView } from '../../shared/types';

/**
 * The knockout view is authoritative on the server (group setup + results). The
 * server pushes the full view on connect and whenever it can change; the client
 * holds and replaces it.
 */
interface BracketState {
  view: BracketView;
  setBracket: (view: BracketView) => void;
}

const EMPTY: BracketView = { formable: false, reason: null, size: 0, matches: [] };

export const useBracketStore = create<BracketState>((set) => ({
  view: EMPTY,
  setBracket: (view) => set({ view }),
}));

export const selectBracket = (s: BracketState) => s.view;

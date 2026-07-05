import React from 'react';
import { api } from '../api/client';
import { connectSocket, disconnectSocket } from '../socket';
import { useMatchStore } from '../stores/matchStore';
import { useBracketStore, EMPTY_BRACKET } from '../stores/bracketStore';
import { useRosterStore } from '../stores/rosterStore';

/** A failed feed load and the retry that re-runs it. */
interface FeedState {
  /** True when any of the three snapshot fetches failed. */
  error: boolean;
  /** Re-run the whole load (re-fetch + reconnect the socket). */
  reload: () => void;
}

/**
 * One tournament's data lifecycle: clear the stores (so a switch never
 * flashes the previous tournament's data), pull the authoritative REST
 * snapshots, then open the live socket into that tournament's room. Torn
 * down and rebuilt whenever the id changes; null connects nothing. Used by
 * the public TournamentScope layout and the admin area — whichever is on
 * screen owns the feed (they never render together).
 *
 * Returns a feed state so the caller can show a retry instead of a screen of
 * empty data when the snapshots fail (flaky connection on load).
 */
export function useTournamentFeed(tournamentId: string | null): FeedState {
  const [error, setError] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!tournamentId) return;
    let alive = true;
    setError(false);
    useMatchStore.getState().setSnapshot([]);
    useBracketStore.getState().setBracket(EMPTY_BRACKET);
    useRosterStore.getState().setRoster({ groups: [], teams: [], players: [] });
    // All three must land for a usable screen — one failure surfaces a retry.
    Promise.all([
      api.listMatches(tournamentId).then(({ matches }) => alive && useMatchStore.getState().setSnapshot(matches)),
      api.getBracket(tournamentId).then(({ bracket }) => alive && useBracketStore.getState().setBracket(bracket)),
      api.getRoster(tournamentId).then(({ roster }) => alive && useRosterStore.getState().setRoster(roster)),
    ]).catch(() => alive && setError(true));
    connectSocket(tournamentId);
    return () => {
      alive = false;
      disconnectSocket();
    };
  }, [tournamentId, reloadKey]);

  return { error, reload: () => setReloadKey((k) => k + 1) };
}

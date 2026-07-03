import React from 'react';
import { api } from '../api/client';
import { connectSocket, disconnectSocket } from '../socket';
import { useMatchStore } from '../stores/matchStore';
import { useBracketStore } from '../stores/bracketStore';
import { useRosterStore } from '../stores/rosterStore';

/**
 * One tournament's data lifecycle: clear the stores (so a switch never
 * flashes the previous tournament's data), pull the authoritative REST
 * snapshots, then open the live socket into that tournament's room. Torn
 * down and rebuilt whenever the id changes; null connects nothing. Used by
 * the public TournamentScope layout and the admin area — whichever is on
 * screen owns the feed (they never render together).
 */
export function useTournamentFeed(tournamentId: string | null): void {
  React.useEffect(() => {
    if (!tournamentId) return;
    let alive = true;
    useMatchStore.getState().setSnapshot([]);
    useBracketStore.getState().setBracket({ formable: false, reason: null, size: 0, matches: [] });
    useRosterStore.getState().setRoster({ groups: [], teams: [], players: [] });
    api
      .listMatches(tournamentId)
      .then(({ matches }) => alive && useMatchStore.getState().setSnapshot(matches))
      .catch((err) => console.error(err));
    api
      .getBracket(tournamentId)
      .then(({ bracket }) => alive && useBracketStore.getState().setBracket(bracket))
      .catch((err) => console.error(err));
    api
      .getRoster(tournamentId)
      .then(({ roster }) => alive && useRosterStore.getState().setRoster(roster))
      .catch((err) => console.error(err));
    connectSocket(tournamentId);
    return () => {
      alive = false;
      disconnectSocket();
    };
  }, [tournamentId]);
}

import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, type ServerToClientEvents } from '../../shared/types';
import { useMatchStore } from './stores/matchStore';
import { useBracketStore } from './stores/bracketStore';
import { useRosterStore } from './stores/rosterStore';

let socket: Socket<ServerToClientEvents> | null = null;
/** The tournament the live socket (if any) is bound to. */
let currentTournamentId: string | null = null;

/**
 * Connect the live feed for ONE tournament. The httpOnly auth cookie is sent
 * automatically on the handshake (same origin via the Vite proxy); the
 * tournament id rides the handshake auth payload, joining that tournament's
 * room. Server pushes a full snapshot on connect (resync) then compact diffs.
 *
 * Idempotent for the same tournament, and safe to call with a different id
 * while already connected: the old socket is torn down and a fresh one opens
 * into the new room, so callers do not depend on effect-cleanup order to
 * switch tournaments.
 */
export function connectSocket(tournamentId: string): void {
  if (socket && currentTournamentId === tournamentId) return;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentTournamentId = tournamentId;
  socket = io({ withCredentials: true, auth: { tournamentId } });

  socket.on('connect', () => useMatchStore.getState().setConnected(true));
  socket.on('disconnect', () => useMatchStore.getState().setConnected(false));

  socket.on(SOCKET_EVENTS.matchSnapshot, (matches) => {
    useMatchStore.getState().setSnapshot(matches);
  });
  socket.on(SOCKET_EVENTS.matchUpdate, (update) => {
    useMatchStore.getState().applyUpdate(update);
  });
  socket.on(SOCKET_EVENTS.matchCreated, (match) => {
    useMatchStore.getState().addMatch(match);
  });
  socket.on(SOCKET_EVENTS.matchRemoved, ({ matchId }) => {
    useMatchStore.getState().removeMatch(matchId);
  });
  socket.on(SOCKET_EVENTS.bracketSnapshot, (bracket) => {
    useBracketStore.getState().setBracket(bracket);
  });
  socket.on(SOCKET_EVENTS.rosterSnapshot, (roster) => {
    useRosterStore.getState().setRoster(roster);
  });
}

/** Tear the feed down (logout/unmount) and mark the UI as offline. */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  currentTournamentId = null;
  useMatchStore.getState().setConnected(false);
}

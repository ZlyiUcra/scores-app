import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, type ServerToClientEvents } from '../../shared/types';
import { useMatchStore } from './stores/matchStore';
import { useBracketStore } from './stores/bracketStore';
import { useRosterStore } from './stores/rosterStore';

let socket: Socket<ServerToClientEvents> | null = null;

/**
 * Connect the live feed for ONE tournament. The httpOnly auth cookie is sent
 * automatically on the handshake (same origin via the Vite proxy); the
 * tournament id rides the handshake auth payload, joining that tournament's
 * room. Server pushes a full snapshot on connect (resync) then compact diffs.
 * Switching tournaments = disconnect + connect with the other id.
 */
export function connectSocket(tournamentId: string): void {
  if (socket) return;
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
  useMatchStore.getState().setConnected(false);
}

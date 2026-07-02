import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents } from '../../shared/types';
import { SOCKET_EVENTS } from '../../shared/types';
import { useMatchStore } from './store';
import { useBracketStore } from './bracketStore';
import { useRosterStore } from './rosterStore';

let socket: Socket<ServerToClientEvents> | null = null;

/**
 * Connect the live feed. The httpOnly auth cookie is sent automatically on the
 * handshake (same origin via the Vite proxy). Server pushes a full snapshot on
 * connect (resync) then compact diffs.
 */
export function connectSocket(): void {
  if (socket) return;
  socket = io({ withCredentials: true });

  const store = useMatchStore.getState();

  socket.on('connect', () => store.setConnected(true));
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

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  useMatchStore.getState().setConnected(false);
}

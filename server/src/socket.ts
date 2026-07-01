import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import cookie from 'cookie';
import type {
  ClientToServerEvents,
  Match,
  MatchRemoved,
  MatchUpdate,
  ServerToClientEvents,
} from '../../shared/types.js';
import { SOCKET_EVENTS } from '../../shared/types.js';
import { config } from './config.js';
import { verifyToken } from './auth.js';
import { userRepository } from './users.js';
import { listMatches } from './service.js';

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function initSocket(httpServer: HttpServer): void {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: config.isProd
      ? { origin: config.clientOrigin, credentials: true }
      : undefined, // dev goes through the Vite proxy -> same origin
  });

  // Authenticate the handshake from the httpOnly cookie, re-loading the user
  // from the store (not trusting the token) so a deactivated/deleted account
  // can't open a fresh socket.
  io.use((socket, next) => {
    const header = socket.request.headers.cookie;
    if (!header) return next(new Error('unauthenticated'));
    const parsed = cookie.parse(header);
    const token = parsed[config.cookieName];
    const claims = token ? verifyToken(token) : null;
    const fresh = claims ? userRepository.getById(claims.id) : undefined;
    if (!fresh || !fresh.active) return next(new Error('unauthenticated'));
    (socket.data as { userId?: string }).userId = fresh.id;
    next();
  });

  io.on('connection', (socket) => {
    // Per-user room so an admin can force-disconnect a user's live sockets on
    // deactivation/deletion (see disconnectUser).
    const userId = (socket.data as { userId?: string }).userId;
    if (userId) socket.join(userRoom(userId));

    // Reconnect resync: push the authoritative snapshot immediately so a client
    // that missed events while offline is never left with a stale score.
    const snapshot: Match[] = listMatches();
    socket.emit(SOCKET_EVENTS.matchSnapshot, snapshot);
  });
}

/** Broadcast a compact diff to every connected client. */
export function broadcastMatchUpdate(update: MatchUpdate): void {
  io?.emit(SOCKET_EVENTS.matchUpdate, update);
}

/** Broadcast a newly created match (full object) so it appears live for all. */
export function broadcastMatchCreated(match: Match): void {
  io?.emit(SOCKET_EVENTS.matchCreated, match);
}

/** Broadcast a match removal (id only). */
export function broadcastMatchRemoved(matchId: string): void {
  const payload: MatchRemoved = { matchId };
  io?.emit(SOCKET_EVENTS.matchRemoved, payload);
}

/** Force-disconnect all live sockets of a user (revocation on deactivate/delete). */
export function disconnectUser(userId: string): void {
  io?.to(userRoom(userId)).disconnectSockets(true);
}

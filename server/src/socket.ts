import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import cookie from 'cookie';
import type {
  BracketView,
  ClientToServerEvents,
  Match,
  MatchRemoved,
  MatchUpdate,
  Roster,
  ServerToClientEvents,
} from '../../shared/types.js';
import { SOCKET_EVENTS } from '../../shared/types.js';
import { config } from './config.js';
import { verifyToken } from './auth.js';
import { userRepository } from './repos/users.js';
import { listMatches } from './services/matches.js';
import { getRoster } from './services/roster.js';
import { listBracket } from './services/bracket.js';

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

/** Room per user id, so admin actions can target one user's live sockets. */
function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Attach Socket.IO to the HTTP server. Sockets are READ-ONLY broadcast: the
 * handshake is authenticated from the httpOnly cookie, every connection gets
 * a full state snapshot (resync), and all subsequent traffic is server-pushed
 * diffs/snapshots — clients never mutate anything over the socket.
 */
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
    // Roster (groups + teams) drives client standings; the bracket is derived.
    socket.emit(SOCKET_EVENTS.rosterSnapshot, getRoster());
    socket.emit(SOCKET_EVENTS.bracketSnapshot, listBracket());
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

/** Broadcast the full knockout view. Sent whenever the bracket can change: a
 * knockout result is entered, or a group result/roster change may re-seed it. */
export function broadcastBracket(bracket: BracketView): void {
  io?.emit(SOCKET_EVENTS.bracketSnapshot, bracket);
}

/** Broadcast the roster (groups + teams) after any team/group/membership change
 * so client standings stay correct. */
export function broadcastRoster(roster: Roster): void {
  io?.emit(SOCKET_EVENTS.rosterSnapshot, roster);
}

/** Re-push the full match snapshot — used after a team rename so the team names
 * embedded in every match DTO refresh for all clients. */
export function broadcastMatchSnapshot(matches: Match[]): void {
  io?.emit(SOCKET_EVENTS.matchSnapshot, matches);
}

/** Force-disconnect all live sockets of a user (revocation on deactivate/delete). */
export function disconnectUser(userId: string): void {
  io?.to(userRoom(userId)).disconnectSockets(true);
}

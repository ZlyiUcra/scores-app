import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
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
import { readUserFromCookieHeader } from './auth.js';
import { listMatches } from './services/matches.js';
import { getRoster } from './services/roster.js';
import { listBracket } from './services/bracket.js';
import { defaultTournamentId, resolveTournamentId } from './services/tournaments.js';

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

/** Room per user id, so admin actions can target one user's live sockets. */
function userRoom(userId: string): string {
  return `user:${userId}`;
}

/** Room per tournament — every data event is scoped to one tournament, so a
 * client watching an archive never receives another tournament's updates. */
function tournamentRoom(tournamentId: string): string {
  return `tournament:${tournamentId}`;
}

/** Join the socket to its rooms and push the authoritative snapshot (resync)
 * so a client that missed events while offline is never left with a stale
 * score. Async work of the `connection` handler, isolated so its failure can
 * be handled (socket.io does not await listeners). */
async function attachSocket(socket: Socket<ClientToServerEvents, ServerToClientEvents>): Promise<void> {
  // Per-user room so an admin can force-disconnect a user's live sockets on
  // deactivation/deletion (see disconnectUser).
  const userId = (socket.data as { userId?: string }).userId;
  if (userId) await socket.join(userRoom(userId));

  // The tournament this socket watches. An unknown/absent id falls back to
  // the default tournament (never an error — a stale id after a deletion
  // must not kill live updates).
  const requested = (socket.handshake.auth as { tournamentId?: unknown }).tournamentId;
  let tournamentId: string;
  try {
    tournamentId = await resolveTournamentId(typeof requested === 'string' ? requested : undefined);
  } catch {
    tournamentId = await defaultTournamentId();
  }
  await socket.join(tournamentRoom(tournamentId));

  const snapshot: Match[] = await listMatches(tournamentId);
  socket.emit(SOCKET_EVENTS.matchSnapshot, snapshot);
  // Roster (groups + teams) drives client standings; the bracket is derived.
  socket.emit(SOCKET_EVENTS.rosterSnapshot, await getRoster(tournamentId));
  socket.emit(SOCKET_EVENTS.bracketSnapshot, await listBracket(tournamentId));
}

/**
 * Attach Socket.IO to the HTTP server. Sockets are READ-ONLY broadcast: the
 * handshake is authenticated from the httpOnly cookie, every connection joins
 * ONE tournament's room (`auth.tournamentId`, defaulting to the active
 * tournament for the pre-tournament client), gets that tournament's full
 * state snapshot (resync), and all subsequent traffic is server-pushed
 * diffs/snapshots — clients never mutate anything over the socket. To switch
 * tournaments a client reconnects with a different `auth.tournamentId`.
 */
export function initSocket(httpServer: HttpServer): void {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: config.isProd
      ? { origin: config.clientOrigin, credentials: true }
      : undefined, // dev goes through the Vite proxy -> same origin
  });

  // Authenticate the handshake from the httpOnly cookie, re-loading the user
  // from the store (not trusting the token) so a deactivated/deleted account
  // can't open a fresh socket. socket.io does NOT await an async middleware —
  // the promise is bridged to next() explicitly so a rejection becomes a
  // failed handshake, never an unhandled rejection.
  io.use((socket, next) => {
    readUserFromCookieHeader(socket.request.headers.cookie).then(
      (user) => {
        if (!user) return next(new Error('unauthenticated'));
        (socket.data as { userId?: string }).userId = user.id;
        next();
      },
      (err: unknown) => {
        console.error('[socket] handshake auth failed:', err);
        next(new Error('unauthenticated'));
      },
    );
  });

  io.on('connection', (socket) => {
    // socket.io does not await listeners either; a failed resync closes the
    // socket so the client retries with a clean handshake instead of sitting
    // on a half-initialized connection.
    attachSocket(socket).catch((err: unknown) => {
      console.error('[socket] connection setup failed:', err);
      socket.disconnect(true);
    });
  });
}

/** Broadcast a compact diff to the tournament's connected clients. */
export function broadcastMatchUpdate(tournamentId: string, update: MatchUpdate): void {
  io?.to(tournamentRoom(tournamentId)).emit(SOCKET_EVENTS.matchUpdate, update);
}

/** Broadcast a newly created match (full object) so it appears live for all. */
export function broadcastMatchCreated(tournamentId: string, match: Match): void {
  io?.to(tournamentRoom(tournamentId)).emit(SOCKET_EVENTS.matchCreated, match);
}

/** Broadcast a match removal (id only). */
export function broadcastMatchRemoved(tournamentId: string, matchId: string): void {
  const payload: MatchRemoved = { matchId };
  io?.to(tournamentRoom(tournamentId)).emit(SOCKET_EVENTS.matchRemoved, payload);
}

/** Broadcast the tournament's full knockout view. Sent whenever its bracket
 * can change: a knockout result is entered, or a group result/roster change
 * may re-seed it. */
export function broadcastBracket(tournamentId: string, bracket: BracketView): void {
  io?.to(tournamentRoom(tournamentId)).emit(SOCKET_EVENTS.bracketSnapshot, bracket);
}

/** Broadcast the tournament's roster (groups + teams) after any
 * team/group/membership change so client standings stay correct. */
export function broadcastRoster(tournamentId: string, roster: Roster): void {
  io?.to(tournamentRoom(tournamentId)).emit(SOCKET_EVENTS.rosterSnapshot, roster);
}

/** Re-push the tournament's full match snapshot — used after a team rename so
 * the team names embedded in every match DTO refresh for all clients. */
export function broadcastMatchSnapshot(tournamentId: string, matches: Match[]): void {
  io?.to(tournamentRoom(tournamentId)).emit(SOCKET_EVENTS.matchSnapshot, matches);
}

/** Force-disconnect all live sockets of a user (revocation on deactivate/delete). */
export function disconnectUser(userId: string): void {
  io?.to(userRoom(userId)).disconnectSockets(true);
}

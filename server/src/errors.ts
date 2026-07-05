/**
 * Single typed error contract shared across services and routes.
 * The Express error middleware maps any AppError to { error: { code, message } }.
 *
 * `code` is a string enum so every throw site and the wire value stay in sync;
 * the enum VALUES are the exact strings clients see in the error envelope, so
 * changing a key is safe while changing a value is a wire-format change.
 */
export enum AppErrorCode {
  AccountDisabled = 'ACCOUNT_DISABLED',
  BadRequest = 'BAD_REQUEST',
  BracketStarted = 'BRACKET_STARTED',
  CrossOrigin = 'CROSS_ORIGIN',
  DataIntegrity = 'DATA_INTEGRITY',
  DrawUnresolved = 'DRAW_UNRESOLVED',
  Forbidden = 'FORBIDDEN',
  GroupFull = 'GROUP_FULL',
  GroupInUse = 'GROUP_IN_USE',
  Invalid = 'INVALID',
  InvalidCredentials = 'INVALID_CREDENTIALS',
  LastAdmin = 'LAST_ADMIN',
  LastTournament = 'LAST_TOURNAMENT',
  NotFound = 'NOT_FOUND',
  NumberTaken = 'NUMBER_TAKEN',
  RateLimited = 'RATE_LIMITED',
  RevConflict = 'REV_CONFLICT',
  SelfLockout = 'SELF_LOCKOUT',
  SlotNotReady = 'SLOT_NOT_READY',
  StoreWriteFailed = 'STORE_WRITE_FAILED',
  TeamHasFixtures = 'TEAM_HAS_FIXTURES',
  TeamInUse = 'TEAM_IN_USE',
  TournamentFinished = 'TOURNAMENT_FINISHED',
  TournamentInUse = 'TOURNAMENT_IN_USE',
  Unauthenticated = 'UNAUTHENTICATED',
  UserLimit = 'USER_LIMIT',
  UsernameTaken = 'USERNAME_TAKEN',
}

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Unwrap an id-addressed repository read, throwing a uniform NOT_FOUND (404)
 * when it came back empty. Collapses the `const x = await ...; if (!x) throw`
 * boilerplate repeated across the service reads; the message stays caller-specific.
 */
export function requireFound<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new AppError(AppErrorCode.NotFound, message, 404);
  return value;
}

import { useCallback } from 'react';
import { useI18n } from '../i18n';
import { ApiError } from '../api/client';

/** AppErrorCode (server/src/errors.ts) wire values that carry one fixed,
 * non-interpolated message - safe to translate outright. Codes used as
 * generic wrappers around a per-call, dynamically built English message
 * (BAD_REQUEST, INVALID, NOT_FOUND, STORE_WRITE_FAILED, DATA_INTEGRITY) or
 * that interpolate a runtime value (GROUP_FULL, NUMBER_TAKEN, TEAM_IN_USE)
 * are deliberately left out and keep falling back to `err.message`. */
const CODE_TO_KEY: Record<string, string> = {
  ACCOUNT_DISABLED: 'accountDisabled',
  BRACKET_STARTED: 'bracketStarted',
  CROSS_ORIGIN: 'crossOrigin',
  DRAW_UNRESOLVED: 'drawUnresolved',
  FORBIDDEN: 'forbidden',
  GROUP_IN_USE: 'groupInUse',
  INVALID_CREDENTIALS: 'invalidCredentials',
  LAST_ADMIN: 'lastAdmin',
  LAST_TOURNAMENT: 'lastTournament',
  RATE_LIMITED: 'rateLimited',
  REV_CONFLICT: 'revConflict',
  SELF_LOCKOUT: 'selfLockout',
  SLOT_NOT_READY: 'slotNotReady',
  TEAM_HAS_FIXTURES: 'teamHasFixtures',
  TOURNAMENT_FINISHED: 'tournamentFinished',
  TOURNAMENT_IN_USE: 'tournamentInUse',
  UNAUTHENTICATED: 'unauthenticated',
  USER_LIMIT: 'userLimit',
  USERNAME_TAKEN: 'usernameTaken',
};

/** Resolves a caught error to a user-facing message: a known server error
 * code is translated via the `apiError.*` catalog; anything else (an
 * unmapped code, or a non-ApiError network/parse failure) falls back to
 * `err.message` for a known code, or the caller's own `fallbackKey`. */
export function useApiErrorMessage(): (err: unknown, fallbackKey: string) => string {
  const { t } = useI18n();
  return useCallback(
    (err: unknown, fallbackKey: string): string => {
      if (err instanceof ApiError) {
        const key = CODE_TO_KEY[err.code];
        if (key) return t(`apiError.${key}`);
        return err.message;
      }
      return t(fallbackKey);
    },
    [t],
  );
}

import { useState } from 'react';
import type { Match, MatchStatus } from '../../../shared/types';
import { api, ApiError } from '../api/client';
import { useI18n } from '../i18n';

/**
 * Admin-only controls. Rendered only for admins (UX), but the real gate is the
 * server's requireAdmin check — a viewer poking the API directly gets 403.
 *
 * We don't optimistically mutate local state here: the authoritative result
 * arrives back over the socket as a rev-bumped diff, keeping every client in
 * sync from one source of truth.
 */
export function AdminControls({ match }: { match: Match }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminControls.error'));
    } finally {
      setBusy(false);
    }
  }

  const goal = (team: 'home' | 'away', delta: 1 | -1) =>
    run(() => api.goal(match.id, team, delta, match.rev));

  const setStatus = (status: MatchStatus) =>
    run(() => api.updateMatch(match.id, { status, expectedRev: match.rev }));

  return (
    <div className="admin">
      <div className="admin__title">{t('adminControls.title')}</div>
      <div className="admin__grid">
        <div className="admin__side">
          <span className="admin__label">{match.home.shortName}</span>
          <div className="admin__btns">
            <button disabled={busy} onClick={() => goal('home', 1)} className="btn btn--goal">{t('adminControls.goal')}</button>
            <button disabled={busy || match.homeScore <= 0} onClick={() => goal('home', -1)} className="btn btn--ghost">−</button>
          </div>
        </div>
        <div className="admin__side">
          <span className="admin__label">{match.away.shortName}</span>
          <div className="admin__btns">
            <button disabled={busy} onClick={() => goal('away', 1)} className="btn btn--goal">{t('adminControls.goal')}</button>
            <button disabled={busy || match.awayScore <= 0} onClick={() => goal('away', -1)} className="btn btn--ghost">−</button>
          </div>
        </div>
      </div>

      <div className="admin__status">
        <button disabled={busy || match.status === 'live'} onClick={() => setStatus('live')} className="btn btn--sm">{t('adminControls.start')}</button>
        <button disabled={busy || match.status === 'finished'} onClick={() => setStatus('finished')} className="btn btn--sm">{t('adminControls.final')}</button>
        <button disabled={busy || match.status === 'scheduled'} onClick={() => setStatus('scheduled')} className="btn btn--sm btn--ghost">{t('adminControls.reset')}</button>
      </div>

      {error && <p className="admin__error">{error}</p>}
    </div>
  );
}

import { useState } from 'react';
import { useBracketStore, selectBracket } from '../stores/bracketStore';
import { Bracket } from '../components/Bracket';
import { adminApi } from '../api/admin';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { useTournament } from '../tournament/TournamentScope';

/** Knockout page: the full bracket plus, for admins, the bracket-wide reset —
 * the knockout pages are the only place playoff state is managed. A finished
 * tournament is an archive, so the reset is hidden there. */
export function Knockout() {
  const { t } = useI18n();
  const view = useBracketStore(selectBracket);
  const { isAdmin } = useAuth();
  const { tournament, readOnly } = useTournament();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Any projected side means the whole page is a live projection.
  const preview = view.matches.some(
    (m) => ('seed' in m.home && m.home.projected) || ('seed' in m.away && m.away.projected),
  );

  // The bracket-wide reset lives HERE — the knockout pages are the one and
  // only place playoff state is managed (the /admin/bracket panel is gone).
  async function onReset() {
    if (!window.confirm(t('adminBracket.resetConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.resetBracket(tournament.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('adminBracket.resetError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ko-page">
      <div className="list__head">
        <h2>{t('nav.knockout')}</h2>
        {isAdmin && !readOnly && (
          <button className="btn btn--sm btn--danger" disabled={busy} onClick={() => void onReset()}>
            {t('adminBracket.reset')}
          </button>
        )}
      </div>
      {error && <p className="admin__error">{error}</p>}
      {preview && <p className="ko-preview-note">{t('bracket.previewNote')}</p>}
      <Bracket view={view} />
      <p className="muted ko-note">{t('bracket.note')}</p>
    </div>
  );
}

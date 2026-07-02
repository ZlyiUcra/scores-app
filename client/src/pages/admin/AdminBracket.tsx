import { useState } from 'react';
import { adminApi } from '../../adminApi';
import { ApiError } from '../../api';
import { useBracketStore, selectBracket } from '../../bracketStore';
import { BracketSlotControls } from '../../components/BracketSlotControls';
import { useI18n } from '../../i18n';

export function AdminBracket() {
  const { t } = useI18n();
  const view = useBracketStore(selectBracket);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onReset() {
    if (!window.confirm(t('adminBracket.resetConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.resetBracket();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('adminBracket.resetError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-panel">
      <div className="section-head">
        <h3>{t('adminBracket.title')}</h3>
        <button className="btn btn--sm btn--danger" disabled={busy} onClick={() => void onReset()}>
          {t('adminBracket.reset')}
        </button>
      </div>
      <p className="muted">{t('adminBracket.hint')}</p>
      {error && <p className="admin__error">{error}</p>}
      {view.formable ? (
        <div className="slot-editor-grid">
          {view.matches.map((m) => (
            <BracketSlotControls key={m.slot} m={m} />
          ))}
        </div>
      ) : (
        <p className="muted">{view.reason ? t(`bracket.reason.${view.reason}`) : t('bracket.empty')}</p>
      )}
    </div>
  );
}

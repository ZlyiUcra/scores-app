import { useEffect, useState } from 'react';
import type { BracketMatch, MatchStatus } from '../../../../shared/types';
import { adminApi } from '../../adminApi';
import { ApiError } from '../../api';
import { useBracketStore, selectBracket } from '../../bracketStore';
import { participantName } from '../../bracketLabels';
import { useI18n } from '../../i18n';

function SlotEditor({ m }: { m: BracketMatch }) {
  const { t } = useI18n();
  const ready = 'team' in m.home && 'team' in m.away;

  const [homeScore, setHomeScore] = useState(m.homeScore);
  const [awayScore, setAwayScore] = useState(m.awayScore);
  const [homePens, setHomePens] = useState<string>(m.homePens?.toString() ?? '');
  const [awayPens, setAwayPens] = useState<string>(m.awayPens?.toString() ?? '');
  const [status, setStatus] = useState<MatchStatus>(m.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-sync local fields when the authoritative slot changes (rev bump).
  useEffect(() => {
    setHomeScore(m.homeScore);
    setAwayScore(m.awayScore);
    setHomePens(m.homePens?.toString() ?? '');
    setAwayPens(m.awayPens?.toString() ?? '');
    setStatus(m.status);
  }, [m.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const level = status === 'finished' && homeScore === awayScore;

  async function onSave() {
    setBusy(true);
    setErr(null);
    try {
      await adminApi.updateBracketSlot(m.slot, {
        homeScore,
        awayScore,
        homePens: homePens === '' ? null : Number(homePens),
        awayPens: awayPens === '' ? null : Number(awayPens),
        status,
        expectedRev: m.rev,
      });
      // The broadcast refreshes the store; nothing else to do.
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('adminBracket.saveError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`slot-editor ${ready ? '' : 'slot-editor--pending'}`}>
      <div className="slot-editor__head">
        <span className="slot-editor__slot">{m.slot}</span>
        <span className="slot-editor__names">
          {participantName(m.home, t)} <span className="muted">vs</span> {participantName(m.away, t)}
        </span>
      </div>

      {ready ? (
        <>
          <div className="slot-editor__scores">
            <input className="input input--num" type="number" min={0} max={99} value={homeScore}
              onChange={(e) => setHomeScore(Number(e.target.value))} aria-label={t('adminBracket.homeScore')} />
            <span>:</span>
            <input className="input input--num" type="number" min={0} max={99} value={awayScore}
              onChange={(e) => setAwayScore(Number(e.target.value))} aria-label={t('adminBracket.awayScore')} />
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as MatchStatus)}>
              <option value="scheduled">{t('status.scheduled')}</option>
              <option value="live">{t('status.live')}</option>
              <option value="finished">{t('status.finished')}</option>
            </select>
          </div>
          {level && (
            <div className="slot-editor__pens">
              <span className="muted">{t('adminBracket.pens')}</span>
              <input className="input input--num" type="number" min={0} max={99} value={homePens}
                onChange={(e) => setHomePens(e.target.value)} aria-label={t('adminBracket.homePens')} />
              <span>:</span>
              <input className="input input--num" type="number" min={0} max={99} value={awayPens}
                onChange={(e) => setAwayPens(e.target.value)} aria-label={t('adminBracket.awayPens')} />
            </div>
          )}
          {err && <p className="admin__error">{err}</p>}
          <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => void onSave()}>
            {t('adminBracket.save')}
          </button>
        </>
      ) : (
        <p className="muted slot-editor__hint">{t('adminBracket.notReady')}</p>
      )}
    </div>
  );
}

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
            <SlotEditor key={m.slot} m={m} />
          ))}
        </div>
      ) : (
        <p className="muted">{view.reason ? t(`bracket.reason.${view.reason}`) : t('bracket.empty')}</p>
      )}
    </div>
  );
}

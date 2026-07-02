import { useEffect, useState } from 'react';
import type { BracketMatch, UpdateBracketRequest } from '../../../shared/types';
import { adminApi } from '../adminApi';
import { ApiError } from '../api';
import { participantName } from '../bracketLabels';
import { useI18n } from '../i18n';

/** ISO -> value for <input type="datetime-local"> in the local timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Click-driven slot controls, mirroring the group-match AdminControls: every
 * click PATCHes immediately (guarded by expectedRev) and the authoritative
 * state comes back to everyone over the socket broadcast — no save button.
 * Kick-off time is the one typed field; it commits on blur.
 * Rendered only for admins (UX) — the server's requireAdmin is the real gate.
 */
export function BracketSlotControls({ m }: { m: BracketMatch }) {
  const { t } = useI18n();
  const ready = 'team' in m.home && 'team' in m.away;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState(toLocalInput(m.startsAt));

  // Re-sync the time field when the authoritative slot changes (rev bump).
  useEffect(() => {
    setStartsAt(toLocalInput(m.startsAt));
  }, [m.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await action();
      // The broadcast refreshes the store; nothing else to do.
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('adminBracket.saveError'));
    } finally {
      setBusy(false);
    }
  }

  const patch = (p: Omit<UpdateBracketRequest, 'expectedRev'>) =>
    run(() => adminApi.updateBracketSlot(m.slot, { ...p, expectedRev: m.rev }));

  const goal = (side: 'home' | 'away', delta: 1 | -1) =>
    patch(side === 'home' ? { homeScore: m.homeScore + delta } : { awayScore: m.awayScore + delta });

  // A decisive shootout needs BOTH pens set, so a click also pins the other
  // side to 0 when it is still null — otherwise Final would keep rejecting.
  const pen = (side: 'home' | 'away', delta: 1 | -1) =>
    patch({
      homePens: (m.homePens ?? 0) + (side === 'home' ? delta : 0),
      awayPens: (m.awayPens ?? 0) + (side === 'away' ? delta : 0),
    });

  function commitTime() {
    const next = startsAt === '' ? null : new Date(startsAt).toISOString();
    if (next === m.startsAt) return;
    void patch({ startsAt: next });
  }

  const homeShort = 'team' in m.home ? m.home.team.shortName : '?';
  const awayShort = 'team' in m.away ? m.away.team.shortName : '?';
  // Pens decide a level knockout; only offer them once the game is underway.
  const showPens = m.status !== 'scheduled' && m.homeScore === m.awayScore;

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
            <strong>{m.homeScore}:{m.awayScore}</strong>
            {m.homePens != null && m.awayPens != null && (
              <span className="muted">({m.homePens}:{m.awayPens})</span>
            )}
            <span className="muted">{t(`status.${m.status}`)}</span>
          </div>

          <div className="admin__grid">
            <div className="admin__side">
              <span className="admin__label">{homeShort}</span>
              <div className="admin__btns">
                <button disabled={busy} onClick={() => void goal('home', 1)} className="btn btn--goal">{t('adminControls.goal')}</button>
                <button disabled={busy || m.homeScore <= 0} onClick={() => void goal('home', -1)} className="btn btn--ghost">−</button>
              </div>
            </div>
            <div className="admin__side">
              <span className="admin__label">{awayShort}</span>
              <div className="admin__btns">
                <button disabled={busy} onClick={() => void goal('away', 1)} className="btn btn--goal">{t('adminControls.goal')}</button>
                <button disabled={busy || m.awayScore <= 0} onClick={() => void goal('away', -1)} className="btn btn--ghost">−</button>
              </div>
            </div>
          </div>

          {showPens && (
            <div className="slot-editor__pens">
              <span className="muted">{t('adminBracket.pens')}</span>
              <div className="admin__btns">
                <button disabled={busy} onClick={() => void pen('home', 1)} className="btn btn--sm">{homeShort} +1</button>
                <button disabled={busy || (m.homePens ?? 0) <= 0} onClick={() => void pen('home', -1)} className="btn btn--sm btn--ghost">−</button>
              </div>
              <div className="admin__btns">
                <button disabled={busy} onClick={() => void pen('away', 1)} className="btn btn--sm">{awayShort} +1</button>
                <button disabled={busy || (m.awayPens ?? 0) <= 0} onClick={() => void pen('away', -1)} className="btn btn--sm btn--ghost">−</button>
              </div>
            </div>
          )}

          <div className="admin__status">
            <button disabled={busy || m.status === 'live'} onClick={() => void patch({ status: 'live' })} className="btn btn--sm">{t('adminControls.start')}</button>
            <button disabled={busy || m.status === 'finished'} onClick={() => void patch({ status: 'finished' })} className="btn btn--sm">{t('adminControls.final')}</button>
            <button disabled={busy || m.status === 'scheduled'} onClick={() => void patch({ status: 'scheduled', homeScore: 0, awayScore: 0, homePens: null, awayPens: null })} className="btn btn--sm btn--ghost">{t('adminControls.reset')}</button>
          </div>

          <label className="field">
            <span>{t('adminMatches.start')}</span>
            <input className="input" type="datetime-local" value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)} onBlur={commitTime} disabled={busy} />
          </label>

          {err && <p className="admin__error">{err}</p>}
        </>
      ) : (
        <p className="muted slot-editor__hint">{t('adminBracket.notReady')}</p>
      )}
    </div>
  );
}

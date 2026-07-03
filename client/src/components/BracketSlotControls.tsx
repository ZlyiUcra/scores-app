import { useEffect, useMemo, useState } from 'react';
import type { BracketMatch, BracketParticipant, UpdateBracketRequest } from '../../../shared/types';
import { adminApi } from '../api/admin';
import { ApiError } from '../api/client';
import { participantName } from '../lib/bracketLabels';
import { useI18n } from '../i18n';
import { useRosterStore } from '../stores/rosterStore';

/** ISO -> value for <input type="datetime-local"> in the local timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The select shows the pinned team when a side is manual, "(auto)" otherwise. */
function overrideValue(p: BracketParticipant): string {
  return 'team' in p && p.manual ? p.team.id : '';
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
  const teams = useRosterStore((s) => s.teams);
  // Rebuilt only when the roster changes, NOT on every bracket snapshot, so
  // the option children stay reference-equal across score-click re-renders.
  const teamOptions = useMemo(
    () =>
      teams.map((tm) => (
        <option key={tm.id} value={tm.id}>
          {tm.name}
        </option>
      )),
    [teams],
  );

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

  // Scoring a scheduled game also starts it — one click instead of two.
  const goal = (side: 'home' | 'away', delta: 1 | -1) =>
    patch({
      ...(side === 'home' ? { homeScore: m.homeScore + delta } : { awayScore: m.awayScore + delta }),
      ...(delta === 1 && m.status === 'scheduled' ? { status: 'live' as const } : null),
    });

  // A decisive shootout needs BOTH pens set, so a click also pins the other
  // side to 0 when it is still null — otherwise Final would keep rejecting.
  const pen = (side: 'home' | 'away', delta: 1 | -1) =>
    patch({
      homePens: (m.homePens ?? 0) + (side === 'home' ? delta : 0),
      awayPens: (m.awayPens ?? 0) + (side === 'away' ? delta : 0),
    });

  // Pin a side to a team ('' = back to auto/derived). Available regardless of
  // readiness — pinning teams into a pending slot IS the walkover use case.
  const setOverride = (side: 'home' | 'away', value: string) =>
    patch(
      side === 'home'
        ? { homeOverrideId: value === '' ? null : value }
        : { awayOverrideId: value === '' ? null : value },
    );

  function commitTime() {
    const next = startsAt === '' ? null : new Date(startsAt).toISOString();
    if (next === m.startsAt) return;
    void patch({ startsAt: next });
  }

  const homeShort = 'team' in m.home ? m.home.team.shortName : '?';
  const awayShort = 'team' in m.away ? m.away.team.shortName : '?';
  // Pens decide a level knockout. Offered whenever the score is level — a
  // frozen (scheduled) game keeps its score, so pens must stay editable too.
  const showPens = m.homeScore === m.awayScore;

  return (
    <div className={`slot-editor ${ready ? '' : 'slot-editor--pending'}`}>
      <div className="slot-editor__head">
        <span className="slot-editor__slot">{m.slot}</span>
        <span className="slot-editor__names">
          {participantName(m.home, t)} <span className="muted">vs</span> {participantName(m.away, t)}
        </span>
      </div>

      {/* Participant pins live OUTSIDE the ready gate: pinning teams into a
          slot that has none yet is exactly the walkover/override use case. */}
      <div className="slot-editor__overrides">
        <span className="muted">{t('adminBracket.override')}</span>
        <select
          className="input"
          value={overrideValue(m.home)}
          disabled={busy}
          onChange={(e) => void setOverride('home', e.target.value)}
        >
          <option value="">{t('adminBracket.auto')}</option>
          {teamOptions}
        </select>
        <select
          className="input"
          value={overrideValue(m.away)}
          disabled={busy}
          onChange={(e) => void setOverride('away', e.target.value)}
        >
          <option value="">{t('adminBracket.auto')}</option>
          {teamOptions}
        </select>
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
            {/* Freezes the game back to scheduled KEEPING the score (still
                editable) — clearing everything is what the bracket-wide reset
                is for. A 0:0 reset IS the pristine state, so pens go too. */}
            <button
              disabled={busy || m.status === 'scheduled'}
              onClick={() =>
                void patch(
                  m.homeScore === 0 && m.awayScore === 0
                    ? { status: 'scheduled', homePens: null, awayPens: null }
                    : { status: 'scheduled' },
                )
              }
              className="btn btn--sm btn--ghost"
            >{t('adminControls.reset')}</button>
          </div>

          <label className="field">
            <span>{t('adminMatches.start')}</span>
            <input className="input" type="datetime-local" value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)} onBlur={commitTime} disabled={busy} />
          </label>
        </>
      ) : (
        <p className="muted slot-editor__hint">{t('adminBracket.notReady')}</p>
      )}

      {/* Outside the ready gate so pin errors on a pending slot surface too. */}
      {err && <p className="admin__error">{err}</p>}
    </div>
  );
}

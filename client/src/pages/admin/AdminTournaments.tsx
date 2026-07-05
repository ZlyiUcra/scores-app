import { useState, type FormEvent } from 'react';
import type { Tournament, TournamentStatus } from '../../../../shared/types';
import { adminApi } from '../../api/admin';
import { api, ApiError } from '../../api/client';
import { formatDay } from '../../lib/format';
import { DateRangeField } from '../../components/DateRangeField';
import { useDateLabels } from '../../lib/dateLabels';
import { useTournamentStore } from '../../stores/tournamentStore';
import { useI18n } from '../../i18n';

const STATUSES: TournamentStatus[] = ['upcoming', 'active', 'finished'];

/**
 * Admin tournaments panel: create (name, planned dates, status) and inline-
 * edit the same fields. Status is the lifecycle switch — `finished` archives
 * the tournament (server rejects every write inside it), and setting it back
 * is the sanctioned way to reopen one for corrections. Deletion is
 * server-guarded: only an empty tournament, never the last one.
 */
export function AdminTournaments() {
  const { t } = useI18n();
  const dateLabels = useDateLabels();
  const tournaments = useTournamentStore((s) => s.tournaments);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [status, setStatus] = useState<TournamentStatus>('upcoming');
  // Inline edit.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editStartsAt, setEditStartsAt] = useState<string | null>(null);
  const [editEndsAt, setEditEndsAt] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<TournamentStatus>('upcoming');

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      // The tournament list has no socket event — re-fetch after every write
      // so the selector, landing redirect and this table stay truthful.
      const { tournaments: list, defaultId } = await api.listTournaments();
      useTournamentStore.getState().setTournaments(list, defaultId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t(fallback));
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await adminApi.createTournament({ name: name.trim(), startsAt, endsAt, status });
      setName('');
      setStartsAt(null);
      setEndsAt(null);
      setStatus('upcoming');
    }, 'adminTournaments.errorCreate');
  }

  function startEdit(x: Tournament) {
    setEditId(x.id);
    setEditName(x.name);
    setEditStartsAt(x.startsAt ?? null);
    setEditEndsAt(x.endsAt ?? null);
    setEditStatus(x.status);
  }

  return (
    <div className="admin-panel">
      {error && <p className="admin__error">{error}</p>}

      <section className="card">
        <h3>{t('adminTournaments.newTitle')}</h3>
        <form className="stack admin-grid" onSubmit={onCreate}>
          <label className="field">
            <span>{t('adminTournaments.name')}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('adminTournaments.namePlaceholder')} required minLength={2} maxLength={60} />
          </label>
          <label className="field">
            <span>{t('adminTournaments.colDates')}</span>
            <DateRangeField
              value={{ start: startsAt, end: endsAt }}
              onChange={(r) => {
                setStartsAt(r.start);
                setEndsAt(r.end);
              }}
              labels={dateLabels}
              placeholder={`${t('date.hint')} - ${t('date.hint')}`}
            />
          </label>
          <label className="field">
            <span>{t('adminTournaments.status')}</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as TournamentStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`tournaments.${s}`)}</option>)}
            </select>
          </label>
          <button className="btn btn--primary" disabled={busy} type="submit">{t('adminTournaments.add')}</button>
        </form>
      </section>

      <section className="card">
        <h3>{t('adminTournaments.listTitle')} ({tournaments.length})</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('adminTournaments.colName')}</th>
                <th>{t('adminTournaments.colDates')}</th>
                <th>{t('adminTournaments.colStatus')}</th>
                <th className="table__actions">{t('adminTournaments.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((x) => {
                const editing = editId === x.id;
                return (
                  <tr key={x.id}>
                    <td>
                      {editing ? (
                        <input className="input" value={editName} maxLength={60}
                          onChange={(e) => setEditName(e.target.value)} aria-label={t('adminTournaments.name')} />
                      ) : (
                        x.name
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <DateRangeField
                          value={{ start: editStartsAt, end: editEndsAt }}
                          onChange={(r) => {
                            setEditStartsAt(r.start);
                            setEditEndsAt(r.end);
                          }}
                          labels={dateLabels}
                          placeholder={`${t('date.hint')} - ${t('date.hint')}`}
                          ariaLabel={t('adminTournaments.colDates')}
                        />
                      ) : (
                        <span>
                          {x.startsAt || x.endsAt
                            ? `${x.startsAt ? formatDay(x.startsAt) : '…'} - ${x.endsAt ? formatDay(x.endsAt) : '…'}`
                            : '—'}
                        </span>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select className="input" value={editStatus} aria-label={t('adminTournaments.status')}
                          onChange={(e) => setEditStatus(e.target.value as TournamentStatus)}>
                          {STATUSES.map((s) => <option key={s} value={s}>{t(`tournaments.${s}`)}</option>)}
                        </select>
                      ) : (
                        <span className={`chip chip--${x.status}`}>{t(`tournaments.${x.status}`)}</span>
                      )}
                    </td>
                    <td className="table__actions">
                      {editing ? (
                        <>
                          <button className="btn btn--sm btn--primary" disabled={busy}
                            onClick={() => void run(async () => {
                              await adminApi.updateTournament(x.id, {
                                name: editName.trim(),
                                startsAt: editStartsAt,
                                endsAt: editEndsAt,
                                status: editStatus,
                              });
                              setEditId(null);
                            }, 'adminTournaments.errorUpdate')}>{t('adminTournaments.save')}</button>
                          <button className="btn btn--sm btn--ghost" onClick={() => setEditId(null)}>{t('adminTournaments.cancel')}</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn--sm" onClick={() => startEdit(x)}>{t('adminTournaments.edit')}</button>
                          <button className="btn btn--sm btn--danger" disabled={busy} title={t('adminTournaments.deleteTitle')}
                            onClick={() => { if (!window.confirm(t('common.deleteConfirm'))) return; void run(() => adminApi.deleteTournament(x.id), 'adminTournaments.errorDelete'); }}>{t('adminTournaments.delete')}</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

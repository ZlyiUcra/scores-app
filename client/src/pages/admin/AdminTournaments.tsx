import type { TournamentStatus } from '../../../../shared/types';
import { formatDay } from '../../lib/format';
import { DateRangeField } from '../../components/DateRangeField';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useDateLabels } from '../../lib/dateLabels';
import { useI18n } from '../../i18n';
import { useAdminTournaments } from './useAdminTournaments';

const STATUSES: TournamentStatus[] = ['upcoming', 'active', 'finished'];

/**
 * Admin tournaments panel: create (name, planned dates, status) and inline-
 * edit the same fields. Pure presentation - all state and mutations live in
 * useAdminTournaments. Status is the lifecycle switch: `finished` archives the
 * tournament (server rejects every write inside it), and setting it back is the
 * sanctioned way to reopen one for corrections. Deletion is server-guarded:
 * only an empty tournament, never the last one.
 */
export function AdminTournaments() {
  const { t } = useI18n();
  const dateLabels = useDateLabels();
  const { tournaments, busy, error, create, edit, requestDelete, deleteConfirm } = useAdminTournaments();

  return (
    <div className="admin-panel">
      {error && <p className="admin__error">{error}</p>}

      <section className="card">
        <h3>{t('adminTournaments.newTitle')}</h3>
        <form className="stack admin-grid" onSubmit={create.submit}>
          <label className="field">
            <span>{t('adminTournaments.name')}</span>
            <input className="input" value={create.name} onChange={(e) => create.setName(e.target.value)}
              placeholder={t('adminTournaments.namePlaceholder')} required minLength={2} maxLength={60} />
          </label>
          <label className="field">
            <span>{t('adminTournaments.colDates')}</span>
            <DateRangeField
              value={create.range}
              onChange={create.setRange}
              labels={dateLabels}
              placeholder={`${t('date.hint')} - ${t('date.hint')}`}
            />
          </label>
          <label className="field">
            <span>{t('adminTournaments.status')}</span>
            <select className="input" value={create.status} onChange={(e) => create.setStatus(e.target.value as TournamentStatus)}>
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
                const editing = edit.activeId === x.id;
                return (
                  <tr key={x.id}>
                    <td>
                      {editing ? (
                        <input className="input" value={edit.name} maxLength={60}
                          onChange={(e) => edit.setName(e.target.value)} aria-label={t('adminTournaments.name')} />
                      ) : (
                        x.name
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <DateRangeField
                          value={edit.range}
                          onChange={edit.setRange}
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
                        <select className="input" value={edit.status} aria-label={t('adminTournaments.status')}
                          onChange={(e) => edit.setStatus(e.target.value as TournamentStatus)}>
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
                            onClick={() => void edit.save(x.id)}>{t('adminTournaments.save')}</button>
                          <button className="btn btn--sm btn--ghost" onClick={edit.cancel}>{t('adminTournaments.cancel')}</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn--sm" onClick={() => edit.begin(x)}>{t('adminTournaments.edit')}</button>
                          <button className="btn btn--sm btn--danger" disabled={busy} title={t('adminTournaments.deleteTitle')}
                            onClick={() => requestDelete(x.id)}>{t('adminTournaments.delete')}</button>
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

      {deleteConfirm && <ConfirmDialog {...deleteConfirm} />}
    </div>
  );
}

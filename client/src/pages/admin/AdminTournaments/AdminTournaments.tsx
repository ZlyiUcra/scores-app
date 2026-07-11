import { useRef, type ChangeEvent } from 'react';
import type { TournamentStatus } from '../../../../../shared/types';
import { formatDay } from '../../../lib/format';
import { DateRangeField } from '../../../components/DateRangeField';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { useDateLabels } from '../../../lib/dateLabels';
import { useI18n } from '../../../i18n';
import { actionIcons } from '../../../constants';
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
  const { tournaments, busy, error, create, edit, requestDelete, deleteConfirm, exportTournament, exportPdf, importTournament } =
    useAdminTournaments();
  const importInputRef = useRef<HTMLInputElement>(null);

  function pickImportFile() {
    importInputRef.current?.click();
  }

  function onImportFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) void importTournament(file);
  }

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
        <div className="admin-panel__head">
          <h3>{t('adminTournaments.listTitle')} ({tournaments.length})</h3>
          <div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={onImportFileChosen}
            />
            <button className="btn btn--sm" disabled={busy} title={t('adminTournaments.importTitle')} aria-label={t('adminTournaments.import')}
              onClick={pickImportFile}>{actionIcons.import}</button>
          </div>
        </div>
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
                            ? `${x.startsAt ? formatDay(x.startsAt) : '...'} - ${x.endsAt ? formatDay(x.endsAt) : '...'}`
                            : '-'}
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
                          <button className="btn btn--sm btn--primary" disabled={busy} title={t('adminTournaments.save')} aria-label={t('adminTournaments.save')}
                            onClick={() => void edit.save(x.id)}>{actionIcons.save}</button>
                          <button className="btn btn--sm btn--ghost" title={t('adminTournaments.cancel')} aria-label={t('adminTournaments.cancel')}
                            onClick={edit.cancel}>{actionIcons.cancel}</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn--sm" title={t('adminTournaments.edit')} aria-label={t('adminTournaments.edit')}
                            onClick={() => edit.begin(x)}>{actionIcons.edit}</button>
                          <button className="btn btn--sm" disabled={busy} title={t('adminTournaments.exportTitle')} aria-label={t('adminTournaments.export')}
                            onClick={() => void exportTournament(x.id)}>{actionIcons.exportJson}</button>
                          <button className="btn btn--sm" disabled={busy} title={t('adminTournaments.exportPdfTitle')} aria-label={t('adminTournaments.exportPdf')}
                            onClick={() => void exportPdf(x)}>
                            <span className="icon-pdf">{actionIcons.exportPdf}<span className="icon-pdf__label">PDF</span></span>
                          </button>
                          <button className="btn btn--sm btn--danger" disabled={busy} title={t('adminTournaments.deleteTitle')} aria-label={t('adminTournaments.delete')}
                            onClick={() => requestDelete(x.id)}>{actionIcons.delete}</button>
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

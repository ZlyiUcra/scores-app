import { useI18n } from '../../../i18n';
import { TeamSelect } from '../../../components/TeamSelect';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { useAdminSquads } from './useAdminSquads';

/** Admin squads panel UI - all state and actions live in useAdminSquads. */
export function AdminSquads() {
  const { t } = useI18n();
  const { teams, groups, busy, error, teamId, selectTeam, squad, create, edit, requestDelete, deleteConfirm } = useAdminSquads();

  return (
    <div className="admin-panel">
      {error && <p className="admin__error">{error}</p>}

      <section className="card">
        <h3>{t('adminSquads.title')}</h3>
        <label className="field">
          <span>{t('adminSquads.team')}</span>
          <TeamSelect
            teams={teams}
            groups={groups}
            value={teamId}
            onChange={selectTeam}
            placeholder={t('adminSquads.selectTeam')}
            ungroupedLabel={t('adminSquads.ungrouped')}
            ariaLabel={t('adminSquads.team')}
          />
        </label>
        {!teamId && <p>{t('adminSquads.pickTeam')}</p>}
      </section>

      {teamId && (
        <>
          <section className="card">
            <h3>{t('adminSquads.newPlayer')}</h3>
            <form className="stack" onSubmit={create.submit}>
              <input className="input" placeholder={t('adminSquads.namePlaceholder')} value={create.name}
                onChange={(e) => create.setName(e.target.value)} required minLength={2} maxLength={40} />
              <input className="input" type="number" min={1} max={99} placeholder={t('adminSquads.numberPlaceholder')}
                value={create.number} onChange={(e) => create.setNumber(e.target.value)} />
              <input className="input" placeholder={t('adminSquads.positionPlaceholder')} value={create.position}
                onChange={(e) => create.setPosition(e.target.value)} maxLength={20} />
              <button className="btn btn--primary" disabled={busy} type="submit">{t('adminSquads.addPlayer')}</button>
            </form>
          </section>

          <section className="card">
            <h3>{t('adminSquads.playersTitle')} ({squad.length})</h3>
            {squad.length === 0 ? (
              <p>{t('adminSquads.empty')}</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('adminSquads.colNumber')}</th>
                      <th>{t('adminSquads.colName')}</th>
                      <th>{t('adminSquads.colPosition')}</th>
                      <th className="table__actions">{t('adminSquads.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {squad.map((p) => {
                      const editing = edit.id === p.id;
                      return (
                        <tr key={p.id}>
                          <td>
                            {editing ? (
                              <input className="input input--num" type="number" min={1} max={99} value={edit.number}
                                onChange={(e) => edit.setNumber(e.target.value)} aria-label={t('adminSquads.colNumber')} />
                            ) : (
                              p.number ?? '-'
                            )}
                          </td>
                          <td>
                            {editing ? (
                              <input className="input" value={edit.name} maxLength={40}
                                onChange={(e) => edit.setName(e.target.value)} aria-label={t('adminSquads.colName')} />
                            ) : (
                              p.name
                            )}
                          </td>
                          <td>
                            {editing ? (
                              <input className="input input--short" value={edit.position} maxLength={20}
                                onChange={(e) => edit.setPosition(e.target.value)} aria-label={t('adminSquads.colPosition')} />
                            ) : (
                              p.position ?? '-'
                            )}
                          </td>
                          <td className="table__actions">
                            {editing ? (
                              <>
                                <button className="btn btn--sm btn--primary" disabled={busy}
                                  onClick={() => void edit.save(p.id)}>{t('adminSquads.save')}</button>
                                <button className="btn btn--sm btn--ghost" onClick={edit.cancel}>{t('adminSquads.cancel')}</button>
                              </>
                            ) : (
                              <>
                                <button className="btn btn--sm" onClick={() => edit.begin(p)}>{t('adminSquads.edit')}</button>
                                <button className="btn btn--sm btn--danger" disabled={busy}
                                  onClick={() => requestDelete(p.id)}>{t('adminSquads.delete')}</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {deleteConfirm && <ConfirmDialog {...deleteConfirm} />}
    </div>
  );
}

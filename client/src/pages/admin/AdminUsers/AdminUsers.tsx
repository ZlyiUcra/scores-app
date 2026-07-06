import { formatDay } from '../../../lib/format';
import { useAuth } from '../../../auth/AuthContext';
import { useI18n } from '../../../i18n';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { useAdminUsers } from './useAdminUsers';

/** Admin user management UI - all state and actions live in useAdminUsers. */
export function AdminUsers() {
  const { user: me } = useAuth();
  const { t } = useI18n();
  const { data, error, busyId, q, page, totalPages, search, setPage, toggleActive, toggleRole, requestDelete, deleteConfirm } = useAdminUsers();

  return (
    <div className="admin-panel">
      <div className="admin-panel__head">
        <h2>{t('adminUsers.title')} {data ? `(${data.total})` : ''}</h2>
        <input
          className="admin-panel__search"
          placeholder={t('adminUsers.search')}
          value={q}
          onChange={(e) => search(e.target.value)}
        />
      </div>

      {error && <p className="admin__error">{error}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('adminUsers.colUsername')}</th>
              <th>{t('adminUsers.colRole')}</th>
              <th>{t('adminUsers.colStatus')}</th>
              <th>{t('adminUsers.colCreated')}</th>
              <th className="table__actions">{t('adminUsers.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => {
              const isSelf = u.id === me?.id;
              const busy = busyId === u.id;
              return (
                <tr key={u.id} className={u.active ? '' : 'row--inactive'}>
                  <td>{u.username}{isSelf && <span className="tag">{t('adminUsers.you')}</span>}</td>
                  <td><span className={`chip chip--${u.role}`}>{u.role === 'admin' ? t('role.admin') : t('role.viewer')}</span></td>
                  <td>{u.active ? t('adminUsers.active') : t('adminUsers.inactive')}</td>
                  <td className="muted">{formatDay(u.createdAt)}</td>
                  <td className="table__actions">
                    <button className="btn btn--sm" disabled={busy || isSelf}
                      onClick={() => toggleActive(u)}>
                      {u.active ? t('adminUsers.deactivate') : t('adminUsers.activate')}
                    </button>
                    <button className="btn btn--sm" disabled={busy || isSelf}
                      onClick={() => toggleRole(u)}>
                      {u.role === 'admin' ? t('adminUsers.demote') : t('adminUsers.promote')}
                    </button>
                    <button className="btn btn--sm btn--danger" disabled={busy || isSelf}
                      onClick={() => requestDelete(u.id)}>
                      {t('adminUsers.delete')}
                    </button>
                  </td>
                </tr>
              );
            })}
            {data && data.items.length === 0 && (
              <tr><td colSpan={5} className="muted">{t('adminUsers.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button className="btn btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('adminUsers.prev')}</button>
        <span className="muted">{t('adminUsers.page', { page, total: totalPages })}</span>
        <button className="btn btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('adminUsers.next')}</button>
      </div>

      {deleteConfirm && <ConfirmDialog {...deleteConfirm} />}
    </div>
  );
}

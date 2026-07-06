import { useI18n } from '../../../i18n';
import { formatDay, formatTime } from '../../../lib/format';
import { useAdminAudit } from './useAdminAudit';

/** Admin audit-trail viewer: the most recent admin actions, newest first. */
export function AdminAudit() {
  const { t } = useI18n();
  const { entries, error } = useAdminAudit();

  return (
    <div className="admin-panel">
      <h2>{t('adminAudit.title')}</h2>
      {error && <p className="admin__error">{error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('adminAudit.colTime')}</th>
              <th>{t('adminAudit.colUser')}</th>
              <th>{t('adminAudit.colAction')}</th>
              <th>{t('adminAudit.colTarget')}</th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((e) => (
              <tr key={e.id}>
                <td className="muted">{formatDay(e.ts)} {formatTime(e.ts)}</td>
                <td>{e.username}</td>
                <td><code>{e.action}</code></td>
                <td className="muted">{e.target}</td>
              </tr>
            ))}
            {entries && entries.length === 0 && (
              <tr><td colSpan={4} className="muted">{t('adminAudit.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

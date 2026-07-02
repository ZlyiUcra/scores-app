import { NavLink, Navigate, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n';

export function AdminLayout() {
  const { isAdmin } = useAuth();
  const { t } = useI18n();

  // Client-side guard is defense-in-depth only — the server's requireAdmin on
  // /api/admin is the real boundary. A non-admin who reaches here sees nothing.
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="admin-area">
      <div className="admin-area__bar">
        <Link to="/" className="back">{t('adminLayout.back')}</Link>
        <nav className="subnav">
          <NavLink to="/admin/users" className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.users')}
          </NavLink>
          <NavLink to="/admin/matches" className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.matches')}
          </NavLink>
          <NavLink to="/admin/squads" className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.squads')}
          </NavLink>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}

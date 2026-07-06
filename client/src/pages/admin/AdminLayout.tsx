import React, { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, Link } from 'react-router-dom';
import type { Tournament } from '../../../../shared/types';
import { useAuth } from '../../auth/AuthContext';
import { useTournamentStore } from '../../stores/tournamentStore';
import { useTournamentFeed } from '../../tournament/useTournamentFeed';
import { LoadError } from '../../components/LoadError';
import { useI18n } from '../../i18n';

/** The tournament every admin action on Games/Squads applies to. */
interface AdminTournamentValue {
  tournament: Tournament;
}

const AdminTournamentContext = React.createContext<AdminTournamentValue | null>(null);

/** Selected admin tournament. Throws outside /admin — only admin pages use it. */
export function useAdminTournament(): AdminTournamentValue {
  const value = React.useContext(AdminTournamentContext);
  if (!value) throw new Error('useAdminTournament outside AdminLayout');
  return value;
}

/**
 * Shared frame for /admin/*: the sub-navigation, a client-side role gate and
 * the TOURNAMENT SELECTOR — every roster/game/squad action below applies to
 * the selected tournament (so an upcoming tournament can be set up before it
 * goes active). The selection also drives the admin area's own data feed
 * (stores + socket room), independent of the public /t/:id pages. A finished
 * selection is view-only: the server rejects writes, the bar says why.
 */
export function AdminLayout() {
  const { isAdmin } = useAuth();
  const { t } = useI18n();
  const tournaments = useTournamentStore((s) => s.tournaments);
  const defaultId = useTournamentStore((s) => s.defaultId);
  const loaded = useTournamentStore((s) => s.loaded);
  const listError = useTournamentStore((s) => s.error);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Refresh the list on entry (tournaments have no socket event) — the admin
  // may have just created one elsewhere or its status may have changed.
  useEffect(() => {
    void useTournamentStore.getState().load();
  }, []);

  // Until the admin picks one, follow the server's default tournament. An id
  // that disappeared (deleted elsewhere) also falls back to the default.
  const tournament =
    tournaments.find((x) => x.id === selectedId) ?? tournaments.find((x) => x.id === defaultId) ?? null;

  const { error: feedError, reload } = useTournamentFeed(tournament?.id ?? null);

  // Client-side guard is defense-in-depth only — the server's requireAdmin on
  // /api/admin is the real boundary. A non-admin who reaches here sees nothing.
  if (!isAdmin) return <Navigate to="/" replace />;
  if (!loaded || !tournament) {
    if (listError && !loaded) return <LoadError onRetry={() => void useTournamentStore.getState().load()} />;
    return <div className="splash">{t('app.loading')}</div>;
  }

  return (
    <div className="admin-area">
      <div className="admin-area__bar">
        <Link to="/" className="back">{t('adminLayout.back')}</Link>
        <nav className="subnav">
          <NavLink to="/admin/users" className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.users')}
          </NavLink>
          <NavLink to="/admin/tournaments" className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.tournaments')}
          </NavLink>
          <NavLink to="/admin/matches" className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.matches')}
          </NavLink>
          <NavLink to="/admin/squads" className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.squads')}
          </NavLink>
          <NavLink to="/admin/audit" className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.audit')}
          </NavLink>
        </nav>
      </div>
      <div className="tour-bar">
        <label className="tour-bar__pick">
          <span className="muted">{t('adminLayout.tournament')}</span>
          <select className="input" value={tournament.id} onChange={(e) => setSelectedId(e.target.value)}>
            {tournaments.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({t(`tournaments.${x.status}`)})
              </option>
            ))}
          </select>
        </label>
        {tournament.status === 'finished' && (
          <span className="muted tour-bar__note">{t('adminLayout.finishedNote')}</span>
        )}
      </div>
      <AdminTournamentContext.Provider value={{ tournament }}>
        {feedError ? <LoadError onRetry={reload} /> : <Outlet />}
      </AdminTournamentContext.Provider>
    </div>
  );
}

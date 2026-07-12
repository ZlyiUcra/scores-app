import React, { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, Link, useLocation, useSearchParams } from 'react-router-dom';
import type { Tournament } from '../../../../shared/types';
import { useAuth } from '../../auth/AuthContext';
import { useTournamentStore } from '../../stores/tournamentStore';
import { useTournamentFeed } from '../../tournament/useTournamentFeed';
import { LoadError } from '../../components/LoadError';
import { useI18n } from '../../i18n';

/** The tournament every admin action on Games/Squads applies to. */
type AdminTournamentValue = {
  tournament: Tournament;
};

const AdminTournamentContext = React.createContext<AdminTournamentValue | null>(null);

/** Selected admin tournament. Throws outside the scoped admin pages - only they use it. */
export function useAdminTournament(): AdminTournamentValue {
  const value = React.useContext(AdminTournamentContext);
  if (!value) throw new Error('useAdminTournament outside AdminLayout');
  return value;
}

/** The admin tabs whose content depends on the selected tournament; the other
 * tabs (Users/Tournaments/Audit) are global and show no tournament chrome. */
const scopedRoots = ['/admin/matches', '/admin/squads'];

/**
 * Shared frame for /admin/*: the sub-navigation, a client-side role gate and
 * the TOURNAMENT SELECTOR - shown only on the tournament-scoped tabs (Games,
 * Squads). The selection lives in the `?t=` query param as its single source
 * of truth (reload and deep links restore it; the subnav links carry it across
 * tabs), falling back to the server's default tournament when absent. The
 * selection drives the admin area's own data feed (stores + socket room),
 * which stays mounted across ALL tabs so switching tabs never refetches. A
 * finished selection is view-only: the server rejects writes, the bar says why.
 */
export function AdminLayout() {
  const { isAdmin } = useAuth();
  const { t } = useI18n();
  const tournaments = useTournamentStore((s) => s.tournaments);
  const defaultId = useTournamentStore((s) => s.defaultId);
  const loaded = useTournamentStore((s) => s.loaded);
  const listError = useTournamentStore((s) => s.error);
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Gates URL canonicalization on THIS entry's list refresh - a stale list
  // must not strip a deep link to a just-created tournament.
  const [refreshed, setRefreshed] = useState(false);

  // Refresh the list on entry (tournaments have no socket event) - the admin
  // may have just created one elsewhere or its status may have changed.
  useEffect(() => {
    void useTournamentStore
      .getState()
      .load()
      .then(() => {
        if (!useTournamentStore.getState().error) setRefreshed(true);
      });
  }, []);

  const paramId = searchParams.get('t');
  // No explicit pick in the URL - follow the server's default tournament. An
  // id that disappeared (deleted elsewhere) also falls back to the default.
  const tournament =
    tournaments.find((x) => x.id === paramId) ?? tournaments.find((x) => x.id === defaultId) ?? null;

  // The URL must never claim a tournament the screen does not show: once the
  // fresh list proves `?t=` stale, strip it (a bare URL means the default).
  useEffect(() => {
    if (!refreshed || !paramId || tournament?.id === paramId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('t');
    setSearchParams(next, { replace: true });
  }, [refreshed, paramId, tournament, searchParams, setSearchParams]);

  const { error: feedError, reload } = useTournamentFeed(tournament?.id ?? null);

  // Client-side guard is defense-in-depth only - the server's requireAdmin on
  // /api/admin is the real boundary. A non-admin who reaches here sees nothing.
  if (!isAdmin) return <Navigate to="/" replace />;

  const scoped = scopedRoots.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // The single owner of carrying `?t=` across tabs: every subnav link goes
  // through it, so the selection survives detours over the global tabs.
  const search = searchParams.toString();
  const tabTo = (path: string) => (search ? `${path}?${search}` : path);

  const scopedContent = () => {
    if (!loaded) {
      if (listError) return <LoadError onRetry={() => void useTournamentStore.getState().load()} />;
      return <div className="splash">{t('app.loading')}</div>;
    }
    if (!tournament) return <div className="splash">{t('adminLayout.noTournaments')}</div>;
    return (
      <>
        <div className="tour-bar">
          <label className="tour-bar__pick">
            <span className="muted">{t('adminLayout.tournament')}</span>
            <select
              className="input"
              value={tournament.id}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                next.set('t', e.target.value);
                setSearchParams(next, { replace: true });
              }}
            >
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
      </>
    );
  };

  return (
    <div className="admin-area">
      <div className="admin-area__bar">
        <Link to={tournament ? `/t/${tournament.id}` : '/'} className="back">{t('adminLayout.back')}</Link>
        <nav className="subnav">
          <NavLink to={tabTo('/admin/users')} className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.users')}
          </NavLink>
          <NavLink to={tabTo('/admin/tournaments')} className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.tournaments')}
          </NavLink>
          <NavLink to={tabTo('/admin/matches')} className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.matches')}
          </NavLink>
          <NavLink to={tabTo('/admin/squads')} className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.squads')}
          </NavLink>
          <NavLink to={tabTo('/admin/audit')} className={({ isActive }) => `subnav__link ${isActive ? 'subnav__link--active' : ''}`}>
            {t('adminLayout.audit')}
          </NavLink>
        </nav>
      </div>
      {scoped ? scopedContent() : <Outlet />}
    </div>
  );
}

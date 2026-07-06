import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, Link, NavLink, matchPath, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { useTournamentStore, selectDefaultId, selectError, selectLoaded, selectTournaments } from './stores/tournamentStore';
import { LoadError } from './components/LoadError';
import { TournamentScope } from './tournament/TournamentScope';
import { useI18n, LANGS } from './i18n';
import { Login } from './pages/Login';
import { Tournaments } from './pages/Tournaments';
import { Overview } from './pages/Overview';
import { MatchList } from './pages/MatchList';
import { Knockout } from './pages/Knockout';
import { KnockoutDetail } from './pages/KnockoutDetail';
import { Squads } from './pages/Squads';
import { Help } from './pages/Help';
import { MatchDetail } from './pages/MatchDetail';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminTournaments } from './pages/admin/AdminTournaments';
import { AdminMatches } from './pages/admin/AdminMatches';
import { AdminSquads } from './pages/admin/AdminSquads';
import { AdminAudit } from './pages/admin/AdminAudit';

function LangSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l}
          className={`lang__btn ${l === lang ? 'lang__btn--active' : ''}`}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Header() {
  const { user, isAdmin, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const defaultId = useTournamentStore(selectDefaultId);
  const [menuOpen, setMenuOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = () => setMenuOpen(false);

  // Escape closes the panel and returns focus to the burger so keyboard users
  // are not left inside a hidden subtree. The listener exists only while open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      setMenuOpen(false);
      burgerRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  // Tournament pages link within the tournament currently on screen; outside
  // one (tournaments list, help, admin) they lead into the default tournament.
  const scoped = matchPath('/t/:tournamentId/*', location.pathname) ?? matchPath('/t/:tournamentId', location.pathname);
  const tournamentId = scoped?.params.tournamentId ?? defaultId;
  const base = tournamentId ? `/t/${tournamentId}` : null;

  const link = ({ isActive }: { isActive: boolean }) =>
    `header__nav-link ${isActive ? 'header__nav-link--active' : ''}`;
  return (
    <header className="header">
      <Link to="/" className="header__brand">{t('tournament.short')}</Link>
      <button
        ref={burgerRef}
        type="button"
        className="header__burger"
        aria-expanded={menuOpen}
        aria-controls="header-menu"
        aria-label={t('header.menu')}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <span className="header__burger-bar" />
      </button>
      {/* Rendered ONCE for both layouts: desktop dissolves this wrapper via
          display:contents; mobile shows it as the dropdown panel while open.
          Links close the menu via onClick because a same-route click fires no
          location change. */}
      <div id="header-menu" className={`header__menu ${menuOpen ? 'header__menu--open' : ''}`}>
        <nav className="header__nav">
          <NavLink to="/tournaments" className={link} onClick={closeMenu}>{t('nav.tournaments')}</NavLink>
          {base && (
            <>
              <NavLink to={base} end className={link} onClick={closeMenu}>{t('nav.overview')}</NavLink>
              <NavLink to={`${base}/results`} className={link} onClick={closeMenu}>{t('nav.results')}</NavLink>
              <NavLink to={`${base}/ko`} className={link} onClick={closeMenu}>{t('nav.knockout')}</NavLink>
              <NavLink to={`${base}/teams`} className={link} onClick={closeMenu}>{t('nav.teams')}</NavLink>
            </>
          )}
          <NavLink to="/help" className={link} onClick={closeMenu}>{t('nav.help')}</NavLink>
          {isAdmin && <NavLink to="/admin" className={link} onClick={closeMenu}>{t('nav.admin')}</NavLink>}
        </nav>
        <div className="header__right">
          <LangSwitcher />
          <span className="header__user">
            {user?.username}
            <span className={`chip chip--${user?.role}`}>{user?.role === 'admin' ? t('role.admin') : t('role.viewer')}</span>
          </span>
          <button className="btn btn--sm btn--ghost" onClick={() => void logout()}>{t('header.logout')}</button>
        </div>
      </div>
    </header>
  );
}

/** Root: exactly one active tournament -> straight into it (the common case);
 * otherwise the tournaments page decides. */
function Landing() {
  const { t } = useI18n();
  const tournaments = useTournamentStore(selectTournaments);
  const loaded = useTournamentStore(selectLoaded);
  const error = useTournamentStore(selectError);
  if (!loaded) {
    if (error) return <LoadError onRetry={() => void useTournamentStore.getState().load()} />;
    return <div className="splash">{t('app.loading')}</div>;
  }
  const active = tournaments.filter((x) => x.status === 'active');
  if (active.length === 1) return <Navigate to={`/t/${active[0].id}`} replace />;
  return <Navigate to="/tournaments" replace />;
}

/** Pre-tournament deep links (`/results`, `/ko/R8M0`, ...) redirect into the
 * default tournament so old bookmarks keep working. */
function LegacyRedirect({ page }: { page: 'results' | 'ko' | 'teams' | 'match' }) {
  const { t } = useI18n();
  const params = useParams();
  const defaultId = useTournamentStore(selectDefaultId);
  const loaded = useTournamentStore(selectLoaded);
  if (!loaded || !defaultId) return <div className="splash">{t('app.loading')}</div>;
  const tail =
    page === 'ko' && params.slot ? `ko/${params.slot}` : page === 'match' ? `match/${params.id ?? ''}` : page;
  return <Navigate to={`/t/${defaultId}/${tail}`} replace />;
}

/** Root: gates everything behind login, wires the live data feed and lays out
 * the header + routes. */
export function App() {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  // Once authenticated: fetch the tournament list (the root redirect and every
  // /t/:id route depend on it). Per-tournament data is loaded by the
  // TournamentScope layout route, not here.
  useEffect(() => {
    if (!user) return;
    void useTournamentStore.getState().load();
  }, [user]);

  if (loading) return <div className="splash">{t('app.loading')}</div>;
  if (!user) return <Login />;

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/t/:tournamentId" element={<TournamentScope />}>
            <Route index element={<Overview />} />
            <Route path="results" element={<MatchList />} />
            <Route path="ko" element={<Knockout />} />
            <Route path="ko/:slot" element={<KnockoutDetail />} />
            <Route path="teams" element={<Squads />} />
            <Route path="match/:id" element={<MatchDetail />} />
          </Route>
          <Route path="/help" element={<Help />} />
          {/* Pre-tournament URLs — keep old bookmarks alive. */}
          <Route path="/results" element={<LegacyRedirect page="results" />} />
          <Route path="/ko" element={<LegacyRedirect page="ko" />} />
          <Route path="/ko/:slot" element={<LegacyRedirect page="ko" />} />
          <Route path="/teams" element={<LegacyRedirect page="teams" />} />
          <Route path="/match/:id" element={<LegacyRedirect page="match" />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/matches" replace />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="tournaments" element={<AdminTournaments />} />
            <Route path="matches" element={<AdminMatches />} />
            <Route path="squads" element={<AdminSquads />} />
            <Route path="audit" element={<AdminAudit />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, Link, NavLink } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { api } from './api/client';
import { useMatchStore } from './stores/matchStore';
import { useBracketStore } from './stores/bracketStore';
import { useRosterStore } from './stores/rosterStore';
import { connectSocket, disconnectSocket } from './socket';
import { useI18n, LANGS } from './i18n';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { MatchList } from './pages/MatchList';
import { Knockout } from './pages/Knockout';
import { KnockoutDetail } from './pages/KnockoutDetail';
import { Squads } from './pages/Squads';
import { Help } from './pages/Help';
import { MatchDetail } from './pages/MatchDetail';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminMatches } from './pages/admin/AdminMatches';
import { AdminSquads } from './pages/admin/AdminSquads';

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
          <NavLink to="/" end className={link} onClick={closeMenu}>{t('nav.overview')}</NavLink>
          <NavLink to="/results" className={link} onClick={closeMenu}>{t('nav.results')}</NavLink>
          <NavLink to="/ko" className={link} onClick={closeMenu}>{t('nav.knockout')}</NavLink>
          <NavLink to="/teams" className={link} onClick={closeMenu}>{t('nav.teams')}</NavLink>
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

/** Root: gates everything behind login, wires the live data feed and lays out
 * the header + routes. */
export function App() {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  // Once authenticated: pull authoritative state via REST, then open the live
  // socket for diffs. Tear down on logout.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    api
      .listMatches()
      .then(({ matches }) => alive && useMatchStore.getState().setSnapshot(matches))
      .catch((err) => console.error(err));
    api
      .getBracket()
      .then(({ bracket }) => alive && useBracketStore.getState().setBracket(bracket))
      .catch((err) => console.error(err));
    api
      .getRoster()
      .then(({ roster }) => alive && useRosterStore.getState().setRoster(roster))
      .catch((err) => console.error(err));
    connectSocket();
    return () => {
      alive = false;
      disconnectSocket();
    };
  }, [user]);

  if (loading) return <div className="splash">{t('app.loading')}</div>;
  if (!user) return <Login />;

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/results" element={<MatchList />} />
          <Route path="/ko" element={<Knockout />} />
          <Route path="/ko/:slot" element={<KnockoutDetail />} />
          <Route path="/teams" element={<Squads />} />
          <Route path="/help" element={<Help />} />
          <Route path="/match/:id" element={<MatchDetail />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/matches" replace />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="matches" element={<AdminMatches />} />
            <Route path="squads" element={<AdminSquads />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

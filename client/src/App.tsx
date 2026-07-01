import { useEffect } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { api } from './api';
import { useMatchStore } from './store';
import { connectSocket, disconnectSocket } from './socket';
import { useI18n, LANGS } from './i18n';
import { Login } from './pages/Login';
import { MatchList } from './pages/MatchList';
import { MatchDetail } from './pages/MatchDetail';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminMatches } from './pages/admin/AdminMatches';

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
  return (
    <header className="header">
      <Link to="/" className="header__brand">⚽ Live Scores</Link>
      <div className="header__right">
        <LangSwitcher />
        {isAdmin && <Link to="/admin/matches" className="btn btn--sm">{t('header.adminPanel')}</Link>}
        <span className="header__user">
          {user?.username}
          <span className={`chip chip--${user?.role}`}>{user?.role === 'admin' ? t('role.admin') : t('role.viewer')}</span>
        </span>
        <button className="btn btn--sm btn--ghost" onClick={() => void logout()}>{t('header.logout')}</button>
      </div>
    </header>
  );
}

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
          <Route path="/" element={<MatchList />} />
          <Route path="/match/:id" element={<MatchDetail />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/matches" replace />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="matches" element={<AdminMatches />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

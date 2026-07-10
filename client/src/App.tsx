import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { useTournamentStore, selectDefaultId, selectError, selectLoaded, selectTournaments } from './stores/tournamentStore';
import { LoadError } from './components/LoadError';
import { Header } from './components/Header';
import { TournamentScope } from './tournament/TournamentScope';
import { useI18n } from './i18n';
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

/** /admin index -> the default tab, keeping the query string — a plain string
 * Navigate would drop `?t=` and lose the tournament selection carried in. */
function AdminIndexRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/admin/matches${search}`} replace />;
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
            <Route index element={<AdminIndexRedirect />} />
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

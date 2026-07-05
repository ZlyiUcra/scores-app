import React from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import type { Tournament } from '../../../shared/types';
import { useTournamentStore } from '../stores/tournamentStore';
import { useTournamentFeed } from './useTournamentFeed';
import { LoadError } from '../components/LoadError';
import { useI18n } from '../i18n';

/** What every page under /t/:tournamentId can rely on. */
interface TournamentScopeValue {
  tournament: Tournament;
  /** Route prefix of the current tournament (`/t/<id>`), for in-page links. */
  basePath: string;
  /** A finished tournament is an archive: admin controls are hidden. */
  readOnly: boolean;
}

const TournamentContext = React.createContext<TournamentScopeValue | null>(null);

/** Current tournament scope. Throws outside /t/:tournamentId — pages that use
 * it are only ever rendered inside the scope route. */
export function useTournament(): TournamentScopeValue {
  const value = React.useContext(TournamentContext);
  if (!value) throw new Error('useTournament outside TournamentScope');
  return value;
}

/**
 * Layout route for /t/:tournamentId/*: validates the id against the fetched
 * tournament list (unknown -> the tournaments page), provides the scope to
 * every child page, and owns the tournament's data lifecycle (see
 * useTournamentFeed) — torn down and rebuilt whenever the id changes.
 */
export function TournamentScope() {
  const { tournamentId = '' } = useParams();
  const { t } = useI18n();
  const tournaments = useTournamentStore((s) => s.tournaments);
  const loaded = useTournamentStore((s) => s.loaded);
  const listError = useTournamentStore((s) => s.error);
  const tournament = tournaments.find((x) => x.id === tournamentId);

  const { error: feedError, reload } = useTournamentFeed(tournament?.id ?? null);

  // The list is cached for the session and re-fetched on only a few page
  // mounts, so an id missing now may exist on the server (created after our
  // last fetch). Give the list ONE re-fetch per id before treating the id as
  // unknown, instead of bouncing a fresh deep link straight to /tournaments.
  const verifiedMiss = React.useRef<Set<string>>(new Set());
  const [verifying, setVerifying] = React.useState(false);
  React.useEffect(() => {
    if (!loaded || tournament || listError) return;
    if (verifiedMiss.current.has(tournamentId)) return;
    verifiedMiss.current.add(tournamentId);
    setVerifying(true);
    void useTournamentStore.getState().load().finally(() => setVerifying(false));
  }, [loaded, tournament, listError, tournamentId]);

  if (!loaded) {
    if (listError) return <LoadError onRetry={() => void useTournamentStore.getState().load()} />;
    return <div className="splash">{t('app.loading')}</div>;
  }
  if (!tournament) {
    if (verifying) return <div className="splash">{t('app.loading')}</div>;
    return <Navigate to="/tournaments" replace />;
  }

  const readOnly = tournament.status === 'finished';
  return (
    <TournamentContext.Provider value={{ tournament, basePath: `/t/${tournament.id}`, readOnly }}>
      <div className="tour-bar">
        <span className="tour-bar__name">{tournament.name}</span>
        <span className={`chip chip--${tournament.status}`}>{t(`tournaments.${tournament.status}`)}</span>
        {readOnly && <span className="muted tour-bar__note">{t('tournaments.readOnly')}</span>}
      </div>
      {feedError ? <LoadError onRetry={reload} /> : <Outlet />}
    </TournamentContext.Provider>
  );
}

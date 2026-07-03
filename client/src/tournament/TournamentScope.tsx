import React from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import type { Tournament } from '../../../shared/types';
import { api } from '../api/client';
import { connectSocket, disconnectSocket } from '../socket';
import { useMatchStore } from '../stores/matchStore';
import { useBracketStore } from '../stores/bracketStore';
import { useRosterStore } from '../stores/rosterStore';
import { useTournamentStore } from '../stores/tournamentStore';
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
 * every child page, and owns the tournament's data lifecycle — REST snapshot
 * + live socket, torn down and rebuilt whenever the id changes. Stores are
 * cleared first so a tournament switch never flashes the previous
 * tournament's data.
 */
export function TournamentScope() {
  const { tournamentId = '' } = useParams();
  const { t } = useI18n();
  const tournaments = useTournamentStore((s) => s.tournaments);
  const loaded = useTournamentStore((s) => s.loaded);
  const tournament = tournaments.find((x) => x.id === tournamentId);

  React.useEffect(() => {
    if (!tournament) return;
    const id = tournament.id;
    let alive = true;
    // Blank slate before the new tournament's data arrives.
    useMatchStore.getState().setSnapshot([]);
    useBracketStore.getState().setBracket({ formable: false, reason: null, size: 0, matches: [] });
    useRosterStore.getState().setRoster({ groups: [], teams: [], players: [] });
    api
      .listMatches(id)
      .then(({ matches }) => alive && useMatchStore.getState().setSnapshot(matches))
      .catch((err) => console.error(err));
    api
      .getBracket(id)
      .then(({ bracket }) => alive && useBracketStore.getState().setBracket(bracket))
      .catch((err) => console.error(err));
    api
      .getRoster(id)
      .then(({ roster }) => alive && useRosterStore.getState().setRoster(roster))
      .catch((err) => console.error(err));
    connectSocket(id);
    return () => {
      alive = false;
      disconnectSocket();
    };
  }, [tournament?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <div className="splash">{t('app.loading')}</div>;
  if (!tournament) return <Navigate to="/tournaments" replace />;

  const readOnly = tournament.status === 'finished';
  return (
    <TournamentContext.Provider value={{ tournament, basePath: `/t/${tournament.id}`, readOnly }}>
      <div className="tour-bar">
        <span className="tour-bar__name">{tournament.name}</span>
        <span className={`chip chip--${tournament.status}`}>{t(`tournaments.${tournament.status}`)}</span>
        {readOnly && <span className="muted tour-bar__note">{t('tournaments.readOnly')}</span>}
      </div>
      <Outlet />
    </TournamentContext.Provider>
  );
}

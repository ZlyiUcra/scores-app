import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Tournament, TournamentStatus } from '../../../shared/types';
import { api } from '../api/client';
import { useTournamentStore, selectTournaments, selectLoaded } from '../stores/tournamentStore';
import { useI18n } from '../i18n';

function TournamentCard({ tour }: { tour: Tournament }) {
  const { t } = useI18n();
  const dates =
    tour.startsAt || tour.endsAt ? `${tour.startsAt ?? '…'} - ${tour.endsAt ?? '…'}` : null;
  return (
    <Link to={`/t/${tour.id}`} className={`tour-card tour-card--${tour.status}`}>
      <span className="tour-card__name">{tour.name}</span>
      {dates && <span className="muted tour-card__dates">{dates}</span>}
      <span className={`chip chip--${tour.status}`}>{t(`tournaments.${tour.status}`)}</span>
    </Link>
  );
}

/** The tournament picker: every tournament grouped by status — active ones on
 * top (the "what is happening now" answer), then upcoming, then the archive.
 * There is no socket event for tournaments, so the list re-fetches on mount. */
export function Tournaments() {
  const { t } = useI18n();
  const tournaments = useTournamentStore(selectTournaments);
  const loaded = useTournamentStore(selectLoaded);

  useEffect(() => {
    api
      .listTournaments()
      .then(({ tournaments: list, defaultId }) => useTournamentStore.getState().setTournaments(list, defaultId))
      .catch((err) => console.error(err));
  }, []);

  if (!loaded) return <div className="splash">{t('app.loading')}</div>;

  const sections: TournamentStatus[] = ['active', 'upcoming', 'finished'];
  return (
    <div className="tour-list">
      <h2>{t('tournaments.title')}</h2>
      {tournaments.length === 0 && <p className="muted">{t('tournaments.empty')}</p>}
      {sections.map((status) => {
        const items = tournaments.filter((x) => x.status === status);
        if (items.length === 0) return null;
        return (
          <section key={status} className="tour-list__section">
            <h3>{t(`tournaments.section.${status}`)}</h3>
            {items.map((tour) => (
              <TournamentCard key={tour.id} tour={tour} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

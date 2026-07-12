import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Tournament, TournamentStatus } from '../../../shared/types';
import { formatDay } from '../lib/format';
import { useTournamentStore, selectTournaments, selectLoaded, selectError } from '../stores/tournamentStore';
import { LoadError } from '../components/LoadError';
import { Accordion } from '../components/Accordion';
import { Pager } from '../components/Pager';
import { useI18n } from '../i18n';

const defaultPageSize = 20;

function TournamentCard({ tour }: { tour: Tournament }) {
  const { t } = useI18n();
  const dates =
    tour.startsAt || tour.endsAt
      ? `${tour.startsAt ? formatDay(tour.startsAt) : '\u2026'} - ${tour.endsAt ? formatDay(tour.endsAt) : '\u2026'}`
      : null;
  return (
    <Link to={`/t/${tour.id}`} className={`tour-card tour-card--${tour.status}`}>
      <span className="tour-card__name">{tour.name}</span>
      {dates && <span className="muted tour-card__dates">{dates}</span>}
      <span className={`chip chip--${tour.status}`}>{t(`tournaments.${tour.status}`)}</span>
    </Link>
  );
}

/** One status section as an independently collapsible, paginated accordion.
 * Owns its own page/pageSize state - opening/paging one section never
 * affects the others. */
function TournamentSection({ status, items, defaultOpen }: { status: TournamentStatus; items: Tournament[]; defaultOpen: boolean }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return (
    <Accordion
      defaultOpen={defaultOpen}
      title={t('tournaments.sectionTitle', { title: t(`tournaments.section.${status}`), count: items.length })}
    >
      {pageItems.map((tour) => (
        <TournamentCard key={tour.id} tour={tour} />
      ))}
      <Pager
        page={page}
        total={items.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </Accordion>
  );
}

/** The tournament picker: every tournament grouped by status - active ones on
 * top (the "what is happening now" answer), then upcoming, then the archive.
 * There is no socket event for tournaments, so the list re-fetches on mount. */
export function Tournaments() {
  const { t } = useI18n();
  const tournaments = useTournamentStore(selectTournaments);
  const loaded = useTournamentStore(selectLoaded);
  const error = useTournamentStore(selectError);

  useEffect(() => {
    void useTournamentStore.getState().load();
  }, []);

  if (!loaded) {
    if (error) return <LoadError onRetry={() => void useTournamentStore.getState().load()} />;
    return <div className="splash">{t('app.loading')}</div>;
  }

  const sections: TournamentStatus[] = ['active', 'upcoming', 'finished'];
  return (
    <div className="tour-list">
      <h2>{t('tournaments.title')}</h2>
      {tournaments.length === 0 && <p className="muted">{t('tournaments.empty')}</p>}
      {sections.map((status) => {
        const items = tournaments.filter((x) => x.status === status);
        if (items.length === 0) return null;
        return <TournamentSection key={status} status={status} items={items} defaultOpen={status === 'active'} />;
      })}
    </div>
  );
}

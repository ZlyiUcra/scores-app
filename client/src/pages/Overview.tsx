import { computeSize, computeThirdPlaces, TOURNAMENT_FORMAT } from '../../../shared/tournament';
import { useMatchStore } from '../store';
import { useRosterStore } from '../rosterStore';
import { useStandings } from '../standings';
import { StandingsTable } from '../components/StandingsTable';
import { ThirdPlacesTable } from '../components/ThirdPlacesTable';
import { useI18n } from '../i18n';

export function Overview() {
  const { t } = useI18n();
  const tables = useStandings();
  const byId = useMatchStore((s) => s.byId);
  const groups = useRosterStore((s) => s.groups);
  const teams = useRosterStore((s) => s.teams);

  // Best-3rds table appears only when 2 qualifiers per group do not land on a
  // power of two, i.e. some third places must fill the bracket.
  const sizeInfo = computeSize(groups, teams);
  const thirdsNeeded = sizeInfo.formable
    ? sizeInfo.size - TOURNAMENT_FORMAT.qualifiersPerGroup * groups.length
    : 0;
  const thirds = thirdsNeeded > 0 ? computeThirdPlaces(tables) : [];

  let total = 0;
  let played = 0;
  for (const m of Object.values(byId)) {
    total++;
    if (m.status === 'finished') played++;
  }

  return (
    <div className="overview">
      <header className="tourney">
        <h1 className="tourney__name">{t('tournament.name')}</h1>
        <p className="tourney__meta">
          {t('tournament.location')} · {t('tournament.window')}
        </p>
        <p className="tourney__progress">{t('overview.played', { played, total })}</p>
      </header>

      <section>
        <h2 className="section-title">{t('overview.groups')}</h2>
        <div className="standings-grid">
          {tables.map((tb) => (
            <StandingsTable key={tb.group.id} table={tb} />
          ))}
        </div>
      </section>

      {thirds.length > 0 && (
        <section className="thirds-section">
          <ThirdPlacesTable thirds={thirds} qualifyCount={thirdsNeeded} />
        </section>
      )}
    </div>
  );
}

import { useMatchStore } from '../stores/matchStore';
import { useStandings } from '../hooks/useStandings';
import { useQualificationTiers } from '../hooks/useQualificationTiers';
import { StandingsTable } from '../components/StandingsTable';
import { ThirdPlacesTable } from '../components/ThirdPlacesTable';
import { ExportReportButton } from '../components/ExportReportButton';
import { useI18n } from '../i18n';

/** Front page: live group tables (green = qualifies wholesale, blue = the
 * contested place) and the contested-tier qualification table. */
export function Overview() {
  const { t } = useI18n();
  const tables = useStandings();
  // Primitive selectors: the header counts re-render only when a count actually
  // changes, not on every goal that leaves the finished-count the same.
  const total = useMatchStore((s) => s.order.length);
  const played = useMatchStore((s) => {
    let n = 0;
    for (const id of s.order) if (s.byId[id]?.status === 'finished') n++;
    return n;
  });

  // Rows up to autoRank are green; the contestedRank place is blue (see
  // StandingsTable) — an exact bracket fit has no contest and shows nothing.
  const { autoRank, contested, contestedSpots, contestedRank } = useQualificationTiers(tables);

  return (
    <div className="overview">
      <header className="tourney">
        <h1 className="tourney__name">{t('tournament.name')}</h1>
        <p className="tourney__meta">{t('tournament.location')}</p>
        <p className="tourney__progress">{t('overview.played', { played, total })}</p>
        <ExportReportButton tables={tables} tiers={{ autoRank, contested, contestedSpots, contestedRank }} />
      </header>

      <section>
        <h2 className="section-title">{t('overview.groups')}</h2>
        <div className="standings-grid">
          {tables.map((tb) => (
            <StandingsTable key={tb.group.id} table={tb} autoRank={autoRank} contestedRank={contestedRank} />
          ))}
        </div>
      </section>

      {contested.length > 0 && (
        <section className="thirds-section">
          <ThirdPlacesTable fillers={contested} qualifyCount={contestedSpots} />
        </section>
      )}
    </div>
  );
}

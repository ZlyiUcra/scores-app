import { computeSize, computeQualificationOrder, TOURNAMENT_FORMAT } from '../../../shared/tournament';
import { useMatchStore } from '../stores/matchStore';
import { useRosterStore } from '../stores/rosterStore';
import { useStandings } from '../hooks/useStandings';
import { StandingsTable } from '../components/StandingsTable';
import { ThirdPlacesTable } from '../components/ThirdPlacesTable';
import { useI18n } from '../i18n';

/** Front page: live group tables (green = qualifies wholesale, blue = the
 * contested place) and the contested-tier qualification table. */
export function Overview() {
  const { t } = useI18n();
  const tables = useStandings();
  const byId = useMatchStore((s) => s.byId);
  const groups = useRosterStore((s) => s.groups);
  const teams = useRosterStore((s) => s.teams);

  // The bracket holds the largest power of two the team count can fill, and
  // place tiers qualify wholesale (all 1sts, all 2nds, ...) until the one
  // CONTESTED tier whose teams still fight for the leftover spots — the only
  // tier worth a table. An exact fit has no contest and shows nothing.
  const sizeInfo = computeSize(groups, teams);
  let contested: ReturnType<typeof computeQualificationOrder> = [];
  let contestedSpots = 0;
  // Highest place that qualifies WHOLESALE — group rows up to it are green;
  // the contested place is blue (see StandingsTable).
  let autoRank = 0;
  if (sizeInfo.formable) {
    const order = computeQualificationOrder(tables);
    let remaining = sizeInfo.size;
    for (let rank = 1; rank <= TOURNAMENT_FORMAT.maxPerGroup && remaining > 0; rank++) {
      const tier = order.filter((f) => f.row.rank === rank);
      if (tier.length <= remaining) {
        remaining -= tier.length; // the whole tier is in unconditionally
        autoRank = rank;
        continue;
      }
      contested = tier;
      contestedSpots = remaining;
      break;
    }
  }
  const contestedRank = contested.length > 0 ? contested[0].row.rank : null;

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
        <p className="tourney__meta">{t('tournament.location')}</p>
        <p className="tourney__progress">{t('overview.played', { played, total })}</p>
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

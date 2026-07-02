import { useMatchStore } from '../store';
import { useStandings } from '../standings';
import { StandingsTable } from '../components/StandingsTable';
import { useI18n } from '../i18n';

export function Overview() {
  const { t } = useI18n();
  const tables = useStandings();
  const byId = useMatchStore((s) => s.byId);

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
    </div>
  );
}

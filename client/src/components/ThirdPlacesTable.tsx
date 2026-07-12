import type { Group, StandingRow } from '../../../shared/types';
import { useI18n } from '../i18n';

/**
 * The CONTESTED filler tier: teams of one group place (3rd, 4th or 5th)
 * fighting cross-group for the leftover bracket spots - tiers that qualify
 * wholesale are not shown at all. Rows arrive pre-sorted in qualification
 * order (same comparator the bracket seeding uses); the first `qualifyCount`
 * advance. All rows share one place, so the title names it (`row.rank`).
 */
export function ThirdPlacesTable({ fillers, qualifyCount }: {
  fillers: Array<{ group: Group; row: StandingRow }>;
  qualifyCount: number;
}) {
  const { t } = useI18n();
  return (
    <div className="standings">
      <div className="section-head">
        <h3 className="standings__title">{t(`thirds.title${fillers[0].row.rank}`)}</h3>
        <span className="muted">{t('thirds.note', { n: qualifyCount })}</span>
      </div>
      <div className="table-wrap">
        <table className="table standings__table">
          <thead>
            <tr>
              <th className="standings__pos">#</th>
              <th className="standings__team">{t('standings.team')}</th>
              <th>{t('thirds.colGroup')}</th>
              <th title={t('standings.playedFull')}>{t('standings.played')}</th>
              <th title={t('standings.gfFull')}>{t('standings.gf')}</th>
              <th title={t('standings.gaFull')}>{t('standings.ga')}</th>
              <th title={t('standings.gdFull')}>{t('standings.gd')}</th>
              <th title={t('standings.ptsFull')}>{t('standings.pts')}</th>
            </tr>
          </thead>
          <tbody>
            {fillers.map(({ group, row }, i) => (
              <tr key={row.team.id} className={i < qualifyCount ? 'standings__row--q1' : ''}>
                <td className="standings__pos">{i + 1}</td>
                <td className="standings__team">
                  <span className="standings__short">{row.team.shortName}</span> {row.team.name}
                </td>
                <td>{group.name}</td>
                <td>{row.played}</td>
                <td>{row.goalsFor}</td>
                <td>{row.goalsAgainst}</td>
                <td>{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</td>
                <td className="standings__ptsval">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

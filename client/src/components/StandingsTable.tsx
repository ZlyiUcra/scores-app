import type { GroupTable } from '../../../shared/types';
import { useI18n } from '../i18n';

/** One group's standings table. Rows up to `autoRank` (places that qualify
 * wholesale) are green; the `contestedRank` place - where the leftover bracket
 * spots are fought over cross-group - is blue. */
export function StandingsTable({ table, autoRank, contestedRank }: {
  table: GroupTable;
  autoRank: number;
  contestedRank: number | null;
}) {
  const { t } = useI18n();
  return (
    <div className="standings">
      <h3 className="standings__title">{table.group.name}</h3>
      <div className="table-wrap">
        <table className="table standings__table">
          <thead>
            <tr>
              <th className="standings__pos">#</th>
              <th className="standings__team">{t('standings.team')}</th>
              <th title={t('standings.playedFull')}>{t('standings.played')}</th>
              <th title={t('standings.wonFull')}>{t('standings.won')}</th>
              <th title={t('standings.drawnFull')}>{t('standings.drawn')}</th>
              <th title={t('standings.lostFull')}>{t('standings.lost')}</th>
              <th title={t('standings.gfFull')}>{t('standings.gf')}</th>
              <th title={t('standings.gaFull')}>{t('standings.ga')}</th>
              <th title={t('standings.gdFull')}>{t('standings.gd')}</th>
              <th title={t('standings.ptsFull')}>{t('standings.pts')}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => {
              const cls = r.rank <= autoRank ? 'standings__row--q1' : r.rank === contestedRank ? 'standings__row--q3' : '';
              return (
                <tr key={r.team.id} className={cls}>
                  <td className="standings__pos">{r.rank}</td>
                  <td className="standings__team">
                    <span className="standings__short">{r.team.shortName}</span> {r.team.name}
                  </td>
                  <td>{r.played}</td>
                  <td>{r.won}</td>
                  <td>{r.drawn}</td>
                  <td>{r.lost}</td>
                  <td>{r.goalsFor}</td>
                  <td>{r.goalsAgainst}</td>
                  <td>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                  <td className="standings__ptsval">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useMatchStore, selectOrder, selectConnected, selectMatch } from '../stores/matchStore';
import { useRosterStore, selectGroups } from '../stores/rosterStore';
import { useI18n } from '../i18n';
import { useTournament } from '../tournament/TournamentScope';
import { formatTime } from '../lib/format';

/** Compact result row: time · field · status, then teams with score. Selects
 * its own match by id (memoized) so one update re-renders only this row. */
const ResultRow = memo(function ResultRow({ id }: { id: string }) {
  const m = useMatchStore(selectMatch(id));
  const { t } = useI18n();
  const { basePath } = useTournament();
  if (!m) return null;
  const played = m.status !== 'scheduled';
  return (
    <Link to={`${basePath}/match/${m.id}`} className={`rrow rrow--${m.status}`}>
      <div className="rrow__meta">
        <span>{formatTime(m.startsAt)}</span>
        {m.field && <span>· {m.field}</span>}
        {/* Same colored status pill as the admin games table. */}
        <span className={`rrow__status chip chip--${m.status}`}>{t(`status.${m.status}`)}</span>
      </div>
      <div className="rrow__teams">
        <span className="rrow__team">{m.home.name}</span>
        <span className="rrow__score">{played ? `${m.homeScore} : ${m.awayScore}` : '— : —'}</span>
        <span className="rrow__team rrow__team--away">{m.away.name}</span>
      </div>
    </Link>
  );
});

/** Results page: every group game clustered by group, each row linking to the
 * game's own page. The header shows the live-connection state. */
export function MatchList() {
  const order = useMatchStore(selectOrder);
  const byId = useMatchStore((s) => s.byId);
  const connected = useMatchStore(selectConnected);
  const groups = useRosterStore(selectGroups);
  const { t } = useI18n();

  const idsByGroup = (groupId: string) => order.filter((id) => byId[id]?.group === groupId);

  return (
    <div className="list">
      <div className="list__head">
        <h2>{t('matchList.title')}</h2>
        <span className={`live-dot ${connected ? 'live-dot--on' : 'live-dot--off'}`}>
          {connected ? t('matchList.live') : t('matchList.offline')}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="muted">{t('matchList.loading')}</p>
      ) : (
        <div className="groups-grid">
          {groups.map((g) => {
            const ids = idsByGroup(g.id);
            return (
              <section className="group-card" key={g.id}>
                <h3 className="group-card__title">{g.name}</h3>
                <div className="group-card__matches">
                  {ids.length === 0 ? (
                    <p className="muted group-card__empty">{t('matchList.noGames')}</p>
                  ) : (
                    ids.map((id) => <ResultRow key={id} id={id} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

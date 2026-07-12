import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { BracketMatch } from '../../../shared/types';
import { useMatchStore, selectByGroup, selectConnected, selectMatch } from '../stores/matchStore';
import { useRosterStore, selectGroups } from '../stores/rosterStore';
import { useBracketStore, selectBracket } from '../stores/bracketStore';
import { useI18n } from '../i18n';
import { useTournament } from '../tournament/TournamentScope';
import { useKickoffFormat } from '../lib/useKickoffFormat';
import { participantName, ROUND_ORDER } from '../lib/bracketLabels';
import { isMatchPlayed, isBracketMatchPlayed, isBracketMatchDecided } from '../lib/matchStatus';

/** Compact result row: time - field - status, then teams with score. Selects
 * its own match by id (memoized) so one update re-renders only this row. */
const ResultRow = memo(function ResultRow({ id }: { id: string }) {
  const m = useMatchStore(selectMatch(id));
  const { t } = useI18n();
  const { basePath } = useTournament();
  const { formatKickoff } = useKickoffFormat();
  if (!m) return null;
  const played = isMatchPlayed(m);
  return (
    <Link to={`${basePath}/match/${m.id}`} className={`rrow rrow--${m.status}`}>
      <div className="rrow__meta">
        <span>{formatKickoff(m.startsAt)}</span>
        {m.field && <span>{'\u00B7'} {m.field}</span>}
        {/* Same colored status pill as the admin games table. */}
        <span className={`rrow__status chip chip--${m.status}`}>{t(`status.${m.status}`)}</span>
      </div>
      <div className="rrow__teams">
        <span className="rrow__team">{m.home.name}</span>
        <span className="rrow__score">{played ? `${m.homeScore} : ${m.awayScore}` : '- : -'}</span>
        <span className="rrow__team rrow__team--away">{m.away.name}</span>
      </div>
    </Link>
  );
});

/** Knockout counterpart of ResultRow: same row shape, sourced from the
 * bracket view instead of matchStore (a knockout side may still be a
 * symbolic seed). Links to the slot's own page, tagged so KnockoutDetail's
 * back link returns here instead of the bracket tree. */
function BracketResultRow({ m }: { m: BracketMatch }) {
  const { t } = useI18n();
  const { basePath } = useTournament();
  const { formatKickoff } = useKickoffFormat();
  const played = isBracketMatchPlayed(m);
  const decided = isBracketMatchDecided(m);
  return (
    <Link to={`${basePath}/ko/${m.slot}`} state={{ from: 'results' }} className={`rrow rrow--${m.status}`}>
      <div className="rrow__meta">
        {m.startsAt && <span>{formatKickoff(m.startsAt)}</span>}
        {m.field && <span>{'\u00B7'} {m.field}</span>}
        <span className={`rrow__status chip chip--${m.status}`}>{t(`status.${m.status}`)}</span>
      </div>
      <div className="rrow__teams">
        <span className="rrow__team">{participantName(m.home, t)}</span>
        <span className="rrow__score">
          {played ? `${m.homeScore} : ${m.awayScore}` : '- : -'}
          {decided && ` (${m.homePens} : ${m.awayPens})`}
        </span>
        <span className="rrow__team rrow__team--away">{participantName(m.away, t)}</span>
      </div>
    </Link>
  );
}

/** Results page: every group game clustered by group, each row linking to the
 * game's own page, plus a knockout-results section in the same row/card
 * format once the bracket is formed. The header shows the live-connection
 * state. */
export function MatchList() {
  const byGroup = useMatchStore(selectByGroup);
  const connected = useMatchStore(selectConnected);
  const groups = useRosterStore(selectGroups);
  const bracket = useBracketStore(selectBracket);
  const { t } = useI18n();
  const preview = bracket.matches.some(
    (m) => ('seed' in m.home && m.home.projected) || ('seed' in m.away && m.away.projected),
  );

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
            const ids = byGroup[g.id] ?? [];
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

      {bracket.matches.length > 0 && (
        <>
          <h2 className="list__subtitle">{t('matchList.knockoutTitle')}</h2>
          {preview && <p className="ko-preview-note">{t('bracket.previewNote')}</p>}
          <div className="groups-grid">
            {ROUND_ORDER.map((round) => {
              const matches = bracket.matches.filter((m) => m.round === round);
              if (matches.length === 0) return null;
              return (
                <section className="group-card" key={round}>
                  <h3 className="group-card__title">{t(`bracket.${round}`)}</h3>
                  <div className="group-card__matches">
                    {matches.map((m) => <BracketResultRow key={m.slot} m={m} />)}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

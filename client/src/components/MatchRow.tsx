import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useMatchStore, selectMatch } from '../store';
import { useI18n } from '../i18n';
import { StatusBadge } from './StatusBadge';

/**
 * A single row. It selects ITS OWN match by id and is wrapped in React.memo,
 * so an update to one match re-renders only that row, not the whole list.
 */
function MatchRowInner({ id }: { id: string }) {
  const match = useMatchStore(selectMatch(id));
  const { t } = useI18n();
  if (!match) return null;

  return (
    <Link
      to={`/match/${match.id}`}
      className="row"
      aria-label={t('match.vs', { home: match.home.name, away: match.away.name })}
    >
      <div className="row__group">{t('match.group', { group: match.group })}</div>
      <div className="row__teams">
        <span className="row__team">{match.home.name}</span>
        <span className="row__score">
          {match.homeScore} : {match.awayScore}
        </span>
        <span className="row__team row__team--away">{match.away.name}</span>
      </div>
      <StatusBadge status={match.status} minute={match.minute} />
    </Link>
  );
}

export const MatchRow = memo(MatchRowInner);

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useMatchStore, selectMatch } from '../stores/matchStore';
import { useRosterStore } from '../stores/rosterStore';
import { useI18n } from '../i18n';
import { StatusBadge } from './StatusBadge';

/**
 * A single row. It selects ITS OWN match by id and is wrapped in React.memo,
 * so an update to one match re-renders only that row, not the whole list.
 */
function MatchRowInner({ id }: { id: string }) {
  const match = useMatchStore(selectMatch(id));
  const groups = useRosterStore((s) => s.groups);
  const { t } = useI18n();
  if (!match) return null;

  const groupName = groups.find((g) => g.id === match.group)?.name ?? match.group;

  return (
    <Link
      to={`/match/${match.id}`}
      className="row"
      aria-label={t('match.vs', { home: match.home.name, away: match.away.name })}
    >
      <div className="row__group">{groupName}</div>
      <div className="row__teams">
        <span className="row__team">{match.home.name}</span>
        <span className="row__score">
          {match.homeScore} : {match.awayScore}
        </span>
        <span className="row__team row__team--away">{match.away.name}</span>
      </div>
      <StatusBadge status={match.status} />
    </Link>
  );
}

export const MatchRow = memo(MatchRowInner);

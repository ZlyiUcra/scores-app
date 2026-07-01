import { Link, useParams } from 'react-router-dom';
import { useMatchStore, selectMatch } from '../store';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { StatusBadge } from '../components/StatusBadge';
import { AdminControls } from '../components/AdminControls';

export function MatchDetail() {
  const { id = '' } = useParams();
  const match = useMatchStore(selectMatch(id));
  const { isAdmin } = useAuth();
  const { t } = useI18n();

  if (!match) {
    return (
      <div className="detail">
        <Link to="/" className="back">{t('matchDetail.back')}</Link>
        <p className="muted">{t('matchDetail.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="detail">
      <Link to="/" className="back">{t('matchDetail.back')}</Link>

      <div className="scoreboard">
        <div className="scoreboard__team">
          <div className="scoreboard__name">{match.home.name}</div>
          <div className="scoreboard__short">{match.home.shortName}</div>
        </div>
        <div className="scoreboard__center">
          <div className="scoreboard__score">
            {match.homeScore} : {match.awayScore}
          </div>
          <StatusBadge status={match.status} minute={match.minute} />
        </div>
        <div className="scoreboard__team">
          <div className="scoreboard__name">{match.away.name}</div>
          <div className="scoreboard__short">{match.away.shortName}</div>
        </div>
      </div>

      <div className="detail__meta">{t('match.group', { group: match.group })}</div>

      {isAdmin && <AdminControls match={match} />}
    </div>
  );
}

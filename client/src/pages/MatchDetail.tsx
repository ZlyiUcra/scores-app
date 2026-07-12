import { Link, useParams } from 'react-router-dom';
import { useMatchStore, selectMatch } from '../stores/matchStore';
import { useRosterStore } from '../stores/rosterStore';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { useTournament } from '../tournament/TournamentScope';
import { StatusBadge } from '../components/StatusBadge';
import { AdminControls } from '../components/AdminControls';

/** One group game, live: scoreboard for everyone, the click-driven scoring
 * controls for admins (hidden in a finished tournament - it is an archive).
 * Lives at /t/:tid/match/:id (mirrored by /t/:tid/ko/:slot for knockouts). */
export function MatchDetail() {
  const { id = '' } = useParams();
  const match = useMatchStore(selectMatch(id));
  const groups = useRosterStore((s) => s.groups);
  const { isAdmin } = useAuth();
  const { t } = useI18n();
  const { basePath, readOnly } = useTournament();

  if (!match) {
    return (
      <div className="detail">
        <Link to={`${basePath}/results`} className="back">{t('matchDetail.back')}</Link>
        <p className="muted">{t('matchDetail.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="detail">
      <Link to={`${basePath}/results`} className="back">{t('matchDetail.back')}</Link>

      <div className="scoreboard">
        <div className="scoreboard__team">
          <div className="scoreboard__name">{match.home.name}</div>
          <div className="scoreboard__short">{match.home.shortName}</div>
        </div>
        <div className="scoreboard__center">
          <div className="scoreboard__score">
            {match.homeScore} : {match.awayScore}
          </div>
          <StatusBadge status={match.status} />
        </div>
        <div className="scoreboard__team">
          <div className="scoreboard__name">{match.away.name}</div>
          <div className="scoreboard__short">{match.away.shortName}</div>
        </div>
      </div>

      <div className="detail__meta">{groups.find((g) => g.id === match.group)?.name ?? match.group}</div>

      {isAdmin && !readOnly && <AdminControls match={match} />}
    </div>
  );
}

import { Link, useLocation, useParams } from 'react-router-dom';
import { useBracketStore, selectBracket } from '../stores/bracketStore';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { useTournament } from '../tournament/TournamentScope';
import { StatusBadge } from '../components/StatusBadge';
import { BracketSlotControls } from '../components/BracketSlotControls';
import { formatKickoff } from '../lib/format';
import { participantName, slotShort } from '../lib/bracketLabels';

/** One knockout game, mirroring MatchDetail: scoreboard for everyone, the
 * click-driven slot controls for admins (hidden in a finished tournament).
 * Lives at /t/:tid/ko/:slot, reached either from the bracket tree or from a
 * knockout row on the results list — the back link follows wherever the
 * incoming Link tagged via `state.from` (falls back to the bracket tree for
 * a direct URL/refresh, matching the pre-existing behavior). */
export function KnockoutDetail() {
  const { slot = '' } = useParams();
  const location = useLocation();
  const view = useBracketStore(selectBracket);
  const { isAdmin } = useAuth();
  const { t } = useI18n();
  const { basePath, readOnly } = useTournament();

  const fromResults = (location.state as { from?: string } | null)?.from === 'results';
  const backTo = fromResults ? `${basePath}/results` : `${basePath}/ko`;
  const backLabel = fromResults ? t('matchDetail.back') : t('knockoutDetail.back');

  const m = view.matches.find((x) => x.slot === slot);

  if (!m) {
    return (
      <div className="detail">
        <Link to={backTo} className="back">{backLabel}</Link>
        <p className="muted">{t('knockoutDetail.notFound')}</p>
      </div>
    );
  }

  const homeShort = 'team' in m.home ? m.home.team.shortName : slotShort(m.slot, t);
  const awayShort = 'team' in m.away ? m.away.team.shortName : slotShort(m.slot, t);
  const preview =
    ('seed' in m.home && m.home.projected) || ('seed' in m.away && m.away.projected);

  return (
    <div className="detail">
      <Link to={backTo} className="back">{backLabel}</Link>

      {preview && <p className="ko-preview-note">{t('bracket.previewNote')}</p>}

      <div className="scoreboard">
        <div className="scoreboard__team">
          <div className="scoreboard__name">{participantName(m.home, t)}</div>
          <div className="scoreboard__short">{homeShort}</div>
        </div>
        <div className="scoreboard__center">
          {/* Always show the live counter — a frozen (scheduled) knockout game
              keeps its score, and the admin edits it right below. */}
          <div className="scoreboard__score">{`${m.homeScore} : ${m.awayScore}`}</div>
          {m.homePens != null && m.awayPens != null && (
            <div className="muted">{t('adminBracket.pens')} {m.homePens} : {m.awayPens}</div>
          )}
          <StatusBadge status={m.status} />
        </div>
        <div className="scoreboard__team">
          <div className="scoreboard__name">{participantName(m.away, t)}</div>
          <div className="scoreboard__short">{awayShort}</div>
        </div>
      </div>

      <div className="detail__meta">
        {t(`bracket.${m.round}`)} ({slotShort(m.slot, t)})
        {m.startsAt ? ` · ${formatKickoff(m.startsAt)}` : ''}
        {m.field ? ` · ${m.field}` : ''}
      </div>

      {isAdmin && !readOnly && <BracketSlotControls m={m} />}
    </div>
  );
}

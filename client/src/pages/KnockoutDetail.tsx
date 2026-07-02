import { Link, useParams } from 'react-router-dom';
import { useBracketStore, selectBracket } from '../bracketStore';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { StatusBadge } from '../components/StatusBadge';
import { BracketSlotControls } from '../components/BracketSlotControls';
import { formatTime } from '../components/Bracket';
import { participantName, slotShort } from '../bracketLabels';

/** One knockout game, mirroring MatchDetail: scoreboard for everyone, the
 * click-driven slot controls for admins. Lives at /ko/:slot. */
export function KnockoutDetail() {
  const { slot = '' } = useParams();
  const view = useBracketStore(selectBracket);
  const { isAdmin } = useAuth();
  const { t } = useI18n();

  const m = view.matches.find((x) => x.slot === slot);

  if (!m) {
    return (
      <div className="detail">
        <Link to="/ko" className="back">{t('knockoutDetail.back')}</Link>
        <p className="muted">{t('knockoutDetail.notFound')}</p>
      </div>
    );
  }

  const homeShort = 'team' in m.home ? m.home.team.shortName : slotShort(m.slot, t);
  const awayShort = 'team' in m.away ? m.away.team.shortName : slotShort(m.slot, t);
  const showScore = m.status !== 'scheduled';

  return (
    <div className="detail">
      <Link to="/ko" className="back">{t('knockoutDetail.back')}</Link>

      <div className="scoreboard">
        <div className="scoreboard__team">
          <div className="scoreboard__name">{participantName(m.home, t)}</div>
          <div className="scoreboard__short">{homeShort}</div>
        </div>
        <div className="scoreboard__center">
          <div className="scoreboard__score">
            {showScore ? `${m.homeScore} : ${m.awayScore}` : '- : -'}
          </div>
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
        {m.startsAt ? ` · ${formatTime(m.startsAt)}` : ''}
        {m.field ? ` · ${m.field}` : ''}
      </div>

      {isAdmin && <BracketSlotControls m={m} />}
    </div>
  );
}

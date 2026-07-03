import { Link } from 'react-router-dom';
import type { BracketMatch, BracketView, Round } from '../../../shared/types';
import { useI18n } from '../i18n';
import { useTournament } from '../tournament/TournamentScope';
import { participantName, slotShort } from '../lib/bracketLabels';
import { formatTime } from '../lib/format';

/** Which side won a finished knockout match ('home' | 'away' | null). */
function winnerSide(m: BracketMatch): 'home' | 'away' | null {
  if (m.status !== 'finished') return null;
  if (m.homeScore > m.awayScore) return 'home';
  if (m.homeScore < m.awayScore) return 'away';
  if (m.homePens != null && m.awayPens != null && m.homePens !== m.awayPens) {
    return m.homePens > m.awayPens ? 'home' : 'away';
  }
  return null;
}

function Side({ m, side }: { m: BracketMatch; side: 'home' | 'away' }) {
  const { t } = useI18n();
  const p = side === 'home' ? m.home : m.away;
  const score = side === 'home' ? m.homeScore : m.awayScore;
  const pens = side === 'home' ? m.homePens : m.awayPens;
  const isTeam = 'team' in p;
  const won = winnerSide(m) === side;
  // A frozen (reset) game keeps its score (and possibly pens) and viewers must
  // still see it, so only a pristine scheduled slot hides the counter.
  const showScore =
    m.status !== 'scheduled' ||
    m.homeScore !== 0 ||
    m.awayScore !== 0 ||
    m.homePens != null ||
    m.awayPens != null;
  return (
    <div className={`bcard__side ${won ? 'bcard__side--won' : ''} ${isTeam ? '' : 'bcard__side--seed'}`}>
      {/* Narrow columns ellipsize the label; the title keeps it readable. */}
      <span className="bcard__name" title={participantName(p, t)}>
        {participantName(p, t)}
        {'team' in p && p.manual && (
          <span className="bcard__manual" title={t('bracket.manual')}>*</span>
        )}
      </span>
      <span className="bcard__score">
        {showScore ? score : '—'}
        {pens != null && <sup className="bcard__pens">{pens}</sup>}
      </span>
    </div>
  );
}

function BracketCard({ m }: { m: BracketMatch }) {
  const { t } = useI18n();
  const { basePath } = useTournament();
  // The whole card links to the game page (admins get the edit controls
  // there), same as a row in the results list.
  return (
    <Link to={`${basePath}/ko/${m.slot}`} className={`bcard-link bcard bcard--${m.status}`}>
      <div className="bcard__head">
        <span className="bcard__slot">{slotShort(m.slot, t)}</span>
        {m.startsAt && <span className="bcard__field">{formatTime(m.startsAt)}</span>}
        {m.field && <span className="bcard__field">{m.field}</span>}
        <span className="bcard__status">{t(`status.${m.status}`)}</span>
      </div>
      <Side m={m} side="home" />
      <div className="bcard__vs">{t('bracket.vs')}</div>
      <Side m={m} side="away" />
    </Link>
  );
}

// Column order for the group-stage rounds (biggest first).
const COLUMN_ROUNDS: Round[] = ['r32', 'r16', 'qf', 'sf', 'final'];

/** The whole knockout tree: one column per round with elbow connectors, the
 * third-place game below. Shows the unformable reason instead when the group
 * setup cannot produce a bracket. */
export function Bracket({ view }: { view: BracketView }) {
  const { t } = useI18n();

  if (!view.formable) {
    const reason = view.reason ? t(`bracket.reason.${view.reason}`) : t('bracket.empty');
    return <p className="muted bracket__empty">{reason}</p>;
  }

  const of = (r: Round) => view.matches.filter((m) => m.round === r);
  const columns = COLUMN_ROUNDS.filter((r) => of(r).length > 0);
  const third = of('third');

  return (
    <div className="bracket-wrap">
      <div className="bracket">
        {columns.map((r) => (
          <div className="bracket-round" key={r}>
            <h4 className="bracket-round__title">{t(`bracket.${r}`)}</h4>
            <div className="bracket-round__matches">
              {of(r).map((m) => (
                <div className="bracket-match" key={m.slot}>
                  <BracketCard m={m} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {third.length > 0 && (
        <div className="bracket-third">
          <h4 className="bracket-round__title">{t('bracket.third')}</h4>
          {third.map((m) => (
            <BracketCard key={m.slot} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

import type { BracketMatch, BracketView, Round } from '../../../shared/types';
import { useI18n } from '../i18n';
import { participantName, slotShort } from '../bracketLabels';

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
  const showScore = m.status !== 'scheduled';
  return (
    <div className={`bcard__side ${won ? 'bcard__side--won' : ''} ${isTeam ? '' : 'bcard__side--seed'}`}>
      <span className="bcard__name">{participantName(p, t)}</span>
      <span className="bcard__score">
        {showScore ? score : '—'}
        {pens != null && <sup className="bcard__pens">{pens}</sup>}
      </span>
    </div>
  );
}

function BracketCard({ m }: { m: BracketMatch }) {
  const { t } = useI18n();
  return (
    <div className={`bcard bcard--${m.status}`}>
      <div className="bcard__head">
        <span className="bcard__slot">{slotShort(m.slot, t)}</span>
        {m.field && <span className="bcard__field">{m.field}</span>}
        <span className="bcard__status">{t(`status.${m.status}`)}</span>
      </div>
      <Side m={m} side="home" />
      <div className="bcard__vs">{t('bracket.vs')}</div>
      <Side m={m} side="away" />
    </div>
  );
}

// Column order for the group-stage rounds (biggest first).
const COLUMN_ROUNDS: Round[] = ['r16', 'qf', 'sf', 'final'];

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

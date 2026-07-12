import { Link } from 'react-router-dom';
import type { BracketMatch, BracketView, Round } from '../../../shared/types';
import { useI18n } from '../i18n';
import { useTournament } from '../tournament/TournamentScope';
import { participantName, slotShort } from '../lib/bracketLabels';
import { useKickoffFormat } from '../lib/useKickoffFormat';

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
  const { formatKickoff } = useKickoffFormat();
  // Final and third-place are the trophy games - a distinct card accent marks
  // them out from the rounds that feed them.
  const trophyClass = m.round === 'final' ? ' bcard--final' : m.round === 'third' ? ' bcard--third' : '';
  // The whole card links to the game page (admins get the edit controls
  // there), same as a row in the results list.
  return (
    <Link to={`${basePath}/ko/${m.slot}`} className={`bcard-link bcard bcard--${m.status}${trophyClass}`}>
      <div className="bcard__head">
        <span className="bcard__slot">{slotShort(m.slot, t)}</span>
        {m.startsAt && <span className="bcard__field">{formatKickoff(m.startsAt)}</span>}
        {m.field && <span className="bcard__field">{m.field}</span>}
        <span className="bcard__status">{t(`status.${m.status}`)}</span>
      </div>
      <Side m={m} side="home" />
      <div className="bcard__vs">{t('bracket.vs')}</div>
      <Side m={m} side="away" />
    </Link>
  );
}

/** One round rendered as a titled column of match cards. `extra` (the
 * third-place game) rides in the final column, stacked right under the final so
 * the linear layout stacks the two centre games the same way the mirror does. */
function RoundColumn({ round, matches, extra }: { round: Round; matches: BracketMatch[]; extra?: BracketMatch[] }) {
  const { t } = useI18n();
  const split = (extra?.length ?? 0) > 0;
  return (
    <div className="bracket-round">
      <h4 className="bracket-round__title">{t(`bracket.${round}`)}</h4>
      <div className={`bracket-round__matches${split ? ' bracket-round__matches--stack' : ''}`}>
        {matches.map((m) => (
          <div className="bracket-match" key={m.slot}>
            <BracketCard m={m} />
          </div>
        ))}
        {extra?.map((m) => (
          <div className="bracket-match bracket-match--extra" key={m.slot}>
            <BracketCard m={m} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Rounds biggest-first; the final is the centre of the mirrored layout.
const COLUMN_ROUNDS: Round[] = ['r32', 'r16', 'qf', 'sf', 'final'];
// Wing rounds, outer edge -> centre (the final sits between the two wings).
const WING_ROUNDS: Round[] = ['r32', 'r16', 'qf', 'sf'];

/** M-index inside a round slot id (e.g. "R8M2" -> 2); used to split a round's
 * matches into the left and right subtrees. */
function slotIndex(m: BracketMatch): number {
  const n = Number(m.slot.split('M')[1]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The whole knockout tree in two interchangeable layouts (only one is shown at
 * a time, chosen by screen width in CSS):
 *  - linear: one column per round, left to right, third-place block below;
 *  - mirror (wide screens): the final centred, rounds fanning out to both
 *    wings, third place centred under the final.
 * Each round's matches split in half by slot index — the first half feeds the
 * left semifinal, the second half the right one. Shows the unformable reason
 * instead when the group setup cannot produce a bracket.
 */
export function Bracket({ view }: { view: BracketView }) {
  const { t } = useI18n();

  if (!view.formable) {
    const reason = view.reason ? t(`bracket.reason.${view.reason}`) : t('bracket.empty');
    return <p className="muted bracket__empty">{reason}</p>;
  }

  const roundMatches = (r: Round) =>
    view.matches.filter((m) => m.round === r).sort((a, b) => slotIndex(a) - slotIndex(b));
  const third = view.matches.filter((m) => m.round === 'third');
  const finalMatches = roundMatches('final');
  const linearColumns = COLUMN_ROUNDS.filter((r) => roundMatches(r).length > 0);

  const thirdBlock = third.length > 0 && (
    <div className="bracket-third">
      <h4 className="bracket-round__title">{t('bracket.third')}</h4>
      {third.map((m) => (
        <BracketCard key={m.slot} m={m} />
      ))}
    </div>
  );

  // Mirror geometry. Columns are [outer..inner-left, centre, inner-right..outer];
  // each round's matches split in half by slot index (first half -> left
  // subtree, second -> right). A round `i` steps in from the outer edge, so its
  // cards span 2^i grid rows and centre between the two that feed them. A card
  // and its mirror across the centre land in the same grid row, so the row's
  // auto height matches that symmetric pair alone.
  const wings = WING_ROUNDS.filter((r) => roundMatches(r).length > 0);
  const totalCols = wings.length * 2 + 1;
  const centerCol = wings.length + 1;
  // When a third-place game exists it stacks under the final in the centre
  // column, and the semifinals FAN OUT to the pair (final up, third down) -
  // the mirror image of how two cards converge into one. That needs an even
  // row count so each of the pair takes an exact half; a 4-team bracket (base
  // rows = 1) is bumped to 2, and the wings' spans scale to match.
  const baseRows = wings.length > 0 ? roundMatches(wings[0]).length / 2 : 1;
  const stacked = third.length > 0 && finalMatches.length > 0;
  const rows = stacked ? Math.max(2, baseRows) : baseRows;
  const scale = baseRows > 0 ? rows / baseRows : 1;
  const innermost = wings.length - 1;

  type Placed = {
    m: BracketMatch;
    col: number;
    row: number;
    span: number;
    side: 'left' | 'right' | 'center';
    parent: boolean;
    /** A semifinal that fans out to the centre pair (final + third place). */
    diverge: boolean;
  };
  const placed: Placed[] = [];
  wings.forEach((r, i) => {
    const ms = roundMatches(r);
    const half = ms.length / 2;
    const span = (1 << i) * scale;
    const diverge = stacked && i === innermost;
    ms.slice(0, half).forEach((m, j) =>
      placed.push({ m, col: i + 1, row: j * span + 1, span, side: 'left', parent: i > 0, diverge }),
    );
    ms.slice(half).forEach((m, j) =>
      placed.push({ m, col: totalCols - i, row: j * span + 1, span, side: 'right', parent: i > 0, diverge }),
    );
  });
  if (stacked) {
    const half = rows / 2;
    finalMatches.forEach((m) =>
      placed.push({ m, col: centerCol, row: 1, span: half, side: 'center', parent: false, diverge: false }),
    );
    third.forEach((m) =>
      placed.push({ m, col: centerCol, row: half + 1, span: half, side: 'center', parent: false, diverge: false }),
    );
  } else {
    finalMatches.forEach((m) =>
      placed.push({ m, col: centerCol, row: 1, span: rows, side: 'center', parent: false, diverge: false }),
    );
  }

  // One round title per column (both wings show the round name, final centred).
  const titles: { round: Round; col: number }[] = [];
  wings.forEach((r, i) => {
    titles.push({ round: r, col: i + 1 });
    titles.push({ round: r, col: totalCols - i });
  });
  if (finalMatches.length > 0) titles.push({ round: 'final', col: centerCol });

  return (
    <div className="bracket-wrap">
      {/* Narrow screens: linear left-to-right bracket. The third-place game
          stacks under the final in the final column (like the mirror); it only
          falls back to the separate block below when there is no final. */}
      <div className="bracket-linear">
        <div className="bracket">
          {linearColumns.map((r) => (
            <RoundColumn
              key={r}
              round={r}
              matches={roundMatches(r)}
              extra={r === 'final' ? third : undefined}
            />
          ))}
        </div>
        {finalMatches.length === 0 && thirdBlock}
      </div>

      {/* Wide screens: mirrored grid converging on the centred final, with the
          third-place game centred below (under the final). */}
      <div className="bracket-mirror">
        <div
          className="bracket-grid"
          style={{
            gridTemplateColumns: `repeat(${totalCols}, minmax(130px, 1fr))`,
            gridTemplateRows: `auto repeat(${rows}, auto)`,
          }}
        >
          {titles.map((tc) => (
            <div
              key={`title-${tc.col}`}
              className="bracket-round__title bracket-grid__title"
              style={{ gridColumn: tc.col, gridRow: 1 }}
            >
              {t(`bracket.${tc.round}`)}
            </div>
          ))}
          {placed.map((p) => (
            <div
              key={p.m.slot}
              className={`bcell bcell--${p.side}${p.parent ? ' bcell--parent' : ''}${p.diverge ? ' bcell--diverge' : ''}`}
              style={{ gridColumn: p.col, gridRow: `${p.row + 1} / span ${p.span}` }}
            >
              <BracketCard m={p.m} />
            </div>
          ))}
        </div>
        {/* The third-place game rides in the grid when stacked under the final;
            only fall back to the separate block when it is not. */}
        {!stacked && thirdBlock}
      </div>
    </div>
  );
}

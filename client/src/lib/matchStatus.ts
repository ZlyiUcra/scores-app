import type { BracketMatch, Match } from '../../../shared/types';

/** A group match counts as "played" once it has left the scheduled state -
 * group matches never freeze back with a kept score, so status alone is
 * enough. Shared by the live results row and the PDF report row. */
export function isMatchPlayed(m: Pick<Match, 'status'>): boolean {
  return m.status !== 'scheduled';
}

/** A bracket slot counts as "played" once it has a scoreline worth showing -
 * a frozen (reset-then-untouched) slot keeps its score/pens even while
 * status reads 'scheduled' again, so status alone is not enough here. */
export function isBracketMatchPlayed(
  m: Pick<BracketMatch, 'status' | 'homeScore' | 'awayScore' | 'homePens' | 'awayPens'>,
): boolean {
  return m.status !== 'scheduled' || m.homeScore !== 0 || m.awayScore !== 0 || m.homePens != null || m.awayPens != null;
}

/** A level knockout match is only decided once both penalty tallies are set. */
export function isBracketMatchDecided(m: Pick<BracketMatch, 'homePens' | 'awayPens'>): boolean {
  return m.homePens != null && m.awayPens != null;
}

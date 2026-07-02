import type { BracketParticipant, SeedRef } from '../../../shared/types';
import { roundName } from '../../../shared/tournament';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Friendly short name for a slot id: `R8M0` -> "QF1", `R2M0` -> "Final",
 * `THIRD` -> localized 3rd/4th. Used in card headers and winner/loser labels so
 * we never surface a raw `R8M0`. */
export function slotShort(slot: string, t: Translate): string {
  if (slot === 'THIRD') return t('bracket.thirdShort');
  const m = /^R(\d+)M(\d+)$/.exec(slot);
  if (!m) return slot;
  const size = Number(m[1]);
  const index = Number(m[2]);
  const r = roundName(size);
  if (r === 'final') return t('bracket.finalShort');
  const prefix = r === 'sf' ? 'SF' : r === 'qf' ? 'QF' : 'R16-';
  return `${prefix}${index + 1}`;
}

/** Turn a structured seed reference into a localized label (never parse a
 * display string — the ref is the machine key, this is the human text). */
function seedLabel(seed: SeedRef, t: Translate): string {
  switch (seed.kind) {
    case 'qualifier':
      return t('seed.qualifier', { n: seed.index + 1 });
    case 'winner':
      return t('seed.winner', { slot: slotShort(seed.slot, t) });
    case 'loser':
      return t('seed.loser', { slot: slotShort(seed.slot, t) });
  }
}

export function participantName(p: BracketParticipant, t: Translate): string {
  return 'team' in p ? p.team.name : seedLabel(p.seed, t);
}

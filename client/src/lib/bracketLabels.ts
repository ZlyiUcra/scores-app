import type { BracketParticipant, Round, SeedRef } from '../../../shared/types';
import { roundName } from '../../../shared/tournament';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Rounds in bracket-tree order, third place slotted right before the final
 * (they are typically played back to back on the day). Shared by every
 * per-round listing (public Results knockout section, admin playoff table). */
export const ROUND_ORDER: Round[] = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];

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
  const prefix = r === 'sf' ? 'SF' : r === 'qf' ? 'QF' : r === 'r16' ? 'R16-' : 'R32-';
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

/** Resolved team name; a symbolic seed renders its position label, with the
 * currently-projected team in parentheses while the groups are unfinished:
 * "Seed 1 (FC Lions)". The parentheses disappearing IS the "now it's final"
 * signal. */
export function participantName(p: BracketParticipant, t: Translate): string {
  if ('team' in p) return p.team.name;
  const label = seedLabel(p.seed, t);
  return p.projected ? `${label} (${p.projected.name})` : label;
}

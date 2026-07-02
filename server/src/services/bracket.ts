import type { BracketSlotId, BracketView } from '../../../shared/types.js';
import {
  computeSize,
  generateBracket,
  resolveBracket,
  type BracketResult,
} from '../../../shared/tournament.js';
import { matchRepository } from '../repos/matches.js';
import { teamRepository } from '../repos/teams.js';
import { groupRepository } from '../repos/groups.js';
import { bracketRepository } from '../repos/bracket.js';
import type { UpdateBracketInput } from '../validation.js';
import { AppError } from '../errors.js';

// Deliberately NOT guarded by assertBracketNotStarted: these writes are what
// that lock protects everything else from, plus its escape hatch (reset).

function resolvedBracket(): BracketView {
  return resolveBracket(
    groupRepository.list(),
    teamRepository.listSeed(),
    matchRepository.list(),
    bracketRepository.results(),
  );
}

/** Full knockout view (formability + resolved matches). */
export function listBracket(): BracketView {
  return resolvedBracket();
}

/** The slot ids that exist for the current group setup (empty if not formable). */
function currentSlotIds(): Set<BracketSlotId> {
  const { formable, size } = computeSize(groupRepository.list(), teamRepository.listSeed());
  if (!formable) return new Set();
  return new Set(generateBracket(size).map((s) => s.slot));
}

function assertSlot(slotRaw: string): BracketSlotId {
  if (!currentSlotIds().has(slotRaw)) {
    throw new AppError('NOT_FOUND', `Unknown knockout slot ${slotRaw}.`, 404);
  }
  return slotRaw;
}

/**
 * Admin: set one knockout slot's result and/or pin its participants. Enforces:
 * the slot exists for the current bracket size; an override references an
 * existing team and the two pins differ; participants are known (derived or
 * pinned) and resolve to two DIFFERENT teams before going live/finished — the
 * same team may sit in two slots' pins transiently during a correction, but a
 * match can never start against itself; a finished match cannot end level
 * without a decisive penalty result. Returns the full knockout view.
 *
 * The three override checks below (existence, self-play, hypothetical
 * resolution) are only correct TOGETHER — do not split or share them.
 */
export function updateBracketSlot(slotRaw: string, input: UpdateBracketInput): BracketView {
  const slot = assertSlot(slotRaw);
  const current = bracketRepository.get(slot);
  if (input.expectedRev !== undefined && input.expectedRev !== current.rev) {
    throw new AppError(
      'REV_CONFLICT',
      `Stale update: expected rev ${input.expectedRev} but current is ${current.rev}.`,
      409,
    );
  }

  const next: BracketResult = {
    homeScore: input.homeScore ?? current.homeScore,
    awayScore: input.awayScore ?? current.awayScore,
    homePens: input.homePens !== undefined ? input.homePens : current.homePens,
    awayPens: input.awayPens !== undefined ? input.awayPens : current.awayPens,
    status: input.status ?? current.status,
    field: input.field ?? current.field,
    startsAt: input.startsAt !== undefined ? input.startsAt : current.startsAt,
    homeOverrideId: input.homeOverrideId !== undefined ? input.homeOverrideId : current.homeOverrideId,
    awayOverrideId: input.awayOverrideId !== undefined ? input.awayOverrideId : current.awayOverrideId,
    rev: current.rev + 1,
  };

  // A pin must reference an existing team (team deletion is locked while any
  // override exists — see hasStarted — so a stored pin can never dangle).
  if (next.homeOverrideId != null && !teamRepository.get(next.homeOverrideId)) {
    throw new AppError('NOT_FOUND', `Override team ${next.homeOverrideId} not found.`, 404);
  }
  if (next.awayOverrideId != null && !teamRepository.get(next.awayOverrideId)) {
    throw new AppError('NOT_FOUND', `Override team ${next.awayOverrideId} not found.`, 404);
  }
  if (next.homeOverrideId != null && next.homeOverrideId === next.awayOverrideId) {
    throw new AppError('INVALID', 'A team cannot play itself.', 400);
  }

  // A slot can only be played once its two sides resolve to two DIFFERENT
  // teams. Resolve against the HYPOTHETICAL store including this write, so a
  // patch that both pins a side and starts the match is judged on its outcome
  // (this also catches the propagated duplicate: a pinned team meeting itself
  // arriving as a derived winner of another slot).
  if (next.status !== 'scheduled') {
    const hypothetical = bracketRepository.results();
    hypothetical[slot] = next;
    const view = resolveBracket(
      groupRepository.list(),
      teamRepository.listSeed(),
      matchRepository.list(),
      hypothetical,
    );
    const bm = view.matches.find((b) => b.slot === slot);
    if (!bm || !('team' in bm.home) || !('team' in bm.away)) {
      throw new AppError('SLOT_NOT_READY', 'This knockout match has no teams yet.', 409);
    }
    if (bm.home.team.id === bm.away.team.id) {
      throw new AppError('INVALID', 'Both sides of this match resolve to the same team.', 400);
    }
  }

  // Knockouts cannot end level: a finished draw needs a decisive shootout.
  if (next.status === 'finished' && next.homeScore === next.awayScore) {
    if (next.homePens == null || next.awayPens == null || next.homePens === next.awayPens) {
      throw new AppError(
        'DRAW_UNRESOLVED',
        'A level knockout match needs a penalty result to decide a winner.',
        400,
      );
    }
  }

  bracketRepository.save(slot, next);
  return resolvedBracket();
}

/** Admin: clear every knockout result (needed before changing groups/matches). */
export function resetBracket(): BracketView {
  bracketRepository.reset();
  return resolvedBracket();
}

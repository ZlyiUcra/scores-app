import type { BracketSlotId, BracketView } from '../../../shared/types.js';
import {
  computeSize,
  generateBracket,
  resolveBracket,
  type BracketResult,
} from '../../../shared/tournament.js';
import { bracketRepository, groupRepository, matchRepository, teamRepository } from '../storage/index.js';
import type { UpdateBracketInput } from '../validation.js';
import { AppError, AppErrorCode } from '../errors.js';
import { assertTournamentEditable } from './tournamentLock.js';
import { withMutationLock } from './mutationLock.js';

// Deliberately NOT guarded by assertBracketNotStarted: these writes are what
// that lock protects everything else from, plus its escape hatch (reset).
// The finished-tournament lock DOES apply — an archive rejects all writes.

// includePreview here is DISPLAY-ONLY: while the groups are unfinished the
// view annotates symbolic seeds with `projected` teams from the current
// (live) standings. Write validation below resolves STRICTLY — never copy
// this option into the hypothetical check in updateBracketSlot.
async function resolvedBracket(tournamentId: string): Promise<BracketView> {
  return resolveBracket(
    await groupRepository.list(tournamentId),
    await teamRepository.listSeed(tournamentId),
    await matchRepository.list(tournamentId),
    await bracketRepository.results(tournamentId),
    { includePreview: true },
  );
}

/** Full knockout view (formability + resolved matches) of one tournament. */
export function listBracket(tournamentId: string): Promise<BracketView> {
  return resolvedBracket(tournamentId);
}

/** The slot ids that exist for the tournament's group setup (empty if not formable). */
async function currentSlotIds(tournamentId: string): Promise<Set<BracketSlotId>> {
  const { formable, size } = computeSize(
    await groupRepository.list(tournamentId),
    await teamRepository.listSeed(tournamentId),
  );
  if (!formable) return new Set();
  return new Set(generateBracket(size).map((s) => s.slot));
}

async function assertSlot(tournamentId: string, slotRaw: string): Promise<BracketSlotId> {
  if (!(await currentSlotIds(tournamentId)).has(slotRaw)) {
    throw new AppError(AppErrorCode.NotFound, `Unknown knockout slot ${slotRaw}.`, 404);
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
export function updateBracketSlot(
  tournamentId: string,
  slotRaw: string,
  input: UpdateBracketInput,
): Promise<BracketView> {
  return withMutationLock(async () => {
    await assertTournamentEditable(tournamentId);
    const slot = await assertSlot(tournamentId, slotRaw);
    const current = await bracketRepository.get(tournamentId, slot);
    if (input.expectedRev !== undefined && input.expectedRev !== current.rev) {
      throw new AppError(
        AppErrorCode.RevConflict,
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

    // A pin must reference an existing team OF THIS TOURNAMENT (team deletion
    // is locked while any override exists — see hasStarted — so a stored pin
    // can never dangle). A foreign tournament's team is as nonexistent here as
    // an unknown id.
    const homeOverride = next.homeOverrideId != null ? await teamRepository.getStored(next.homeOverrideId) : null;
    if (next.homeOverrideId != null && (!homeOverride || homeOverride.tournamentId !== tournamentId)) {
      throw new AppError(AppErrorCode.NotFound, `Override team ${next.homeOverrideId} not found.`, 404);
    }
    const awayOverride = next.awayOverrideId != null ? await teamRepository.getStored(next.awayOverrideId) : null;
    if (next.awayOverrideId != null && (!awayOverride || awayOverride.tournamentId !== tournamentId)) {
      throw new AppError(AppErrorCode.NotFound, `Override team ${next.awayOverrideId} not found.`, 404);
    }
    if (next.homeOverrideId != null && next.homeOverrideId === next.awayOverrideId) {
      throw new AppError(AppErrorCode.Invalid, 'A team cannot play itself.', 400);
    }

    // A slot can only be played once its two sides resolve to two DIFFERENT
    // teams. Resolve against the HYPOTHETICAL store including this write, so a
    // patch that both pins a side and starts the match is judged on its outcome
    // (this also catches the propagated duplicate: a pinned team meeting itself
    // arriving as a derived winner of another slot).
    if (next.status !== 'scheduled') {
      const hypothetical = await bracketRepository.results(tournamentId);
      hypothetical[slot] = next;
      const view = resolveBracket(
        await groupRepository.list(tournamentId),
        await teamRepository.listSeed(tournamentId),
        await matchRepository.list(tournamentId),
        hypothetical,
      );
      const bm = view.matches.find((b) => b.slot === slot);
      if (!bm || !('team' in bm.home) || !('team' in bm.away)) {
        throw new AppError(AppErrorCode.SlotNotReady, 'This knockout match has no teams yet.', 409);
      }
      if (bm.home.team.id === bm.away.team.id) {
        throw new AppError(AppErrorCode.Invalid, 'Both sides of this match resolve to the same team.', 400);
      }
    }

    // Knockouts cannot end level: a finished draw needs a decisive shootout.
    if (next.status === 'finished' && next.homeScore === next.awayScore) {
      if (next.homePens == null || next.awayPens == null || next.homePens === next.awayPens) {
        throw new AppError(
          AppErrorCode.DrawUnresolved,
          'A level knockout match needs a penalty result to decide a winner.',
          400,
        );
      }
    }

    await bracketRepository.save(tournamentId, slot, next);
    return resolvedBracket(tournamentId);
  });
}

/** Admin: clear a tournament's knockout results (needed before changing its
 * groups/matches). */
export function resetBracket(tournamentId: string): Promise<BracketView> {
  return withMutationLock(async () => {
    await assertTournamentEditable(tournamentId);
    await bracketRepository.reset(tournamentId);
    return resolvedBracket(tournamentId);
  });
}

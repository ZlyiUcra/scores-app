import type { BracketSlotId, MatchStatus } from '../../../shared/types.js';
import { emptyBracketResult, type BracketResult } from '../../../shared/tournament.js';
import { AppError } from '../errors.js';
import { db, transaction } from '../db.js';

/**
 * Bracket store — per tournament, a partial map of slotId -> result (the key
 * is the (tournamentId, slot) pair). Deliberately narrow: aside from the
 * sanctioned per-side overrides (validated in the service), it can only set a
 * slot's RESULT, so the seed/format integrity can't be bypassed here. Size is
 * NOT this store's concern: which slots exist is a pure function of the
 * tournament's group setup, computed elsewhere.
 */
export interface BracketRepository {
  /** A tournament's written slot results (partial), for the pure resolver. */
  results(tournamentId: string): Partial<Record<BracketSlotId, BracketResult>>;
  /** Stored result for a slot, or an empty scheduled result. */
  get(tournamentId: string, slot: BracketSlotId): BracketResult;
  /** Insert-or-replace one slot's result (slot validity is the service's check). */
  save(tournamentId: string, slot: BracketSlotId, result: BracketResult): void;
  /** Clear a tournament's slots (needed before its bracket size can change). */
  reset(tournamentId: string): void;
  /** True once the tournament's knockout was touched: any slot off `scheduled`
   * OR any pinned participant. Both couple bracket state to the group setup,
   * so both must lock group/team mutations until an explicit reset. */
  hasStarted(tournamentId: string): boolean;
  /** Whether any slot row exists at all (tournament-removal guard). */
  hasAny(tournamentId: string): boolean;
}

class SqliteBracketRepository implements BracketRepository {
  /** tournamentId -> (slot -> result). */
  private byTournament = new Map<string, Map<BracketSlotId, BracketResult>>();

  constructor() {
    this.load();
  }

  private slots(tournamentId: string): Map<BracketSlotId, BracketResult> {
    let m = this.byTournament.get(tournamentId);
    if (!m) {
      m = new Map();
      this.byTournament.set(tournamentId, m);
    }
    return m;
  }

  private load(): void {
    const rows = db
      .prepare(
        'SELECT tournamentId, slot, homeScore, awayScore, homePens, awayPens, status, field, startsAt, homeOverrideId, awayOverrideId, rev FROM bracket',
      )
      .all() as Array<{
      tournamentId: string;
      slot: string;
      homeScore: number;
      awayScore: number;
      homePens: number | null;
      awayPens: number | null;
      status: string;
      field: string;
      startsAt: string | null;
      homeOverrideId: string | null;
      awayOverrideId: string | null;
      rev: number;
    }>;
    this.byTournament.clear();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      this.slots(r.tournamentId).set(r.slot, {
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        homePens: r.homePens,
        awayPens: r.awayPens,
        status: r.status as MatchStatus,
        field: r.field,
        startsAt: r.startsAt,
        homeOverrideId: r.homeOverrideId,
        awayOverrideId: r.awayOverrideId,
        rev: r.rev,
      });
    }
  }

  private persist(): void {
    transaction(() => {
      db.exec('DELETE FROM bracket');
      const ins = db.prepare(
        'INSERT INTO bracket (tournamentId, slot, homeScore, awayScore, homePens, awayPens, status, field, startsAt, homeOverrideId, awayOverrideId, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const [tournamentId, slots] of this.byTournament) {
        for (const [slot, r] of slots) {
          ins.run(
            tournamentId,
            slot,
            r.homeScore,
            r.awayScore,
            r.homePens,
            r.awayPens,
            r.status,
            r.field,
            r.startsAt,
            r.homeOverrideId,
            r.awayOverrideId,
            r.rev,
          );
        }
      }
    });
  }

  results(tournamentId: string): Partial<Record<BracketSlotId, BracketResult>> {
    const out: Partial<Record<BracketSlotId, BracketResult>> = {};
    const slots = this.byTournament.get(tournamentId);
    if (slots) for (const [slot, r] of slots) out[slot] = r;
    return out;
  }

  get(tournamentId: string, slot: BracketSlotId): BracketResult {
    return this.byTournament.get(tournamentId)?.get(slot) ?? emptyBracketResult();
  }

  save(tournamentId: string, slot: BracketSlotId, result: BracketResult): void {
    const slots = this.slots(tournamentId);
    const prev = slots.get(slot);
    slots.set(slot, result);
    try {
      this.persist();
    } catch (err) {
      console.error('[bracket] persist failed during save:', err);
      if (prev) slots.set(slot, prev);
      else slots.delete(slot);
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the knockout result. Try again.', 500);
    }
  }

  reset(tournamentId: string): void {
    const prev = this.byTournament.get(tournamentId);
    if (!prev || prev.size === 0) return;
    this.byTournament.set(tournamentId, new Map());
    try {
      this.persist();
    } catch (err) {
      console.error('[bracket] persist failed during reset:', err);
      this.byTournament.set(tournamentId, prev);
      throw new AppError('STORE_WRITE_FAILED', 'Could not reset the bracket. Try again.', 500);
    }
  }

  hasStarted(tournamentId: string): boolean {
    const slots = this.byTournament.get(tournamentId);
    if (!slots) return false;
    for (const r of slots.values()) {
      if (r.status !== 'scheduled' || r.homeOverrideId != null || r.awayOverrideId != null) return true;
    }
    return false;
  }

  hasAny(tournamentId: string): boolean {
    const slots = this.byTournament.get(tournamentId);
    return slots !== undefined && slots.size > 0;
  }
}

/** Singleton instance every service shares (state lives in one process). */
export const bracketRepository: BracketRepository = new SqliteBracketRepository();

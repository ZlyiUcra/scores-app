import type { BracketSlotId, MatchStatus } from '../../shared/types.js';
import { emptyBracketResult, type BracketResult } from '../../shared/tournament.js';
import { AppError } from './errors.js';
import { db, transaction } from './db.js';

/** Persisted knockout slot: a result only. Teams are NEVER stored here — they
 * are derived from group standings + earlier results (see resolveBracket).
 * Slot ids are dynamic (`R{roundSize}M{index}` / `THIRD`); the store keeps only
 * the slots that have actually been written, and the resolver fills the rest. */
interface StoredSlot extends BracketResult {
  slot: BracketSlotId;
}

/**
 * Bracket store — a partial map of slotId -> result. Deliberately narrow: it can
 * only set a slot's RESULT, never its teams, so the seed/format integrity can't
 * be bypassed here. Size is NOT this store's concern: which slots exist is a
 * pure function of the group setup, computed elsewhere.
 */
export interface BracketRepository {
  /** All written slot results (partial), for the pure resolver. */
  results(): Partial<Record<BracketSlotId, BracketResult>>;
  /** Stored result for a slot, or an empty scheduled result. */
  get(slot: BracketSlotId): BracketResult;
  save(slot: BracketSlotId, result: BracketResult): void;
  /** Clear every slot (needed before the bracket size can change). */
  reset(): void;
  /** True once any slot has moved off `scheduled` (a result was entered). */
  hasStarted(): boolean;
}

class SqliteBracketRepository implements BracketRepository {
  private bySlot = new Map<BracketSlotId, BracketResult>();

  constructor() {
    this.load();
  }

  private load(): void {
    const rows = db
      .prepare('SELECT slot, homeScore, awayScore, homePens, awayPens, status, field, startsAt, rev FROM bracket')
      .all() as Array<{
      slot: string;
      homeScore: number;
      awayScore: number;
      homePens: number | null;
      awayPens: number | null;
      status: string;
      field: string;
      startsAt: string | null;
      rev: number;
    }>;
    this.bySlot.clear();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      this.bySlot.set(r.slot, {
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        homePens: r.homePens,
        awayPens: r.awayPens,
        status: r.status as MatchStatus,
        field: r.field,
        startsAt: r.startsAt,
        rev: r.rev,
      });
    }
  }

  private persist(): void {
    transaction(() => {
      db.exec('DELETE FROM bracket');
      const ins = db.prepare(
        'INSERT INTO bracket (slot, homeScore, awayScore, homePens, awayPens, status, field, startsAt, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const [slot, r] of this.bySlot) {
        ins.run(slot, r.homeScore, r.awayScore, r.homePens, r.awayPens, r.status, r.field, r.startsAt, r.rev);
      }
    });
  }

  results(): Partial<Record<BracketSlotId, BracketResult>> {
    const out: Partial<Record<BracketSlotId, BracketResult>> = {};
    for (const [slot, r] of this.bySlot) out[slot] = r;
    return out;
  }

  get(slot: BracketSlotId): BracketResult {
    return this.bySlot.get(slot) ?? emptyBracketResult();
  }

  save(slot: BracketSlotId, result: BracketResult): void {
    const prev = this.bySlot.get(slot);
    this.bySlot.set(slot, result);
    try {
      this.persist();
    } catch (err) {
      console.error('[bracket] persist failed during save:', err);
      if (prev) this.bySlot.set(slot, prev);
      else this.bySlot.delete(slot);
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the knockout result. Try again.', 500);
    }
  }

  reset(): void {
    const prev = new Map(this.bySlot);
    this.bySlot.clear();
    try {
      this.persist();
    } catch (err) {
      console.error('[bracket] persist failed during reset:', err);
      this.bySlot = prev;
      throw new AppError('STORE_WRITE_FAILED', 'Could not reset the bracket. Try again.', 500);
    }
  }

  hasStarted(): boolean {
    for (const r of this.bySlot.values()) if (r.status !== 'scheduled') return true;
    return false;
  }
}

export const bracketRepository: BracketRepository = new SqliteBracketRepository();

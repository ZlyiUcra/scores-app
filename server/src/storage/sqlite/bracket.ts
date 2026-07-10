import type { BracketSlotId, MatchStatus } from '../../../../shared/types.js';
import { emptyBracketResult, type BracketResult } from '../../../../shared/tournament.js';
import { AppError, AppErrorCode } from '../../errors.js';
import type { BracketRepository } from '../contracts.js';
import type { SqliteContext } from './db.js';

/** SQLite bracket: tournamentId -> (slot -> result) in nested Maps, persist =
 * rewrite-all inside a transaction. */
export class SqliteBracketRepository implements BracketRepository {
  private byTournament = new Map<string, Map<BracketSlotId, BracketResult>>();

  constructor(private ctx: SqliteContext) {
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
    const rows = this.ctx.db
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
    this.ctx.transaction(() => {
      this.ctx.db.exec('DELETE FROM bracket');
      const ins = this.ctx.db.prepare(
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

  async results(tournamentId: string): Promise<Partial<Record<BracketSlotId, BracketResult>>> {
    const out: Partial<Record<BracketSlotId, BracketResult>> = {};
    const slots = this.byTournament.get(tournamentId);
    if (slots) for (const [slot, r] of slots) out[slot] = r;
    return out;
  }

  async get(tournamentId: string, slot: BracketSlotId): Promise<BracketResult> {
    return this.byTournament.get(tournamentId)?.get(slot) ?? emptyBracketResult();
  }

  async save(tournamentId: string, slot: BracketSlotId, result: BracketResult): Promise<void> {
    const slots = this.slots(tournamentId);
    const prev = slots.get(slot);
    slots.set(slot, result);
    try {
      this.persist();
    } catch (err) {
      console.error('[bracket] persist failed during save:', err);
      if (prev) slots.set(slot, prev);
      else slots.delete(slot);
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not save the knockout result. Try again.', 500);
    }
  }

  async reset(tournamentId: string): Promise<void> {
    const prev = this.byTournament.get(tournamentId);
    if (!prev || prev.size === 0) return;
    this.byTournament.set(tournamentId, new Map());
    try {
      this.persist();
    } catch (err) {
      console.error('[bracket] persist failed during reset:', err);
      this.byTournament.set(tournamentId, prev);
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not reset the bracket. Try again.', 500);
    }
  }

  async hasStarted(tournamentId: string): Promise<boolean> {
    const slots = this.byTournament.get(tournamentId);
    if (!slots) return false;
    for (const r of slots.values()) {
      if (r.status !== 'scheduled' || r.homeOverrideId != null || r.awayOverrideId != null) return true;
    }
    return false;
  }
}

import crypto from 'node:crypto';
import type { Tournament, TournamentStatus } from '../../../../shared/types.js';
import { AppError, AppErrorCode } from '../../errors.js';
import type { StoredTournament, TournamentRepository } from '../contracts.js';
import { toTournamentDto } from '../mapping.js';
import type { SqliteContext } from './db.js';

/** SQLite tournaments: full collection in a Map, persist = rewrite-all inside
 * a transaction (driver-private detail — fine at this data size). */
export class SqliteTournamentRepository implements TournamentRepository {
  private byId = new Map<string, StoredTournament>();

  constructor(private ctx: SqliteContext) {
    this.load();
  }

  private load(): void {
    const rows = this.ctx.db
      .prepare('SELECT id, name, startsAt, endsAt, status, createdAt FROM tournaments')
      .all() as Array<{
      id: string;
      name: string;
      startsAt: string | null;
      endsAt: string | null;
      status: string;
      createdAt: string;
    }>;
    const sorted = rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    this.byId.clear();
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      this.byId.set(r.id, { ...r, status: r.status as TournamentStatus });
    }
  }

  private persist(): void {
    this.ctx.transaction(() => {
      this.ctx.db.exec('DELETE FROM tournaments');
      const ins = this.ctx.db.prepare(
        'INSERT INTO tournaments (id, name, startsAt, endsAt, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const t of this.byId.values()) ins.run(t.id, t.name, t.startsAt, t.endsAt, t.status, t.createdAt);
    });
  }

  async list(): Promise<Tournament[]> {
    return Array.from(this.byId.values()).map(toTournamentDto);
  }

  async get(id: string): Promise<Tournament | undefined> {
    const t = this.byId.get(id);
    return t ? toTournamentDto(t) : undefined;
  }

  async create(input: {
    name: string;
    startsAt: string | null;
    endsAt: string | null;
    status: TournamentStatus;
  }): Promise<Tournament> {
    const tournament: StoredTournament = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status,
      createdAt: new Date().toISOString(),
    };
    this.byId.set(tournament.id, tournament);
    try {
      this.persist();
    } catch (err) {
      console.error('[tournaments] persist failed during create:', err);
      this.byId.delete(tournament.id);
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not save the tournament. Try again.', 500);
    }
    return toTournamentDto(tournament);
  }

  async update(
    id: string,
    patch: { name?: string; startsAt?: string | null; endsAt?: string | null; status?: TournamentStatus },
  ): Promise<Tournament> {
    const tournament = this.byId.get(id);
    if (!tournament) throw new AppError(AppErrorCode.NotFound, `Tournament ${id} not found.`, 404);
    const prev = { ...tournament };
    if (patch.name !== undefined) tournament.name = patch.name.trim();
    if (patch.startsAt !== undefined) tournament.startsAt = patch.startsAt;
    if (patch.endsAt !== undefined) tournament.endsAt = patch.endsAt;
    if (patch.status !== undefined) tournament.status = patch.status;
    try {
      this.persist();
    } catch (err) {
      console.error('[tournaments] persist failed during update:', err);
      this.byId.set(id, prev);
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not update the tournament. Try again.', 500);
    }
    return toTournamentDto(tournament);
  }

  async remove(id: string): Promise<void> {
    const prev = this.byId.get(id);
    if (!prev) throw new AppError(AppErrorCode.NotFound, `Tournament ${id} not found.`, 404);
    this.byId.delete(id);
    try {
      this.persist();
    } catch (err) {
      console.error('[tournaments] persist failed during remove:', err);
      this.byId.set(id, prev);
      throw new AppError(AppErrorCode.StoreWriteFailed, 'Could not remove the tournament. Try again.', 500);
    }
  }
}

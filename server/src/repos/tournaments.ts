import crypto from 'node:crypto';
import type { Tournament, TournamentStatus } from '../../../shared/types.js';
import { AppError } from '../errors.js';
import { db, transaction } from '../db.js';

/** Stored tournament carries a creation timestamp (stable ordering + the
 * default-tournament resolution key). */
interface StoredTournament extends Tournament {
  createdAt: string;
}

/**
 * Tournament registry — the top-level container. Every group/team/match/
 * bracket row references a tournament by id. db.ts guarantees at least one
 * tournament exists at boot (it adopts pre-tournament data into a default).
 * Emptiness guards for removal live in the SERVICE.
 */
export interface TournamentRepository {
  /** All tournaments in stable creation order (createdAt, then id). */
  list(): Tournament[];
  /** Tournament by id, or undefined. */
  get(id: string): Tournament | undefined;
  /** Create a tournament with a fresh uuid; fields arrive pre-validated. */
  create(input: { name: string; startsAt: string | null; endsAt: string | null; status: TournamentStatus }): Tournament;
  /** Patch name/dates/status. */
  update(
    id: string,
    patch: { name?: string; startsAt?: string | null; endsAt?: string | null; status?: TournamentStatus },
  ): Tournament;
  /** Delete a tournament. Emptiness (no groups/teams/matches/bracket rows) and
   * the last-tournament guard are the SERVICE's checks. */
  remove(id: string): void;
}

function toDto(t: StoredTournament): Tournament {
  return { id: t.id, name: t.name, startsAt: t.startsAt, endsAt: t.endsAt, status: t.status };
}

class SqliteTournamentRepository implements TournamentRepository {
  private byId = new Map<string, StoredTournament>();

  constructor() {
    this.load();
  }

  private load(): void {
    const rows = db
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
    transaction(() => {
      db.exec('DELETE FROM tournaments');
      const ins = db.prepare('INSERT INTO tournaments (id, name, startsAt, endsAt, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)');
      for (const t of this.byId.values()) ins.run(t.id, t.name, t.startsAt, t.endsAt, t.status, t.createdAt);
    });
  }

  list(): Tournament[] {
    return Array.from(this.byId.values()).map(toDto);
  }

  get(id: string): Tournament | undefined {
    const t = this.byId.get(id);
    return t ? toDto(t) : undefined;
  }

  create(input: { name: string; startsAt: string | null; endsAt: string | null; status: TournamentStatus }): Tournament {
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
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the tournament. Try again.', 500);
    }
    return toDto(tournament);
  }

  update(
    id: string,
    patch: { name?: string; startsAt?: string | null; endsAt?: string | null; status?: TournamentStatus },
  ): Tournament {
    const tournament = this.byId.get(id);
    if (!tournament) throw new AppError('NOT_FOUND', `Tournament ${id} not found.`, 404);
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
      throw new AppError('STORE_WRITE_FAILED', 'Could not update the tournament. Try again.', 500);
    }
    return toDto(tournament);
  }

  remove(id: string): void {
    const prev = this.byId.get(id);
    if (!prev) throw new AppError('NOT_FOUND', `Tournament ${id} not found.`, 404);
    this.byId.delete(id);
    try {
      this.persist();
    } catch (err) {
      console.error('[tournaments] persist failed during remove:', err);
      this.byId.set(id, prev);
      throw new AppError('STORE_WRITE_FAILED', 'Could not remove the tournament. Try again.', 500);
    }
  }
}

/** Singleton instance every service shares (state lives in one process). */
export const tournamentRepository: TournamentRepository = new SqliteTournamentRepository();

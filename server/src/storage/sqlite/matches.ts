import type { Match, MatchStatus } from '../../../../shared/types.js';
import { AppError } from '../../errors.js';
import type { MatchRepository, StoredMatch } from '../contracts.js';
import { resolveMatch } from '../mapping.js';
import type { SqliteContext } from './db.js';
import type { SqliteTeamRepository } from './teams.js';

/** SQLite matches: full collection in a Map, persist = rewrite-all inside a
 * transaction. Resolved DTOs embed teams via the team repository's sync Map
 * lookup — the sqlite flavor of "one joined read". */
export class SqliteMatchRepository implements MatchRepository {
  private matches = new Map<string, StoredMatch>();

  constructor(
    private ctx: SqliteContext,
    private teams: SqliteTeamRepository,
  ) {
    this.load();
  }

  private load(): void {
    const rows = this.ctx.db
      .prepare(
        'SELECT id, tournamentId, "group" AS grp, homeId, awayId, homeScore, awayScore, status, startsAt, field, rev FROM matches',
      )
      .all() as Array<{
      id: string;
      tournamentId: string;
      grp: string;
      homeId: string;
      awayId: string;
      homeScore: number;
      awayScore: number;
      status: string;
      startsAt: string;
      field: string;
      rev: number;
    }>;
    this.matches.clear();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      this.matches.set(r.id, {
        id: r.id,
        tournamentId: r.tournamentId,
        group: r.grp,
        homeId: r.homeId,
        awayId: r.awayId,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        status: r.status as MatchStatus,
        startsAt: r.startsAt,
        field: r.field,
        rev: r.rev,
      });
    }
  }

  private persist(): void {
    this.ctx.transaction(() => {
      this.ctx.db.exec('DELETE FROM matches');
      const ins = this.ctx.db.prepare(
        'INSERT INTO matches (id, tournamentId, "group", homeId, awayId, homeScore, awayScore, status, startsAt, field, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const m of this.matches.values()) {
        ins.run(m.id, m.tournamentId, m.group, m.homeId, m.awayId, m.homeScore, m.awayScore, m.status, m.startsAt, m.field, m.rev);
      }
    });
  }

  private resolve(m: StoredMatch): Match {
    return resolveMatch(m, (id) => this.teams.getDtoSync(id));
  }

  async list(tournamentId: string): Promise<Match[]> {
    const out: Match[] = [];
    for (const m of this.matches.values()) {
      if (m.tournamentId === tournamentId) out.push(this.resolve(m));
    }
    return out;
  }

  async get(id: string): Promise<Match | undefined> {
    const m = this.matches.get(id);
    return m ? this.resolve(m) : undefined;
  }

  async getStored(id: string): Promise<StoredMatch | undefined> {
    return this.matches.get(id);
  }

  async save(match: StoredMatch): Promise<Match> {
    const prev = this.matches.get(match.id);
    this.matches.set(match.id, match);
    try {
      this.persist();
    } catch (err) {
      console.error('[matches] persist failed during save:', err);
      if (prev) this.matches.set(match.id, prev);
      else this.matches.delete(match.id);
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the match. Try again.', 500);
    }
    return this.resolve(match);
  }

  async remove(id: string): Promise<void> {
    const prev = this.matches.get(id);
    if (!prev) throw new AppError('NOT_FOUND', `Match ${id} not found.`, 404);
    this.matches.delete(id);
    try {
      this.persist();
    } catch (err) {
      console.error('[matches] persist failed during remove:', err);
      this.matches.set(id, prev);
      throw new AppError('STORE_WRITE_FAILED', 'Could not remove the match. Try again.', 500);
    }
  }

  async countByTeam(teamId: string): Promise<number> {
    let count = 0;
    for (const m of this.matches.values()) {
      if (m.homeId === teamId || m.awayId === teamId) count++;
    }
    return count;
  }

  async countByTournament(tournamentId: string): Promise<number> {
    let count = 0;
    for (const m of this.matches.values()) if (m.tournamentId === tournamentId) count++;
    return count;
  }
}

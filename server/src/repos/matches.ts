import type { Match, MatchStatus } from '../../../shared/types.js';
import { AppError } from '../errors.js';
import { teamRepository } from './teams.js';
import { db, transaction } from '../db.js';

/**
 * Persisted match shape: references teams by id (TeamRepository is the source
 * of truth). `group` is derived from the teams at creation. The public `Match`
 * DTO embeds resolved Team objects, produced by `resolveMatch()` — so the
 * wire/client contract stays consistent while storage stays normalized.
 */
export interface StoredMatch {
  id: string;
  group: string;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  startsAt: string;
  field: string;
  rev: number;
}

/** Persistence seam for group matches (SQLite today; swap behind this). */
export interface MatchRepository {
  /** Resolved matches (teams embedded) for read/broadcast. */
  list(): Match[];
  /** One resolved match, or undefined. */
  get(id: string): Match | undefined;
  /** Raw stored form for mutation logic. */
  getStored(id: string): StoredMatch | undefined;
  /** Insert-or-replace by id (rev bumping is the service's responsibility). */
  save(match: StoredMatch): void;
  /** Delete a match; throws NOT_FOUND for an unknown id. */
  remove(id: string): void;
  /** How many stored matches reference a given team (referential-integrity guard). */
  countByTeam(teamId: string): number;
}

function seedMatches(): StoredMatch[] {
  const now = Date.now();
  const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString();
  let n = 0;
  const mk = (
    group: string,
    homeId: string,
    awayId: string,
    status: MatchStatus,
    homeScore: number,
    awayScore: number,
    offsetMin: number,
    field: string,
  ): StoredMatch => ({
    id: `m${++n}`,
    group,
    homeId,
    awayId,
    homeScore,
    awayScore,
    status,
    startsAt: iso(offsetMin),
    field,
    rev: 1,
  });

  // Round-robin within each of the 3 groups. Group A is fully played, B is in
  // progress, C is upcoming — so both resolved and symbolic bracket slots show.
  // `group` is the group id (see groups.ts / teams.ts seeds).
  return [
    // Group A (all finished)
    mk('gA', 't1', 't2', 'finished', 2, 1, -220, 'Campo 1'),
    mk('gA', 't1', 't3', 'finished', 1, 1, -190, 'Campo 2'),
    mk('gA', 't2', 't3', 'finished', 0, 3, -160, 'Campo 1'),
    // Group B (two finished, one live)
    mk('gB', 't4', 't5', 'finished', 1, 0, -130, 'Campo 2'),
    mk('gB', 't4', 't6', 'finished', 2, 2, -100, 'Campo 3'),
    mk('gB', 't5', 't6', 'live', 1, 0, -54, 'Campo 1'),
    // Group C (one finished, two scheduled)
    mk('gC', 't7', 't8', 'finished', 3, 2, -70, 'Campo 3'),
    mk('gC', 't7', 't9', 'scheduled', 0, 0, 30, 'Campo 2'),
    mk('gC', 't8', 't9', 'scheduled', 0, 0, 60, 'Campo 3'),
  ];
}

/** Resolve a stored match into the public Match DTO (teams embedded). */
export function resolveMatch(m: StoredMatch): Match {
  const home = teamRepository.get(m.homeId);
  const away = teamRepository.get(m.awayId);
  if (!home || !away) {
    // Should never happen: team deletion is blocked while referenced.
    throw new AppError('DATA_INTEGRITY', `Match ${m.id} references a missing team.`, 500);
  }
  return {
    id: m.id,
    group: m.group,
    home,
    away,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.status,
    startsAt: m.startsAt,
    field: m.field,
    rev: m.rev,
  };
}

class JsonFileRepository implements MatchRepository {
  private matches = new Map<string, StoredMatch>();

  constructor() {
    this.load();
  }

  private index(matches: StoredMatch[]): void {
    this.matches.clear();
    for (let i = 0; i < matches.length; i++) this.matches.set(matches[i].id, matches[i]);
  }

  private load(): void {
    const rows = db
      .prepare(
        'SELECT id, "group" AS grp, homeId, awayId, homeScore, awayScore, status, startsAt, field, rev FROM matches',
      )
      .all() as Array<{
      id: string;
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
    if (rows.length === 0) {
      // Demo fixtures reference the demo teams t1..t9. On a customized roster
      // (teams created by the admin, demo ones deleted) an empty match table
      // must STAY empty — seeding would point at missing teams and crash
      // every read until the database is wiped.
      const demoTeams = seedMatches().every(
        (m) => teamRepository.get(m.homeId) && teamRepository.get(m.awayId),
      );
      if (demoTeams) {
        this.index(seedMatches());
        this.persist();
      }
      return;
    }
    this.index(
      rows.map((r) => ({
        id: r.id,
        group: r.grp,
        homeId: r.homeId,
        awayId: r.awayId,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        status: r.status as MatchStatus,
        startsAt: r.startsAt,
        field: r.field,
        rev: r.rev,
      })),
    );
  }

  private persist(): void {
    transaction(() => {
      db.exec('DELETE FROM matches');
      const ins = db.prepare(
        'INSERT INTO matches (id, "group", homeId, awayId, homeScore, awayScore, status, startsAt, field, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const m of this.matches.values()) {
        ins.run(m.id, m.group, m.homeId, m.awayId, m.homeScore, m.awayScore, m.status, m.startsAt, m.field, m.rev);
      }
    });
  }

  list(): Match[] {
    const out: Match[] = [];
    for (const m of this.matches.values()) out.push(resolveMatch(m));
    return out;
  }

  get(id: string): Match | undefined {
    const m = this.matches.get(id);
    return m ? resolveMatch(m) : undefined;
  }

  getStored(id: string): StoredMatch | undefined {
    return this.matches.get(id);
  }

  save(match: StoredMatch): void {
    const prev = this.matches.get(match.id);
    this.matches.set(match.id, match);
    try {
      this.persist();
    } catch (err) {
      console.error('[store] persist failed during save:', err);
      if (prev) this.matches.set(match.id, prev);
      else this.matches.delete(match.id);
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the match. Try again.', 500);
    }
  }

  remove(id: string): void {
    const prev = this.matches.get(id);
    if (!prev) throw new AppError('NOT_FOUND', `Match ${id} not found.`, 404);
    this.matches.delete(id);
    try {
      this.persist();
    } catch (err) {
      console.error('[store] persist failed during remove:', err);
      this.matches.set(id, prev);
      throw new AppError('STORE_WRITE_FAILED', 'Could not remove the match. Try again.', 500);
    }
  }

  countByTeam(teamId: string): number {
    let count = 0;
    for (const m of this.matches.values()) {
      if (m.homeId === teamId || m.awayId === teamId) count++;
    }
    return count;
  }
}

/** Singleton instance every service shares (state lives in one process). */
export const matchRepository: MatchRepository = new JsonFileRepository();

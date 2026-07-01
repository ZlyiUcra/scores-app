import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Match, MatchStatus } from '../../shared/types.js';
import { AppError } from './errors.js';
import { teamRepository } from './teams.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'matches.json');
const SCHEMA_VERSION = 1;

/**
 * Persisted match shape: references teams by id (TeamRepository is the source
 * of truth). The public `Match` DTO embeds resolved Team objects, produced by
 * `resolve()` — so the wire/client contract is unchanged while storage stays
 * normalized.
 */
export interface StoredMatch {
  id: string;
  group: string;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  minute: number;
  startsAt: string;
  rev: number;
}

interface MatchFile {
  version: number;
  matches: StoredMatch[];
}

export interface MatchRepository {
  /** Resolved matches (teams embedded) for read/broadcast. */
  list(): Match[];
  get(id: string): Match | undefined;
  /** Raw stored form for mutation logic. */
  getStored(id: string): StoredMatch | undefined;
  save(match: StoredMatch): void;
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
    minute: number,
    offsetMin: number,
  ): StoredMatch => ({
    id: `m${++n}`,
    group,
    homeId,
    awayId,
    homeScore,
    awayScore,
    status,
    minute,
    startsAt: iso(offsetMin),
    rev: 1,
  });

  return [
    mk('A', 't1', 't2', 'live', 1, 0, 37, -37),
    mk('A', 't3', 't4', 'live', 2, 2, 71, -71),
    mk('A', 't1', 't3', 'scheduled', 0, 0, 0, 45),
    mk('B', 't5', 't6', 'finished', 3, 1, 90, -120),
    mk('B', 't2', 't4', 'scheduled', 0, 0, 0, 90),
    mk('B', 't5', 't1', 'scheduled', 0, 0, 0, 150),
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
    minute: m.minute,
    startsAt: m.startsAt,
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
    if (!fs.existsSync(DATA_FILE)) {
      this.index(seedMatches());
      this.persist();
      return;
    }
    let parsed: MatchFile;
    try {
      parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as MatchFile;
    } catch (err) {
      throw new Error(`[store] ${DATA_FILE} is corrupt and was NOT overwritten. (${String(err)})`);
    }
    if (!parsed || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.matches)) {
      throw new Error(`[store] ${DATA_FILE} has an unexpected schema. Refusing to start.`);
    }
    this.index(parsed.matches);
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const payload: MatchFile = { version: SCHEMA_VERSION, matches: Array.from(this.matches.values()) };
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
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

export const matchRepository: MatchRepository = new JsonFileRepository();

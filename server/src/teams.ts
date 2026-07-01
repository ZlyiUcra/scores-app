import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Team } from '../../shared/types.js';
import { AppError } from './errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'teams.json');
const SCHEMA_VERSION = 1;

interface TeamFile {
  version: number;
  teams: Team[];
}

/**
 * Team registry — the single source of truth for team identity. Matches
 * reference teams by id (see store.ts), so the same club stays one identity
 * across the whole tournament. Team rename is intentionally NOT supported in
 * v1, which keeps id-referencing free of stale-copy hazards.
 */
export interface TeamRepository {
  list(): Team[];
  get(id: string): Team | undefined;
  create(input: { name: string; shortName: string }): Team;
  remove(id: string): void;
}

function seedTeams(): Team[] {
  return [
    { id: 't1', name: 'FC Lions', shortName: 'LIO' },
    { id: 't2', name: 'Eagles United', shortName: 'EAG' },
    { id: 't3', name: 'Blue Sharks', shortName: 'SHA' },
    { id: 't4', name: 'Grey Wolves', shortName: 'WOL' },
    { id: 't5', name: 'Red Foxes', shortName: 'FOX' },
    { id: 't6', name: 'City Bears', shortName: 'BEA' },
  ];
}

class JsonFileTeamRepository implements TeamRepository {
  private byId = new Map<string, Team>();

  constructor() {
    this.load();
  }

  private index(teams: Team[]): void {
    this.byId.clear();
    for (let i = 0; i < teams.length; i++) this.byId.set(teams[i].id, teams[i]);
  }

  private load(): void {
    if (!fs.existsSync(DATA_FILE)) {
      this.index(seedTeams());
      this.persist();
      return;
    }
    let parsed: TeamFile;
    try {
      parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as TeamFile;
    } catch (err) {
      throw new Error(`[teams] ${DATA_FILE} is corrupt and was NOT overwritten. (${String(err)})`);
    }
    if (!parsed || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.teams)) {
      throw new Error(`[teams] ${DATA_FILE} has an unexpected schema. Refusing to start.`);
    }
    this.index(parsed.teams);
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const payload: TeamFile = { version: SCHEMA_VERSION, teams: Array.from(this.byId.values()) };
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  }

  list(): Team[] {
    return Array.from(this.byId.values());
  }

  get(id: string): Team | undefined {
    return this.byId.get(id);
  }

  create(input: { name: string; shortName: string }): Team {
    const team: Team = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      shortName: input.shortName.trim().toUpperCase(),
    };
    this.byId.set(team.id, team);
    try {
      this.persist();
    } catch (err) {
      console.error('[teams] persist failed during create:', err);
      this.byId.delete(team.id);
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the team. Try again.', 500);
    }
    return team;
  }

  remove(id: string): void {
    if (!this.byId.has(id)) throw new AppError('NOT_FOUND', `Team ${id} not found.`, 404);
    const removed = this.byId.get(id)!;
    this.byId.delete(id);
    try {
      this.persist();
    } catch (err) {
      console.error('[teams] persist failed during remove:', err);
      this.byId.set(id, removed); // roll back
      throw new AppError('STORE_WRITE_FAILED', 'Could not remove the team. Try again.', 500);
    }
  }
}

export const teamRepository: TeamRepository = new JsonFileTeamRepository();

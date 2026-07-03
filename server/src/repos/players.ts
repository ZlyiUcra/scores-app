import crypto from 'node:crypto';
import type { Player } from '../../../shared/types.js';
import { AppError } from '../errors.js';
import { db, transaction } from '../db.js';

/**
 * Squad registry — players belong to a team by id. Purely descriptive (no effect
 * on standings/seeding). Jersey number is unique within a team when present.
 */
export interface PlayerRepository {
  /** Every player across all teams (rides the roster snapshot). */
  list(): Player[];
  /** Player by id, or undefined. */
  get(id: string): Player | undefined;
  /** All players of one team (a squad), unordered — display sorting is client-side. */
  listByTeam(teamId: string): Player[];
  /** Squad size of a team. */
  countInTeam(teamId: string): number;
  /** Is a jersey number already taken in a team (optionally ignoring one player)? */
  numberInUse(teamId: string, number: number, exceptId?: string): boolean;
  /** Insert a player with a fresh uuid. Number uniqueness is the SERVICE's check. */
  create(input: { teamId: string; name: string; number: number | null; position: string | null }): Player;
  /** Patch name/number/position; team membership is immutable (delete + re-add). */
  update(id: string, patch: { name?: string; number?: number | null; position?: string | null }): Player;
  /** Delete one player; throws NOT_FOUND for an unknown id. */
  remove(id: string): void;
  /** Cascade: drop all players of a team (used when the team is deleted). */
  removeByTeam(teamId: string): void;
}

/** A small demo squad so the squads view shows something on first boot. */
function seedPlayers(): Player[] {
  const mk = (id: string, teamId: string, name: string, number: number | null, position: string | null): Player => ({
    id,
    teamId,
    name,
    number,
    position,
  });
  return [
    mk('p1', 't1', 'Miguel Costa', 1, 'GK'),
    mk('p2', 't1', 'Diogo Santos', 7, 'FW'),
    mk('p3', 't1', 'Rui Almeida', 10, 'MF'),
  ];
}

class SqlitePlayerRepository implements PlayerRepository {
  private byId = new Map<string, Player>();

  constructor() {
    this.load();
  }

  private index(players: Player[]): void {
    this.byId.clear();
    for (let i = 0; i < players.length; i++) this.byId.set(players[i].id, players[i]);
  }

  private load(): void {
    const rows = db
      .prepare('SELECT id, teamId, name, number, position FROM players')
      .all() as Array<{ id: string; teamId: string; name: string; number: number | null; position: string | null }>;
    if (rows.length === 0) {
      this.index(seedPlayers());
      this.persist();
      return;
    }
    this.index(rows);
  }

  private persist(): void {
    transaction(() => {
      db.exec('DELETE FROM players');
      const ins = db.prepare('INSERT INTO players (id, teamId, name, number, position) VALUES (?, ?, ?, ?, ?)');
      for (const p of this.byId.values()) ins.run(p.id, p.teamId, p.name, p.number, p.position);
    });
  }

  list(): Player[] {
    return Array.from(this.byId.values());
  }

  get(id: string): Player | undefined {
    return this.byId.get(id);
  }

  listByTeam(teamId: string): Player[] {
    return Array.from(this.byId.values()).filter((p) => p.teamId === teamId);
  }

  countInTeam(teamId: string): number {
    let n = 0;
    for (const p of this.byId.values()) if (p.teamId === teamId) n++;
    return n;
  }

  numberInUse(teamId: string, number: number, exceptId?: string): boolean {
    for (const p of this.byId.values()) {
      if (p.teamId === teamId && p.number === number && p.id !== exceptId) return true;
    }
    return false;
  }

  create(input: { teamId: string; name: string; number: number | null; position: string | null }): Player {
    const player: Player = {
      id: crypto.randomUUID(),
      teamId: input.teamId,
      name: input.name.trim(),
      number: input.number,
      position: input.position,
    };
    this.byId.set(player.id, player);
    try {
      this.persist();
    } catch (err) {
      console.error('[players] persist failed during create:', err);
      this.byId.delete(player.id);
      throw new AppError('STORE_WRITE_FAILED', 'Could not save the player. Try again.', 500);
    }
    return player;
  }

  update(id: string, patch: { name?: string; number?: number | null; position?: string | null }): Player {
    const player = this.byId.get(id);
    if (!player) throw new AppError('NOT_FOUND', `Player ${id} not found.`, 404);
    const prev = { name: player.name, number: player.number, position: player.position };
    if (patch.name !== undefined) player.name = patch.name.trim();
    if (patch.number !== undefined) player.number = patch.number;
    if (patch.position !== undefined) player.position = patch.position;
    try {
      this.persist();
    } catch (err) {
      console.error('[players] persist failed during update:', err);
      player.name = prev.name;
      player.number = prev.number;
      player.position = prev.position;
      throw new AppError('STORE_WRITE_FAILED', 'Could not update the player. Try again.', 500);
    }
    return player;
  }

  remove(id: string): void {
    const removed = this.byId.get(id);
    if (!removed) throw new AppError('NOT_FOUND', `Player ${id} not found.`, 404);
    this.byId.delete(id);
    try {
      this.persist();
    } catch (err) {
      console.error('[players] persist failed during remove:', err);
      this.byId.set(id, removed);
      throw new AppError('STORE_WRITE_FAILED', 'Could not remove the player. Try again.', 500);
    }
  }

  removeByTeam(teamId: string): void {
    const removed: Player[] = [];
    for (const [id, p] of this.byId) {
      if (p.teamId === teamId) removed.push(p);
    }
    if (removed.length === 0) return;
    for (let i = 0; i < removed.length; i++) this.byId.delete(removed[i].id);
    try {
      this.persist();
    } catch (err) {
      console.error('[players] persist failed during removeByTeam:', err);
      for (let i = 0; i < removed.length; i++) this.byId.set(removed[i].id, removed[i]);
      throw new AppError('STORE_WRITE_FAILED', 'Could not remove the team\'s players. Try again.', 500);
    }
  }
}

/** Singleton instance every service shares (state lives in one process). */
export const playerRepository: PlayerRepository = new SqlitePlayerRepository();

import type { Request } from 'express';
import { resolveTournamentId } from '../services/tournaments.js';
import { AppError } from '../errors.js';

/**
 * The tournament a request addresses: the optional `?tournamentId=` query
 * param, validated (404 for an unknown id), falling back to the default
 * (latest active) tournament when absent — which is what the pre-tournament
 * client always does. Every scoped route funnels through here.
 */
export async function requestTournamentId(req: Request): Promise<string> {
  const raw = req.query.tournamentId;
  if (raw === undefined) return resolveTournamentId(undefined);
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 64) {
    throw new AppError('BAD_REQUEST', 'Invalid tournamentId.', 400);
  }
  return resolveTournamentId(raw);
}

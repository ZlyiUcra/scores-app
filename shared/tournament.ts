// Pure tournament logic — no I/O, imported by BOTH client and server so the
// standings math and bracket resolution have a single implementation. The
// client computes standings for display; the server also resolves the bracket
// it serves. Everything here is a deterministic function of
// (groups + teams + group matches + stored knockout results).

import type {
  BracketMatch,
  BracketParticipant,
  BracketSlotId,
  BracketUnformableReason,
  BracketView,
  Group,
  GroupTable,
  Match,
  MatchStatus,
  Round,
  SeedRef,
  StandingRow,
  Team,
} from './types.js';

/** Format knobs in one place (the single config seam). */
export const TOURNAMENT_FORMAT = {
  /** A group must field at least this many teams to supply two qualifiers. */
  minPerGroup: 2,
  /** Hard cap on group size. */
  maxPerGroup: 5,
  /** Direct qualifiers taken from every group (top-2). */
  qualifiersPerGroup: 2,
  /** Largest supported knockout (16 -> round of 16). */
  maxBracketSize: 16,
  points: { win: 3, draw: 1, loss: 0 },
} as const;

/** Team enriched with its server-only seeding key. Only the server has this;
 * the client never resolves the bracket, so it never needs `groupAddedAt`. */
export interface SeedTeam extends Team {
  groupAddedAt: string | null;
}

/** Stored knockout slot result (teams are NEVER stored — always derived). */
export interface BracketResult {
  homeScore: number;
  awayScore: number;
  homePens: number | null;
  awayPens: number | null;
  status: MatchStatus;
  field: string;
  startsAt: string | null;
  rev: number;
}

export function emptyBracketResult(): BracketResult {
  return {
    homeScore: 0,
    awayScore: 0,
    homePens: null,
    awayPens: null,
    status: 'scheduled',
    field: '',
    startsAt: null,
    rev: 1,
  };
}

/** Smallest power of 2 >= n (n >= 1). */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Round label derived from a round's team-count — the single source of the
 * label, so no numeric round field leaks onto the wire. */
export function roundName(roundSize: number): Round {
  switch (roundSize) {
    case 2:
      return 'final';
    case 4:
      return 'sf';
    case 8:
      return 'qf';
    default:
      return 'r16';
  }
}

/**
 * Per-group standings from FINISHED matches only. No tiebreaks by request: sort
 * by points, then a deterministic teamId fallback so order never flickers.
 */
export function computeStandings(groups: Group[], teams: Team[], matches: Match[]): GroupTable[] {
  const tables: GroupTable[] = [];

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const rowByTeam = new Map<string, StandingRow>();

    // Iterate teams (not matches) so a team with zero matches still appears.
    for (let i = 0; i < teams.length; i++) {
      const tm = teams[i];
      if (tm.groupId !== group.id) continue;
      rowByTeam.set(tm.id, {
        team: tm,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
        rank: 0,
      });
    }

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (m.status !== 'finished' || m.group !== group.id) continue;
      const home = rowByTeam.get(m.home.id);
      const away = rowByTeam.get(m.away.id);
      if (!home || !away) continue;

      home.played++;
      away.played++;
      home.goalsFor += m.homeScore;
      home.goalsAgainst += m.awayScore;
      away.goalsFor += m.awayScore;
      away.goalsAgainst += m.homeScore;

      if (m.homeScore > m.awayScore) {
        home.won++;
        away.lost++;
        home.points += TOURNAMENT_FORMAT.points.win;
      } else if (m.homeScore < m.awayScore) {
        away.won++;
        home.lost++;
        away.points += TOURNAMENT_FORMAT.points.win;
      } else {
        home.drawn++;
        away.drawn++;
        home.points += TOURNAMENT_FORMAT.points.draw;
        away.points += TOURNAMENT_FORMAT.points.draw;
      }
    }

    const rows = Array.from(rowByTeam.values());
    for (let i = 0; i < rows.length; i++) rows[i].goalDiff = rows[i].goalsFor - rows[i].goalsAgainst;
    rows.sort((a, b) => b.points - a.points || a.team.id.localeCompare(b.team.id));
    for (let i = 0; i < rows.length; i++) rows[i].rank = i + 1;

    tables.push({ group, rows });
  }

  return tables;
}

/** How many teams are in a group. */
function teamsInGroup(groupId: string, teams: Team[]): number {
  let n = 0;
  for (let i = 0; i < teams.length; i++) if (teams[i].groupId === groupId) n++;
  return n;
}

/** A group is decided once it has at least one match and every one is finished. */
function isGroupComplete(groupId: string, matches: Match[]): boolean {
  let any = false;
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].group !== groupId) continue;
    any = true;
    if (matches[i].status !== 'finished') return false;
  }
  return any;
}

/** Can a bracket be formed from the current groups, and at what size? Depends
 * only on group count and team counts (NOT results). */
export function computeSize(
  groups: Group[],
  teams: Team[],
): { formable: boolean; reason: BracketUnformableReason | null; size: number } {
  const G = groups.length;
  if (G === 0) return { formable: false, reason: 'noGroups', size: 0 };

  for (let g = 0; g < G; g++) {
    if (teamsInGroup(groups[g].id, teams) < TOURNAMENT_FORMAT.minPerGroup) {
      return { formable: false, reason: 'groupTooSmall', size: 0 };
    }
  }

  const directCount = TOURNAMENT_FORMAT.qualifiersPerGroup * G;
  const size = nextPow2(directCount);
  if (size > TOURNAMENT_FORMAT.maxBracketSize) return { formable: false, reason: 'tooManyGroups', size };

  const thirdsNeeded = size - directCount;
  let thirdsPool = 0;
  for (let g = 0; g < G; g++) if (teamsInGroup(groups[g].id, teams) >= 3) thirdsPool++;
  if (thirdsNeeded > thirdsPool) return { formable: false, reason: 'notEnoughThirds', size };

  return { formable: true, reason: null, size };
}

/** The seeded, ordered list of qualifiers (length = size) once every group is
 * complete; null while still in progress. Thirds are SELECTED by points, but the
 * whole pool is SEEDED by groupAddedAt (then teamId) per the tournament rules. */
function computeQualifiers(
  groups: Group[],
  seedTeams: SeedTeam[],
  matches: Match[],
  size: number,
): SeedTeam[] | null {
  for (let g = 0; g < groups.length; g++) if (!isGroupComplete(groups[g].id, matches)) return null;

  const tables = computeStandings(groups, seedTeams, matches);
  const seedByTeam = new Map<string, string | null>();
  for (let i = 0; i < seedTeams.length; i++) seedByTeam.set(seedTeams[i].id, seedTeams[i].groupAddedAt);

  const direct: StandingRow[] = [];
  const thirds: StandingRow[] = [];
  for (let i = 0; i < tables.length; i++) {
    const rows = tables[i].rows;
    if (rows.length >= 1) direct.push(rows[0]);
    if (rows.length >= 2) direct.push(rows[1]);
    if (rows.length >= 3) thirds.push(rows[2]);
  }

  const directCount = TOURNAMENT_FORMAT.qualifiersPerGroup * groups.length;
  const thirdsNeeded = size - directCount;
  thirds.sort((a, b) => b.points - a.points || a.team.id.localeCompare(b.team.id));
  const pool = direct.concat(thirds.slice(0, thirdsNeeded));

  // Seed the whole pool by (groupAddedAt, then teamId) — total order.
  const ordered = pool
    .map((r) => r.team as SeedTeam)
    .sort((a, b) => {
      const at = seedByTeam.get(a.id) ?? '';
      const bt = seedByTeam.get(b.id) ?? '';
      return at.localeCompare(bt) || a.id.localeCompare(b.id);
    });

  return ordered.length === size ? ordered : null;
}

/**
 * The bracket STRUCTURE for a given size: which seed feeds each slot. Slot ids
 * encode the round's team-count (`R{roundSize}M{index}`) so they stay stable as
 * size changes. First round pairs qualifiers mirror-style (i vs N-1-i); later
 * rounds take winners of adjacent matches; a 3rd-place match (when size >= 4)
 * takes the two semifinal losers.
 */
export function generateBracket(size: number): Array<{ slot: BracketSlotId; round: Round; home: SeedRef; away: SeedRef }> {
  const out: Array<{ slot: BracketSlotId; round: Round; home: SeedRef; away: SeedRef }> = [];
  if (size < 2) return out;

  for (let roundSize = size; roundSize >= 2; roundSize = roundSize / 2) {
    const matchCount = roundSize / 2;
    for (let i = 0; i < matchCount; i++) {
      const slot = `R${roundSize}M${i}`;
      if (roundSize === size) {
        out.push({ slot, round: roundName(roundSize), home: { kind: 'qualifier', index: i }, away: { kind: 'qualifier', index: size - 1 - i } });
      } else {
        const prev = roundSize * 2;
        out.push({
          slot,
          round: roundName(roundSize),
          home: { kind: 'winner', slot: `R${prev}M${2 * i}` },
          away: { kind: 'winner', slot: `R${prev}M${2 * i + 1}` },
        });
      }
    }
  }
  if (size >= 4) {
    out.push({ slot: 'THIRD', round: 'third', home: { kind: 'loser', slot: 'R4M0' }, away: { kind: 'loser', slot: 'R4M1' } });
  }
  return out;
}

/** All slot ids for a given size — the store uses this to know which rows exist. */
export function bracketSlotIds(size: number): BracketSlotId[] {
  return generateBracket(size).map((s) => s.slot);
}

/**
 * Resolve the whole knockout view: formability, size, and the resolved matches.
 * Qualifiers resolve to teams only when every group is complete; winners/losers
 * resolve lazily from stored results (no forward writes).
 */
export function resolveBracket(
  groups: Group[],
  seedTeams: SeedTeam[],
  matches: Match[],
  results: Partial<Record<BracketSlotId, BracketResult>>,
): BracketView {
  const sizeInfo = computeSize(groups, seedTeams);
  if (!sizeInfo.formable) {
    return { formable: false, reason: sizeInfo.reason, size: sizeInfo.size, matches: [] };
  }
  const size = sizeInfo.size;
  const structure = generateBracket(size);
  const qualifiers = computeQualifiers(groups, seedTeams, matches, size);

  const bySlot = new Map<BracketSlotId, { round: Round; home: SeedRef; away: SeedRef }>();
  for (let i = 0; i < structure.length; i++) bySlot.set(structure[i].slot, structure[i]);

  const outcomeMemo = new Map<BracketSlotId, { winner: Team; loser: Team } | null>();

  function resolveSeed(seed: SeedRef): BracketParticipant {
    switch (seed.kind) {
      case 'qualifier':
        return qualifiers ? { team: qualifiers[seed.index] } : { seed };
      case 'winner': {
        const out = slotOutcome(seed.slot);
        return out ? { team: out.winner } : { seed };
      }
      case 'loser': {
        const out = slotOutcome(seed.slot);
        return out ? { team: out.loser } : { seed };
      }
    }
  }

  function slotOutcome(slot: BracketSlotId): { winner: Team; loser: Team } | null {
    const cached = outcomeMemo.get(slot);
    if (cached !== undefined) return cached;
    outcomeMemo.set(slot, null); // provisional, also breaks any accidental cycle

    const res = results[slot];
    const fmt = bySlot.get(slot);
    let outcome: { winner: Team; loser: Team } | null = null;
    if (res && res.status === 'finished' && fmt) {
      const home = resolveSeed(fmt.home);
      const away = resolveSeed(fmt.away);
      if ('team' in home && 'team' in away) {
        let homeWins: boolean | null = null;
        if (res.homeScore > res.awayScore) homeWins = true;
        else if (res.homeScore < res.awayScore) homeWins = false;
        else if (res.homePens != null && res.awayPens != null && res.homePens !== res.awayPens) {
          homeWins = res.homePens > res.awayPens;
        }
        if (homeWins !== null) {
          outcome = homeWins ? { winner: home.team, loser: away.team } : { winner: away.team, loser: home.team };
        }
      }
    }
    outcomeMemo.set(slot, outcome);
    return outcome;
  }

  const out: BracketMatch[] = [];
  for (let i = 0; i < structure.length; i++) {
    const s = structure[i];
    const res = results[s.slot] ?? emptyBracketResult();
    out.push({
      slot: s.slot,
      round: s.round,
      home: resolveSeed(s.home),
      away: resolveSeed(s.away),
      homeScore: res.homeScore,
      awayScore: res.awayScore,
      homePens: res.homePens,
      awayPens: res.awayPens,
      status: res.status,
      field: res.field,
      startsAt: res.startsAt,
      rev: res.rev,
    });
  }
  return { formable: true, reason: null, size, matches: out };
}

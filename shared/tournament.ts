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

/** Stored knockout slot: a result plus optional per-side admin overrides.
 * Participants are still derived by default; an override pins one side to a
 * team id (walkover/disqualification/correction) and is the ONLY stored team
 * reference in the knockout. */
export interface BracketResult {
  homeScore: number;
  awayScore: number;
  homePens: number | null;
  awayPens: number | null;
  status: MatchStatus;
  field: string;
  startsAt: string | null;
  /** Admin-pinned participants; null = derived from seeds/results. */
  homeOverrideId: string | null;
  awayOverrideId: string | null;
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
    homeOverrideId: null,
    awayOverrideId: null,
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

/** Whether a match contributes to standings: finished always, live only when opted in. */
function countsForStandings(m: Match, includeLive: boolean): boolean {
  return m.status === 'finished' || (includeLive && m.status === 'live');
}

/**
 * Points each of the two teams earned in their counted mutual meetings within
 * the group. Returned as a sort delta (negative -> `a` ranks higher).
 */
function headToHeadDelta(
  aId: string,
  bId: string,
  groupId: string,
  matches: Match[],
  includeLive: boolean,
): number {
  let aPts = 0;
  let bPts = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (!countsForStandings(m, includeLive) || m.group !== groupId) continue;
    const ab = m.home.id === aId && m.away.id === bId;
    const ba = m.home.id === bId && m.away.id === aId;
    if (!ab && !ba) continue;
    const aScore = ab ? m.homeScore : m.awayScore;
    const bScore = ab ? m.awayScore : m.homeScore;
    if (aScore > bScore) aPts += TOURNAMENT_FORMAT.points.win;
    else if (aScore < bScore) bPts += TOURNAMENT_FORMAT.points.win;
    else {
      aPts += TOURNAMENT_FORMAT.points.draw;
      bPts += TOURNAMENT_FORMAT.points.draw;
    }
  }
  return bPts - aPts;
}

/**
 * Per-group standings. Counts FINISHED matches; `includeLive` also counts the
 * current score of LIVE matches (provisional live tables — a just-started game
 * is a provisional draw). Sort: points, then wins, then goal difference, then
 * goals scored, then (only when all four are level) the head-to-head meetings,
 * then a deterministic teamId fallback so order never flickers.
 */
export function computeStandings(
  groups: Group[],
  teams: Team[],
  matches: Match[],
  opts?: { includeLive?: boolean },
): GroupTable[] {
  const includeLive = opts?.includeLive ?? false;
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
      if (!countsForStandings(m, includeLive) || m.group !== group.id) continue;
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
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.won - a.won ||
        b.goalDiff - a.goalDiff ||
        b.goalsFor - a.goalsFor ||
        headToHeadDelta(a.team.id, b.team.id, group.id, matches, includeLive) ||
        a.team.id.localeCompare(b.team.id),
    );
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

/** A group is decided once the FULL round-robin is played: every unordered
 * pair of its teams has a finished match and no match is still pending. The
 * coverage check matters when a team joins an already-played group — until its
 * fixtures exist, the old "all matches finished" test would call the group
 * complete and let a team with zero games into the real (non-preview) seeds. */
function isGroupComplete(groupId: string, teams: Team[], matches: Match[]): boolean {
  const finishedPairs = new Set<string>();
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.group !== groupId) continue;
    if (m.status !== 'finished') return false;
    const a = m.home.id;
    const b = m.away.id;
    finishedPairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  }
  const members: string[] = [];
  for (let i = 0; i < teams.length; i++) if (teams[i].groupId === groupId) members.push(teams[i].id);
  if (members.length < 2) return false;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];
      if (!finishedPairs.has(a < b ? `${a}|${b}` : `${b}|${a}`)) return false;
    }
  }
  return true;
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

/**
 * Third-placed rows across all groups in QUALIFICATION order — the exact
 * comparator used to pick the best thirds for the bracket (points, wins,
 * goal difference, goals for — no head-to-head across groups — then a
 * deterministic teamId fallback). Also drives the public best-3rds table.
 */
export function computeThirdPlaces(tables: GroupTable[]): Array<{ group: Group; row: StandingRow }> {
  const out: Array<{ group: Group; row: StandingRow }> = [];
  for (let i = 0; i < tables.length; i++) {
    if (tables[i].rows.length >= 3) out.push({ group: tables[i].group, row: tables[i].rows[2] });
  }
  out.sort(
    (a, b) =>
      b.row.points - a.row.points ||
      b.row.won - a.row.won ||
      b.row.goalDiff - a.row.goalDiff ||
      b.row.goalsFor - a.row.goalsFor ||
      a.row.team.id.localeCompare(b.row.team.id),
  );
  return out;
}

/** The seeded, ordered list of qualifiers (length = size) once every group is
 * complete; null while still in progress. Thirds are SELECTED by points, but the
 * whole pool is SEEDED by groupAddedAt (then teamId) per the tournament rules.
 * `preview` skips the completeness gate and projects from the CURRENT standings
 * (live scores included) — "as if the groups ended right now". */
function computeQualifiers(
  groups: Group[],
  seedTeams: SeedTeam[],
  matches: Match[],
  size: number,
  preview = false,
): SeedTeam[] | null {
  if (!preview) {
    for (let g = 0; g < groups.length; g++) {
      if (!isGroupComplete(groups[g].id, seedTeams, matches)) return null;
    }
  }

  const tables = computeStandings(groups, seedTeams, matches, { includeLive: preview });
  const seedByTeam = new Map<string, string | null>();
  for (let i = 0; i < seedTeams.length; i++) seedByTeam.set(seedTeams[i].id, seedTeams[i].groupAddedAt);

  const direct: StandingRow[] = [];
  for (let i = 0; i < tables.length; i++) {
    const rows = tables[i].rows;
    if (rows.length >= 1) direct.push(rows[0]);
    if (rows.length >= 2) direct.push(rows[1]);
  }
  const thirds = computeThirdPlaces(tables).map((t) => t.row);

  const directCount = TOURNAMENT_FORMAT.qualifiersPerGroup * groups.length;
  const thirdsNeeded = size - directCount;
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
 * resolve lazily from stored results (no forward writes). A side with a stored
 * override resolves to that team (marked `manual`) instead of its seed, and the
 * override flows downstream through winner/loser refs like any other outcome.
 *
 * `includePreview` (display only — NEVER for write validation): while the
 * groups are unfinished, first-round sides stay symbolic seeds but carry a
 * `projected` team from the current standings. Likewise a winner/loser ref of
 * an UNFINISHED knockout slot carries the team currently leading it (score,
 * then pens); a level game projects nothing. A projected side is not a
 * resolved team, so it can never produce a winner/loser or start a match.
 */
export function resolveBracket(
  groups: Group[],
  seedTeams: SeedTeam[],
  matches: Match[],
  results: Partial<Record<BracketSlotId, BracketResult>>,
  opts?: { includePreview?: boolean },
): BracketView {
  const sizeInfo = computeSize(groups, seedTeams);
  if (!sizeInfo.formable) {
    return { formable: false, reason: sizeInfo.reason, size: sizeInfo.size, matches: [] };
  }
  const size = sizeInfo.size;
  const structure = generateBracket(size);
  const qualifiers = computeQualifiers(groups, seedTeams, matches, size);
  const previewQualifiers =
    qualifiers === null && opts?.includePreview
      ? computeQualifiers(groups, seedTeams, matches, size, true)
      : null;

  const bySlot = new Map<BracketSlotId, { round: Round; home: SeedRef; away: SeedRef }>();
  for (let i = 0; i < structure.length; i++) bySlot.set(structure[i].slot, structure[i]);

  const teamById = new Map<string, Team>();
  for (let i = 0; i < seedTeams.length; i++) teamById.set(seedTeams[i].id, seedTeams[i]);

  const outcomeMemo = new Map<BracketSlotId, { winner: Team; loser: Team } | null>();

  function resolveSeed(seed: SeedRef): BracketParticipant {
    switch (seed.kind) {
      case 'qualifier':
        if (qualifiers) return { team: qualifiers[seed.index] };
        if (previewQualifiers) return { seed, projected: previewQualifiers[seed.index] };
        return { seed };
      case 'winner': {
        const out = slotOutcome(seed.slot);
        if (out) return { team: out.winner };
        const lead = opts?.includePreview ? currentLeader(seed.slot) : null;
        return lead ? { seed, projected: lead.winner } : { seed };
      }
      case 'loser': {
        const out = slotOutcome(seed.slot);
        if (out) return { team: out.loser };
        const lead = opts?.includePreview ? currentLeader(seed.slot) : null;
        return lead ? { seed, projected: lead.loser } : { seed };
      }
    }
  }

  /** Override (if set and the team exists) beats the derived seed. A dangling
   * id falls back to derived — writes guard against creating one, so this is
   * defense-in-depth only, never a state the UI should reach. */
  function resolveSide(slot: BracketSlotId, seed: SeedRef, side: 'home' | 'away'): BracketParticipant {
    const res = results[slot];
    const overrideId = res ? (side === 'home' ? res.homeOverrideId : res.awayOverrideId) : null;
    if (overrideId != null) {
      const team = teamById.get(overrideId);
      if (team) return { team, manual: true };
    }
    return resolveSeed(seed);
  }

  /** Who is ahead on the stored result: score first, then a decisive shootout.
   * Null when level — nothing can be said about the slot yet. */
  function homeWinsBy(res: BracketResult): boolean | null {
    if (res.homeScore > res.awayScore) return true;
    if (res.homeScore < res.awayScore) return false;
    if (res.homePens != null && res.awayPens != null && res.homePens !== res.awayPens) {
      return res.homePens > res.awayPens;
    }
    return null;
  }

  function slotOutcome(slot: BracketSlotId): { winner: Team; loser: Team } | null {
    const cached = outcomeMemo.get(slot);
    if (cached !== undefined) return cached;
    outcomeMemo.set(slot, null); // provisional, also breaks any accidental cycle

    const res = results[slot];
    const fmt = bySlot.get(slot);
    let outcome: { winner: Team; loser: Team } | null = null;
    if (res && res.status === 'finished' && fmt) {
      const home = resolveSide(slot, fmt.home, 'home');
      const away = resolveSide(slot, fmt.away, 'away');
      if ('team' in home && 'team' in away) {
        const homeWins = homeWinsBy(res);
        if (homeWins !== null) {
          outcome = homeWins ? { winner: home.team, loser: away.team } : { winner: away.team, loser: home.team };
        }
      }
    }
    outcomeMemo.set(slot, outcome);
    return outcome;
  }

  /** Preview only: the team currently AHEAD in an unfinished slot (a live game,
   * or one frozen back to scheduled with its score kept). Requires both sides
   * to be real resolved teams — a projected side never chains a projection —
   * and a decisive current result; a level game projects nothing. */
  function currentLeader(slot: BracketSlotId): { winner: Team; loser: Team } | null {
    const res = results[slot];
    const fmt = bySlot.get(slot);
    if (!res || !fmt || res.status === 'finished') return null;
    const home = resolveSide(slot, fmt.home, 'home');
    const away = resolveSide(slot, fmt.away, 'away');
    if (!('team' in home) || !('team' in away)) return null;
    const homeWins = homeWinsBy(res);
    if (homeWins === null) return null;
    return homeWins ? { winner: home.team, loser: away.team } : { winner: away.team, loser: home.team };
  }

  const out: BracketMatch[] = [];
  for (let i = 0; i < structure.length; i++) {
    const s = structure[i];
    const res = results[s.slot] ?? emptyBracketResult();
    out.push({
      slot: s.slot,
      round: s.round,
      home: resolveSide(s.slot, s.home, 'home'),
      away: resolveSide(s.slot, s.away, 'away'),
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

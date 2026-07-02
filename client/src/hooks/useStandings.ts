import { useMemo } from 'react';
import type { GroupTable, Group, Match, Team } from '../../../shared/types';
import { computeStandings } from '../../../shared/tournament';
import { useMatchStore } from '../stores/matchStore';
import { useRosterStore } from '../stores/rosterStore';

/** Signature over the fields standings depend on — EXCLUDES `minute`, so a live
 * clock tick does not trigger a recompute/re-render. */
function matchSignature(byId: Record<string, Match>): string {
  const parts: string[] = [];
  const matches = Object.values(byId);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    parts.push(`${m.id}:${m.status}:${m.homeScore}:${m.awayScore}:${m.group}:${m.home.id}:${m.away.id}`);
  }
  parts.sort();
  return parts.join('|');
}

function rosterSignature(groups: Group[], teams: Team[]): string {
  const g = groups.map((x) => `${x.id}:${x.name}`).join(',');
  const t = teams
    .map((x) => `${x.id}:${x.groupId ?? ''}`)
    .sort()
    .join(',');
  return `${g}||${t}`;
}

/**
 * Group standings derived from the roster (groups + teams) and the live match
 * store. Memoized by a signature so it recomputes only when a result or the
 * roster actually changes.
 */
export function useStandings(): GroupTable[] {
  const byId = useMatchStore((s) => s.byId);
  const groups = useRosterStore((s) => s.groups);
  const teams = useRosterStore((s) => s.teams);
  const sig = `${matchSignature(byId)}##${rosterSignature(groups, teams)}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by `sig` on purpose
  return useMemo(() => computeStandings(groups, teams, Object.values(byId)), [sig]);
}

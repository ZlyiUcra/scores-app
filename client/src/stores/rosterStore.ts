import { create } from 'zustand';
import type { Group, Player, Roster, Team } from '../../../shared/types';

/**
 * Groups + teams (with membership) + players (squads). Server-authoritative,
 * pushed on connect and after any team/group/membership/squad change. Drives
 * client standings, the admin assignment UI and squad views, and supplies
 * human group names for match rows.
 */
interface RosterState {
  groups: Group[];
  teams: Team[];
  players: Player[];
  setRoster: (roster: Roster) => void;
}

export const useRosterStore = create<RosterState>((set) => ({
  groups: [],
  teams: [],
  players: [],
  setRoster: (roster) => set({ groups: roster.groups, teams: roster.teams, players: roster.players }),
}));

export const selectGroups = (s: RosterState) => s.groups;
export const selectTeams = (s: RosterState) => s.teams;
export const selectPlayers = (s: RosterState) => s.players;

/** Display order for a squad: jersey number first (missing numbers last), then name. */
export function bySquadOrder(a: Player, b: Player): number {
  if (a.number !== null && b.number !== null) {
    if (a.number !== b.number) return a.number - b.number;
  } else if (a.number !== null) {
    return -1;
  } else if (b.number !== null) {
    return 1;
  }
  return a.name.localeCompare(b.name);
}

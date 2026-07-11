import type { Group, GroupTable, StandingRow, Team } from '../../../shared/types';
import { computeSize, computeQualificationOrder, TOURNAMENT_FORMAT } from '../../../shared/tournament';
import { useRosterStore } from '../stores/rosterStore';

export type QualificationTiers = {
  /** Highest place that qualifies WHOLESALE (all 1sts, all 2nds, ...). */
  autoRank: number;
  /** The one CONTESTED tier whose teams still fight cross-group for the
   * leftover bracket spots; empty when the bracket size is an exact fit. */
  contested: Array<{ group: Group; row: StandingRow }>;
  contestedSpots: number;
  contestedRank: number | null;
};

/**
 * The bracket holds the largest power of two the team count can fill, and
 * place tiers qualify wholesale until the one CONTESTED tier whose teams
 * still fight for the leftover spots - shared by Overview (live display) and
 * the PDF report (same rule, same output), so the two never drift apart.
 * Pure so the PDF export can run it on fetched data outside React.
 */
export function computeQualificationTiers(groups: Group[], teams: Team[], tables: GroupTable[]): QualificationTiers {
  const sizeInfo = computeSize(groups, teams);

  let contested: QualificationTiers['contested'] = [];
  let contestedSpots = 0;
  let autoRank = 0;
  if (sizeInfo.formable) {
    const order = computeQualificationOrder(tables);
    let remaining = sizeInfo.size;
    for (let rank = 1; rank <= TOURNAMENT_FORMAT.maxPerGroup && remaining > 0; rank++) {
      const tier = order.filter((f) => f.row.rank === rank);
      if (tier.length <= remaining) {
        remaining -= tier.length; // the whole tier is in unconditionally
        autoRank = rank;
        continue;
      }
      contested = tier;
      contestedSpots = remaining;
      break;
    }
  }
  const contestedRank = contested.length > 0 ? contested[0].row.rank : null;

  return { autoRank, contested, contestedSpots, contestedRank };
}

/** Store-subscribed wrapper over computeQualificationTiers for live pages. */
export function useQualificationTiers(tables: GroupTable[]): QualificationTiers {
  const groups = useRosterStore((s) => s.groups);
  const teams = useRosterStore((s) => s.teams);
  return computeQualificationTiers(groups, teams, tables);
}

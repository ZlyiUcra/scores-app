import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { BracketMatch, GroupTable, Match } from '../../../shared/types';
import type { QualificationTiers } from '../hooks/useQualificationTiers';
import { isMatchPlayed, isBracketMatchPlayed, isBracketMatchDecided } from './matchStatus';
import { participantName, ROUND_ORDER } from './bracketLabels';
import { formatKickoff } from './format';
import { loadPdfMake } from './pdfmakeLoad';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export type ReportData = {
  tournamentName: string;
  tables: GroupTable[];
  tiers: QualificationTiers;
  matchesByGroup: Record<string, string[]>;
  matchesById: Record<string, Match>;
  bracketMatches: BracketMatch[];
};

// Same colors as .standings__row--q1 / --q3 (styles.css) - the rank cell text
// echoes the live page's qualification highlight instead of drifting from it.
const accentGreen = '#3fb950';
const accentBlue = '#2f81f7';

function rankCell(rank: number, autoRank: number, contestedRank: number | null): TableCell {
  if (rank <= autoRank) return { text: String(rank), color: accentGreen, bold: true };
  if (rank === contestedRank) return { text: String(rank), color: accentBlue, bold: true };
  return String(rank);
}

const tableLayout = 'lightHorizontalLines';

function sectionBlock(title: string, table: Content): Content {
  return { stack: [{ text: title, style: 'groupTitle' }, table], margin: [0, 0, 0, 10] };
}

function standingsTable(tb: GroupTable, autoRank: number, contestedRank: number | null, t: Translate): Content {
  const header: TableCell[] = [
    '#', t('standings.team'), t('standings.played'), t('standings.won'), t('standings.drawn'),
    t('standings.lost'), t('standings.gf'), t('standings.ga'), t('standings.gd'), t('standings.pts'),
  ];
  const body: TableCell[][] = [header];
  for (const r of tb.rows) {
    body.push([
      rankCell(r.rank, autoRank, contestedRank),
      `${r.team.shortName} ${r.team.name}`,
      String(r.played), String(r.won), String(r.drawn), String(r.lost),
      String(r.goalsFor), String(r.goalsAgainst),
      r.goalDiff > 0 ? `+${r.goalDiff}` : String(r.goalDiff),
      String(r.points),
    ]);
  }
  return sectionBlock(tb.group.name, {
    table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'], body },
    layout: tableLayout,
  });
}

/** Mirrors ThirdPlacesTable.tsx: the one contested tier, rows pre-sorted in
 * qualification order, the first `contestedSpots` highlighted as advancing. */
function thirdPlacesTable(tiers: QualificationTiers, t: Translate): Content | null {
  if (tiers.contested.length === 0) return null;
  const rank = tiers.contested[0].row.rank;
  const header: TableCell[] = [
    '#', t('standings.team'), t('thirds.colGroup'), t('standings.played'),
    t('standings.gf'), t('standings.ga'), t('standings.gd'), t('standings.pts'),
  ];
  const body: TableCell[][] = [header];
  tiers.contested.forEach(({ group, row }, i) => {
    body.push([
      i < tiers.contestedSpots ? { text: String(i + 1), color: accentGreen, bold: true } : String(i + 1),
      `${row.team.shortName} ${row.team.name}`,
      group.name,
      String(row.played), String(row.goalsFor), String(row.goalsAgainst),
      row.goalDiff > 0 ? `+${row.goalDiff}` : String(row.goalDiff),
      String(row.points),
    ]);
  });
  const title = `${t(`thirds.title${rank}`)} - ${t('thirds.note', { n: tiers.contestedSpots })}`;
  return sectionBlock(title, {
    table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'], body },
    layout: tableLayout,
  });
}

function matchRowsTable(header: TableCell[], rows: TableCell[][]): Content {
  return { table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'], body: [header, ...rows] }, layout: tableLayout };
}

function groupMatchesSection(tables: GroupTable[], matchesByGroup: Record<string, string[]>, matchesById: Record<string, Match>, t: Translate): Content {
  const header: TableCell[] = [t('adminMatches.colGame'), t('adminMatches.colSchedule'), t('adminMatches.colScore'), t('adminMatches.colStatus')];
  const blocks: Content[] = [];
  for (const tb of tables) {
    const ids = matchesByGroup[tb.group.id] ?? [];
    if (ids.length === 0) continue;
    const rows: TableCell[][] = ids.map((id) => {
      const m = matchesById[id];
      const played = isMatchPlayed(m);
      return [
        `${m.home.name} - ${m.away.name}`,
        `${m.field ? `${m.field} - ` : ''}${formatKickoff(m.startsAt)}`,
        played ? `${m.homeScore} : ${m.awayScore}` : '-',
        t(`status.${m.status}`),
      ];
    });
    blocks.push(sectionBlock(tb.group.name, matchRowsTable(header, rows)));
  }
  return { stack: blocks };
}

function playoffSection(matches: BracketMatch[], t: Translate): Content {
  const header: TableCell[] = [t('adminMatches.colGame'), t('adminMatches.colSchedule'), t('adminMatches.colScore'), t('adminMatches.colStatus')];
  const blocks: Content[] = [];
  for (const round of ROUND_ORDER) {
    const ms = matches.filter((m) => m.round === round);
    if (ms.length === 0) continue;
    const rows: TableCell[][] = ms.map((m) => {
      const played = isBracketMatchPlayed(m);
      const decided = isBracketMatchDecided(m);
      const score = played ? `${m.homeScore} : ${m.awayScore}${decided ? ` (${m.homePens} : ${m.awayPens})` : ''}` : '-';
      return [
        `${participantName(m.home, t)} - ${participantName(m.away, t)}`,
        m.startsAt ? formatKickoff(m.startsAt) : '',
        score,
        t(`status.${m.status}`),
      ];
    });
    blocks.push(sectionBlock(t(`bracket.${round}`), matchRowsTable(header, rows)));
  }
  return { stack: blocks };
}

/** Pure data -> pdfmake document transformation. No rendering, no DOM - a
 * unit-testable function mirroring the same two sections the app shows on
 * Overview (standings + third places) and Results (group matches, playoff
 * results by round). */
export function buildReportDocDefinition(data: ReportData, t: Translate): TDocumentDefinitions {
  const third = thirdPlacesTable(data.tiers, t);
  const content: Content[] = [
    { text: data.tournamentName, style: 'title' },
    { text: t('overview.groups'), style: 'sectionTitle' },
    ...data.tables.map((tb) => standingsTable(tb, data.tiers.autoRank, data.tiers.contestedRank, t)),
  ];
  if (third) content.push(third);
  content.push(
    { text: t('matchList.title'), style: 'sectionTitle' },
    groupMatchesSection(data.tables, data.matchesByGroup, data.matchesById, t),
  );
  if (data.bracketMatches.length > 0) {
    content.push(
      { text: t('matchList.knockoutTitle'), style: 'sectionTitle', pageBreak: 'before' },
      playoffSection(data.bracketMatches, t),
    );
  }
  return {
    content,
    styles: {
      title: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
      sectionTitle: { fontSize: 14, bold: true, margin: [0, 10, 0, 6] },
      groupTitle: { fontSize: 11, bold: true, margin: [0, 4, 0, 4] },
    },
    defaultStyle: { fontSize: 9 },
  };
}

/** Lazy-loads pdfmake (never in the main bundle) and triggers the browser
 * download. */
export async function downloadTournamentReport(data: ReportData, t: Translate): Promise<void> {
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(buildReportDocDefinition(data, t)).download(`${data.tournamentName}.pdf`);
}

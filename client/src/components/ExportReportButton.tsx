import { useState } from 'react';
import type { GroupTable } from '../../../shared/types';
import type { QualificationTiers } from '../hooks/useQualificationTiers';
import { useMatchStore } from '../stores/matchStore';
import { useBracketStore } from '../stores/bracketStore';
import { useTournament } from '../tournament/TournamentScope';
import { useI18n } from '../i18n';
import { downloadTournamentReport } from '../lib/pdfReport';

/** Downloads a PDF report of the tournament's current/final results - group
 * standings + matches, then playoff results. Reads match/bracket state as a
 * SNAPSHOT (.getState()) at click time rather than subscribing, so this
 * button never re-renders Overview on every goal. */
export function ExportReportButton({ tables, tiers }: { tables: GroupTable[]; tiers: QualificationTiers }) {
  const { t } = useI18n();
  const { tournament } = useTournament();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const { byGroup, byId } = useMatchStore.getState();
      const { view } = useBracketStore.getState();
      await downloadTournamentReport(
        {
          tournamentName: tournament.name,
          tables,
          tiers,
          matchesByGroup: byGroup,
          matchesById: byId,
          bracketMatches: view.matches,
        },
        t,
      );
    } catch (err) {
      console.error('[export] PDF report generation failed:', err);
      setError(t('overview.errorExportPdf'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="export-report">
      <button className="btn btn--sm" disabled={busy} onClick={() => void handleClick()}>
        {busy ? t('overview.exportingPdf') : t('overview.exportPdf')}
      </button>
      {error && <p className="admin__error">{error}</p>}
    </div>
  );
}

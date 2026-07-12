import { useState, type FormEvent } from 'react';
import type { Match, Tournament, TournamentStatus } from '../../../../../shared/types';
import { computeStandings } from '../../../../../shared/tournament';
import { adminApi } from '../../../api/admin';
import { api, ApiError } from '../../../api/client';
import { useTournamentStore } from '../../../stores/tournamentStore';
import { useI18n } from '../../../i18n';
import type { DateRange } from '../../../components/DateRangeField';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';
import { computeQualificationTiers } from '../../../hooks/useQualificationTiers';
import { downloadTournamentReport } from '../../../lib/pdfReport';

const defaultPageSize = 20;

/**
 * All behavior and state for the AdminTournaments panel, kept out of the
 * component so it renders only. Owns the tournament list (from the store), the
 * create form, the single inline-edit form, and the create/update/delete
 * mutations. Tournaments have no socket event, so every write re-fetches the
 * list to keep the selector, the landing redirect and the table truthful.
 */
export function useAdminTournaments() {
  const { t } = useI18n();
  const tournaments = useTournamentStore((s) => s.tournaments);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pagination: the full list is already loaded (no socket event, tournaments
  // rarely number more than a handful), so this just slices it - no server round-trip.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  function setPageSize(value: number) {
    setPage(1);
    setPageSizeState(value);
  }
  const pageStart = (page - 1) * pageSize;
  const pageItems = tournaments.slice(pageStart, pageStart + pageSize);

  // Create form.
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [range, setRange] = useState<DateRange>({ start: null, end: null });
  const [status, setStatus] = useState<TournamentStatus>('upcoming');

  // Inline edit form (one row at a time).
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editRange, setEditRange] = useState<DateRange>({ start: null, end: null });
  const [editStatus, setEditStatus] = useState<TournamentStatus>('upcoming');

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      const { tournaments: list, defaultId } = await api.listTournaments();
      useTournamentStore.getState().setTournaments(list, defaultId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t(fallback));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await adminApi.createTournament({
        name: name.trim(),
        location: location.trim() || null,
        startsAt: range.start,
        endsAt: range.end,
        status,
      });
      setName('');
      setLocation('');
      setRange({ start: null, end: null });
      setStatus('upcoming');
    }, 'adminTournaments.errorCreate');
  }

  function begin(x: Tournament) {
    setEditId(x.id);
    setEditName(x.name);
    setEditLocation(x.location ?? '');
    setEditRange({ start: x.startsAt ?? null, end: x.endsAt ?? null });
    setEditStatus(x.status);
  }

  async function save(id: string) {
    await run(async () => {
      await adminApi.updateTournament(id, {
        name: editName.trim(),
        location: editLocation.trim() || null,
        startsAt: editRange.start,
        endsAt: editRange.end,
        status: editStatus,
      });
      setEditId(null);
    }, 'adminTournaments.errorUpdate');
  }

  async function remove(id: string) {
    await run(() => adminApi.deleteTournament(id), 'adminTournaments.errorDelete');
  }

  // Download a full JSON snapshot of the tournament (manual backup). Standalone
  // (not run(): no list re-fetch, it is a read), and the blob is turned into a
  // client-side download via a transient object URL + anchor click.
  async function exportTournament(id: string) {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await adminApi.exportTournament(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminTournaments.errorExport'));
    } finally {
      setBusy(false);
    }
  }

  // Download a PDF report of the tournament's results. The row may not be the
  // admin-selected tournament, so nothing can come from the live stores: the
  // roster, matches and bracket are fetched one-shot here and standings/tiers
  // are computed with the same pure functions the live pages use.
  async function exportPdf(x: Tournament) {
    setBusy(true);
    setError(null);
    try {
      const [{ roster }, { matches }, { bracket }] = await Promise.all([
        api.getRoster(x.id),
        api.listMatches(x.id),
        api.getBracket(x.id),
      ]);
      const tables = computeStandings(roster.groups, roster.teams, matches, { includeLive: true });
      const tiers = computeQualificationTiers(roster.groups, roster.teams, tables);
      // Same display order as matchStore.derive: kickoff, id as tiebreak.
      const sorted = [...matches].sort((a, b) => {
        const c = a.startsAt.localeCompare(b.startsAt);
        return c !== 0 ? c : a.id.localeCompare(b.id);
      });
      const matchesById: Record<string, Match> = {};
      const matchesByGroup: Record<string, string[]> = {};
      for (const m of sorted) {
        matchesById[m.id] = m;
        (matchesByGroup[m.group] ??= []).push(m.id);
      }
      await downloadTournamentReport(
        { tournamentName: x.name, location: x.location, tables, tiers, matchesByGroup, matchesById, bracketMatches: bracket.matches },
        t,
      );
    } catch (err) {
      console.error('[export] PDF report generation failed:', err);
      setError(err instanceof ApiError ? err.message : t('adminTournaments.errorExportPdf'));
    } finally {
      setBusy(false);
    }
  }

  // Restore a tournament from a picked export file. A cheap client-side JSON
  // sanity check gives a friendlier message before the round trip; the server
  // is the authority and fully re-validates regardless. Always creates a new
  // tournament, so the list needs a re-fetch on success (mirrors `run()`).
  async function importTournament(file: File) {
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      try {
        JSON.parse(text);
      } catch {
        setError(t('adminTournaments.errorImportNotJson'));
        return;
      }
      await adminApi.importTournament(text);
      const { tournaments: list, defaultId } = await api.listTournaments();
      useTournamentStore.getState().setTournaments(list, defaultId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminTournaments.errorImport'));
    } finally {
      setBusy(false);
    }
  }

  // A delete is gated by a confirm modal: the row button only stages the id,
  // and the component renders <ConfirmDialog {...deleteConfirm} /> while one is
  // pending. The actual mutation runs on confirm.
  const { request, dialog: deleteConfirm } = useConfirmDialog();
  function requestDelete(id: string) {
    request({ message: t('common.deleteConfirm'), tone: 'danger', onConfirm: () => { void remove(id); } });
  }

  return {
    tournaments: pageItems,
    total: tournaments.length,
    page,
    pageSize,
    setPage,
    setPageSize,
    busy,
    error,
    create: { name, location, range, status, setName, setLocation, setRange, setStatus, submit },
    edit: {
      activeId: editId,
      name: editName,
      location: editLocation,
      range: editRange,
      status: editStatus,
      setName: setEditName,
      setLocation: setEditLocation,
      setRange: setEditRange,
      setStatus: setEditStatus,
      begin,
      cancel: () => setEditId(null),
      save,
    },
    requestDelete,
    deleteConfirm,
    exportTournament,
    exportPdf,
    importTournament,
  };
}

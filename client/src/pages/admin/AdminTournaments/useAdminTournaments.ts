import { useState, type FormEvent } from 'react';
import type { Tournament, TournamentStatus } from '../../../../../shared/types';
import { adminApi } from '../../../api/admin';
import { api, ApiError } from '../../../api/client';
import { useTournamentStore } from '../../../stores/tournamentStore';
import { useI18n } from '../../../i18n';
import type { DateRange } from '../../../components/DateRangeField';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';

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

  // Create form.
  const [name, setName] = useState('');
  const [range, setRange] = useState<DateRange>({ start: null, end: null });
  const [status, setStatus] = useState<TournamentStatus>('upcoming');

  // Inline edit form (one row at a time).
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
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
      await adminApi.createTournament({ name: name.trim(), startsAt: range.start, endsAt: range.end, status });
      setName('');
      setRange({ start: null, end: null });
      setStatus('upcoming');
    }, 'adminTournaments.errorCreate');
  }

  function begin(x: Tournament) {
    setEditId(x.id);
    setEditName(x.name);
    setEditRange({ start: x.startsAt ?? null, end: x.endsAt ?? null });
    setEditStatus(x.status);
  }

  async function save(id: string) {
    await run(async () => {
      await adminApi.updateTournament(id, {
        name: editName.trim(),
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
    tournaments,
    busy,
    error,
    create: { name, range, status, setName, setRange, setStatus, submit },
    edit: {
      activeId: editId,
      name: editName,
      range: editRange,
      status: editStatus,
      setName: setEditName,
      setRange: setEditRange,
      setStatus: setEditStatus,
      begin,
      cancel: () => setEditId(null),
      save,
    },
    requestDelete,
    deleteConfirm,
    exportTournament,
    importTournament,
  };
}

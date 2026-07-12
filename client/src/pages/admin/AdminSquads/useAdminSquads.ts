import { useMemo, useState, type FormEvent } from 'react';
import type { Player } from '../../../../../shared/types';
import { adminApi } from '../../../api/admin';
import { useRosterStore, selectGroups, selectPlayers, selectTeams, bySquadOrder } from '../../../stores/rosterStore';
import { useI18n } from '../../../i18n';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';
import { useApiErrorMessage } from '../../../hooks/useApiErrorMessage';

/**
 * All behavior and state for the AdminSquads panel, kept out of the component
 * so it renders only. Teams/groups/players come from the live roster store
 * (updated via socket after every mutation), so writes never hand-refetch.
 * Owns the team picker, the add-player form and the single inline edit form.
 */
export function useAdminSquads() {
  const { t } = useI18n();
  const errorMessage = useApiErrorMessage();
  const teams = useRosterStore(selectTeams);
  const groups = useRosterStore(selectGroups);
  const players = useRosterStore(selectPlayers);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [teamId, setTeamId] = useState('');

  // Inline player edit (one row at a time). Declared before selectTeam so the
  // picker can clear it.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editPosition, setEditPosition] = useState('');

  // Picking a team closes any open inline edit.
  function selectTeam(next: string) {
    setTeamId(next);
    setEditId(null);
  }

  // Add-player form.
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState('');

  const squad = useMemo(
    () => players.filter((p) => p.teamId === teamId).sort(bySquadOrder),
    [players, teamId],
  );

  function toNumber(raw: string): number | null {
    const s = raw.trim();
    return s === '' ? null : Number(s);
  }

  function toPosition(raw: string): string | null {
    const s = raw.trim();
    return s === '' ? null : s;
  }

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await adminApi.createPlayer(teamId, {
        name: name.trim(),
        number: toNumber(number),
        position: toPosition(position),
      });
      setName('');
      setNumber('');
      setPosition('');
    }, 'adminSquads.errorCreate');
  }

  function begin(p: Player) {
    setEditId(p.id);
    setEditName(p.name);
    setEditNumber(p.number === null ? '' : String(p.number));
    setEditPosition(p.position ?? '');
  }

  async function save(id: string) {
    await run(async () => {
      await adminApi.updatePlayer(id, {
        name: editName.trim(),
        number: toNumber(editNumber),
        position: toPosition(editPosition),
      });
      setEditId(null);
    }, 'adminSquads.errorUpdate');
  }

  // Delete is gated by a confirm modal: the row button only stages the id, and
  // the component renders <ConfirmDialog {...deleteConfirm} /> while pending.
  const { request, dialog: deleteConfirm } = useConfirmDialog();
  function requestDelete(id: string) {
    request({ message: t('common.deleteConfirm'), tone: 'danger', onConfirm: () => { void run(() => adminApi.deletePlayer(id), 'adminSquads.errorDelete'); } });
  }

  return {
    teams,
    groups,
    busy,
    error,
    teamId,
    selectTeam,
    squad,
    create: { name, number, position, setName, setNumber, setPosition, submit },
    edit: {
      id: editId,
      name: editName,
      number: editNumber,
      position: editPosition,
      setName: setEditName,
      setNumber: setEditNumber,
      setPosition: setEditPosition,
      begin,
      cancel: () => setEditId(null),
      save,
    },
    requestDelete,
    deleteConfirm,
  };
}

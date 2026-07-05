import { useMemo, useState, type FormEvent } from 'react';
import type { Player } from '../../../../shared/types';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import { useRosterStore, selectGroups, selectPlayers, selectTeams, bySquadOrder } from '../../stores/rosterStore';
import { TeamSelect } from '../../components/TeamSelect';
import { useI18n } from '../../i18n';

/** Admin squads panel: pick a team, then add / inline-edit / delete its
 * players. Purely descriptive data — no effect on standings or seeding. */
export function AdminSquads() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Teams + players come from the live roster store (updated via socket after
  // every mutation), so we never hand-refetch.
  const teams = useRosterStore(selectTeams);
  const groups = useRosterStore(selectGroups);
  const players = useRosterStore(selectPlayers);

  const [teamId, setTeamId] = useState('');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState('');
  // Inline player edit.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editPosition, setEditPosition] = useState('');

  const squad = useMemo(
    () => players.filter((p) => p.teamId === teamId).sort(bySquadOrder),
    [players, teamId],
  );

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t(fallback));
    } finally {
      setBusy(false);
    }
  }

  function toNumber(raw: string): number | null {
    const s = raw.trim();
    return s === '' ? null : Number(s);
  }

  function toPosition(raw: string): string | null {
    const s = raw.trim();
    return s === '' ? null : s;
  }

  async function onAddPlayer(e: FormEvent) {
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

  function startEdit(p: Player) {
    setEditId(p.id);
    setEditName(p.name);
    setEditNumber(p.number === null ? '' : String(p.number));
    setEditPosition(p.position ?? '');
  }

  return (
    <div className="admin-panel">
      {error && <p className="admin__error">{error}</p>}

      <section className="card">
        <h3>{t('adminSquads.title')}</h3>
        <label className="field">
          <span>{t('adminSquads.team')}</span>
          <TeamSelect
            teams={teams}
            groups={groups}
            value={teamId}
            onChange={(next) => { setTeamId(next); setEditId(null); }}
            placeholder={t('adminSquads.selectTeam')}
            ungroupedLabel={t('adminSquads.ungrouped')}
            ariaLabel={t('adminSquads.team')}
          />
        </label>
        {!teamId && <p>{t('adminSquads.pickTeam')}</p>}
      </section>

      {teamId && (
        <>
          <section className="card">
            <h3>{t('adminSquads.newPlayer')}</h3>
            <form className="stack" onSubmit={onAddPlayer}>
              <input className="input" placeholder={t('adminSquads.namePlaceholder')} value={name}
                onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={40} />
              <input className="input" type="number" min={1} max={99} placeholder={t('adminSquads.numberPlaceholder')}
                value={number} onChange={(e) => setNumber(e.target.value)} />
              <input className="input" placeholder={t('adminSquads.positionPlaceholder')} value={position}
                onChange={(e) => setPosition(e.target.value)} maxLength={20} />
              <button className="btn btn--primary" disabled={busy} type="submit">{t('adminSquads.addPlayer')}</button>
            </form>
          </section>

          <section className="card">
            <h3>{t('adminSquads.playersTitle')} ({squad.length})</h3>
            {squad.length === 0 ? (
              <p>{t('adminSquads.empty')}</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('adminSquads.colNumber')}</th>
                      <th>{t('adminSquads.colName')}</th>
                      <th>{t('adminSquads.colPosition')}</th>
                      <th className="table__actions">{t('adminSquads.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {squad.map((p) => {
                      const editing = editId === p.id;
                      return (
                        <tr key={p.id}>
                          <td>
                            {editing ? (
                              <input className="input input--num" type="number" min={1} max={99} value={editNumber}
                                onChange={(e) => setEditNumber(e.target.value)} aria-label={t('adminSquads.colNumber')} />
                            ) : (
                              p.number ?? '-'
                            )}
                          </td>
                          <td>
                            {editing ? (
                              <input className="input" value={editName} maxLength={40}
                                onChange={(e) => setEditName(e.target.value)} aria-label={t('adminSquads.colName')} />
                            ) : (
                              p.name
                            )}
                          </td>
                          <td>
                            {editing ? (
                              <input className="input input--short" value={editPosition} maxLength={20}
                                onChange={(e) => setEditPosition(e.target.value)} aria-label={t('adminSquads.colPosition')} />
                            ) : (
                              p.position ?? '-'
                            )}
                          </td>
                          <td className="table__actions">
                            {editing ? (
                              <>
                                <button className="btn btn--sm btn--primary" disabled={busy}
                                  onClick={() => void run(async () => {
                                    await adminApi.updatePlayer(p.id, {
                                      name: editName.trim(),
                                      number: toNumber(editNumber),
                                      position: toPosition(editPosition),
                                    });
                                    setEditId(null);
                                  }, 'adminSquads.errorUpdate')}>{t('adminSquads.save')}</button>
                                <button className="btn btn--sm btn--ghost" onClick={() => setEditId(null)}>{t('adminSquads.cancel')}</button>
                              </>
                            ) : (
                              <>
                                <button className="btn btn--sm" onClick={() => startEdit(p)}>{t('adminSquads.edit')}</button>
                                <button className="btn btn--sm btn--danger" disabled={busy}
                                  onClick={() => void run(() => adminApi.deletePlayer(p.id), 'adminSquads.errorDelete')}>{t('adminSquads.delete')}</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

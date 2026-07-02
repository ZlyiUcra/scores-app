import { useState, type FormEvent } from 'react';
import { TOURNAMENT_FORMAT } from '../../../../shared/tournament';
import { adminApi } from '../../adminApi';
import { ApiError } from '../../api';
import { useMatchStore, selectOrder } from '../../store';
import { useRosterStore, selectGroups, selectTeams } from '../../rosterStore';
import { useI18n } from '../../i18n';

export function AdminMatches() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const order = useMatchStore(selectOrder);
  const byId = useMatchStore((s) => s.byId);
  // Groups + teams come from the live roster store (updated via socket after
  // every mutation), so we never hand-refetch.
  const groups = useRosterStore(selectGroups);
  const teams = useRosterStore(selectTeams);

  const [groupName, setGroupName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamShort, setTeamShort] = useState('');
  // Inline team rename.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editShort, setEditShort] = useState('');
  // Inline group rename.
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [field, setField] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);

  const groupNameById = (id: string | null) => groups.find((g) => g.id === id)?.name ?? '—';
  const countInGroup = (id: string) => teams.filter((tm) => tm.groupId === id).length;

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

  async function onCreateGroup(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await adminApi.createGroup({ name: groupName.trim() });
      setGroupName('');
    }, 'adminMatches.errorCreateGroup');
  }

  async function onCreateTeam(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await adminApi.createTeam({ name: teamName.trim(), shortName: teamShort.trim() });
      setTeamName('');
      setTeamShort('');
    }, 'adminMatches.errorCreateTeam');
  }

  async function onCreateMatch(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const iso = new Date(startsAt).toISOString();
      await adminApi.createMatch({ homeId, awayId, startsAt: iso, field: field.trim() });
      setHomeId('');
      setAwayId('');
      setField('');
      setStartsAt('');
    }, 'adminMatches.errorCreateMatch');
  }

  return (
    <div className="admin-panel">
      {error && <p className="admin__error">{error}</p>}

      <div className="admin-grid">
        <section className="card">
          <h3>{t('adminMatches.groups')}</h3>
          <form className="stack" onSubmit={onCreateGroup}>
            <input className="input" placeholder={t('adminMatches.groupNamePlaceholder')} value={groupName}
              onChange={(e) => setGroupName(e.target.value)} required minLength={2} maxLength={40} />
            <button className="btn btn--primary" disabled={busy} type="submit">{t('adminMatches.addGroup')}</button>
          </form>
          <div className="group-list">
            {groups.map((g) => {
              const editing = editGroupId === g.id;
              return (
                <div className="group-row" key={g.id}>
                  {editing ? (
                    <input className="input" value={editGroupName} maxLength={40}
                      onChange={(e) => setEditGroupName(e.target.value)} aria-label={t('adminMatches.groupNamePlaceholder')} />
                  ) : (
                    <span className="group-row__name">
                      {g.name} <span className="team-chip__group">{countInGroup(g.id)}/{TOURNAMENT_FORMAT.maxPerGroup}</span>
                    </span>
                  )}
                  <div className="group-row__actions">
                    {editing ? (
                      <>
                        <button className="btn btn--sm btn--primary" disabled={busy}
                          onClick={() => void run(async () => {
                            await adminApi.updateGroup(g.id, { name: editGroupName.trim() });
                            setEditGroupId(null);
                          }, 'adminMatches.errorUpdateGroup')}>{t('adminMatches.save')}</button>
                        <button className="btn btn--sm btn--ghost" onClick={() => setEditGroupId(null)}>{t('adminMatches.cancel')}</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn--sm" onClick={() => { setEditGroupId(g.id); setEditGroupName(g.name); }}>{t('adminMatches.edit')}</button>
                        <button className="btn btn--sm btn--danger" title={t('adminMatches.deleteGroupTitle')}
                          onClick={() => void run(() => adminApi.deleteGroup(g.id), 'adminMatches.errorDeleteGroup')}>{t('adminMatches.delete')}</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <h3>{t('adminMatches.newTeam')}</h3>
          <form className="stack" onSubmit={onCreateTeam}>
            <input className="input" placeholder={t('adminMatches.teamNamePlaceholder')} value={teamName}
              onChange={(e) => setTeamName(e.target.value)} required minLength={2} maxLength={40} />
            <input className="input" placeholder={t('adminMatches.teamShortPlaceholder')} value={teamShort}
              onChange={(e) => setTeamShort(e.target.value)} required minLength={2} maxLength={5} />
            <button className="btn btn--primary" disabled={busy} type="submit">{t('adminMatches.addTeam')}</button>
          </form>
        </section>
      </div>

      <section className="card">
        <h3>{t('adminMatches.teamsTitle')} ({teams.length})</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('adminMatches.colTeam')}</th><th>{t('adminMatches.colGroup')}</th><th className="table__actions">{t('adminMatches.colActions')}</th></tr>
            </thead>
            <tbody>
              {teams.map((tm) => {
                const editing = editId === tm.id;
                return (
                  <tr key={tm.id}>
                    <td>
                      {editing ? (
                        <div className="team-edit">
                          <input className="input input--short" value={editShort}
                            onChange={(e) => setEditShort(e.target.value)} maxLength={5} aria-label={t('adminMatches.teamShortPlaceholder')} />
                          <input className="input" value={editName}
                            onChange={(e) => setEditName(e.target.value)} maxLength={40} aria-label={t('adminMatches.teamNamePlaceholder')} />
                        </div>
                      ) : (
                        <span><span className="standings__short">{tm.shortName}</span> {tm.name}</span>
                      )}
                    </td>
                    <td>
                      <select className="input" value={tm.groupId ?? ''}
                        onChange={(e) => void run(() => adminApi.assignTeamGroup(tm.id, { groupId: e.target.value || null }), 'adminMatches.errorAssign')}>
                        <option value="">{t('adminMatches.noGroup')}</option>
                        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </td>
                    <td className="table__actions">
                      {editing ? (
                        <>
                          <button className="btn btn--sm btn--primary" disabled={busy}
                            onClick={() => void run(async () => {
                              await adminApi.updateTeam(tm.id, { name: editName.trim(), shortName: editShort.trim() });
                              setEditId(null);
                            }, 'adminMatches.errorUpdateTeam')}>{t('adminMatches.save')}</button>
                          <button className="btn btn--sm btn--ghost" onClick={() => setEditId(null)}>{t('adminMatches.cancel')}</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn--sm" onClick={() => { setEditId(tm.id); setEditName(tm.name); setEditShort(tm.shortName); }}>{t('adminMatches.edit')}</button>
                          <button className="btn btn--sm btn--danger"
                            onClick={() => void run(() => adminApi.deleteTeam(tm.id), 'adminMatches.errorDeleteTeam')}>{t('adminMatches.delete')}</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>{t('adminMatches.newGame')}</h3>
        <form className="stack admin-grid" onSubmit={onCreateMatch}>
          <label className="field">
            <span>{t('adminMatches.home')}</span>
            <select className="input" value={homeId} onChange={(e) => setHomeId(e.target.value)} required>
              <option value="" disabled>{t('adminMatches.selectTeam')}</option>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name} ({groupNameById(tm.groupId)})</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('adminMatches.away')}</span>
            <select className="input" value={awayId} onChange={(e) => setAwayId(e.target.value)} required>
              <option value="" disabled>{t('adminMatches.selectTeam')}</option>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name} ({groupNameById(tm.groupId)})</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('adminMatches.fieldLabel')}</span>
            <input className="input" value={field} onChange={(e) => setField(e.target.value)}
              placeholder={t('adminMatches.fieldPlaceholder')} maxLength={40} />
          </label>
          <label className="field">
            <span>{t('adminMatches.start')}</span>
            <input className="input" type="datetime-local" value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)} required />
          </label>
          <button className="btn btn--primary" disabled={busy} type="submit">{t('adminMatches.createGame')}</button>
        </form>
      </section>

      <section className="card">
        <h3>{t('adminMatches.matchesTitle')} ({order.length})</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('adminMatches.colGame')}</th><th>{t('adminMatches.colGroup')}</th><th>{t('adminMatches.colScore')}</th><th>{t('adminMatches.colStatus')}</th><th className="table__actions">{t('adminMatches.colActions')}</th></tr>
            </thead>
            <tbody>
              {order.map((id) => {
                const m = byId[id];
                return (
                  <tr key={id}>
                    <td>{m.home.name} — {m.away.name}</td>
                    <td>{groupNameById(m.group)}</td>
                    <td>{m.homeScore}:{m.awayScore}</td>
                    <td>{t(`status.${m.status}`)}</td>
                    <td className="table__actions">
                      <button className="btn btn--sm btn--danger"
                        onClick={() => void run(() => adminApi.deleteMatch(id), 'adminMatches.errorDeleteMatch')}>{t('adminMatches.delete')}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

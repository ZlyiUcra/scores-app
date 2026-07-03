// Aliased: Vite's automatic JSX runtime injects its own top-level `Fragment`
// binding into this module (for `<>...</>`), and a bare `Fragment` import
// collides with it at runtime even though TypeScript is fine with it.
import { Fragment as ReactFragment, useState, type FormEvent } from 'react';
import { TOURNAMENT_FORMAT } from '../../../../shared/tournament';
import { adminApi } from '../../api/admin';
import { api, ApiError } from '../../api/client';
import { formatTime } from '../../lib/format';
import { useMatchStore, selectOrder } from '../../stores/matchStore';
import { useRosterStore, selectGroups, selectTeams } from '../../stores/rosterStore';
import { useI18n } from '../../i18n';
import { useAdminTournament } from './AdminLayout';

/** ISO -> value for <input type="datetime-local"> in the local timezone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Which card of the panel an error belongs to — every failure surfaces
 * inside the section whose data was being manipulated, not page-wide. */
enum PanelSection {
  Groups = 'Groups',
  NewTeam = 'NewTeam',
  Teams = 'Teams',
  NewGame = 'NewGame',
  Matches = 'Matches',
}

/** Admin games panel: groups (create/rename/delete + fixture generation),
 * teams (create/edit/regroup while unplayed), manual game creation and the
 * games table with inline schedule editing. */
export function AdminMatches() {
  const { t } = useI18n();
  const { tournament } = useAdminTournament();
  const [errors, setErrors] = useState<Partial<Record<PanelSection, string>>>({});
  const order = useMatchStore(selectOrder);
  const byId = useMatchStore((s) => s.byId);
  // Groups + teams come from the live roster store (updated via socket after
  // every mutation), so we never hand-refetch.
  const groups = useRosterStore(selectGroups);
  const teams = useRosterStore(selectTeams);

  const [groupName, setGroupName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamShort, setTeamShort] = useState('');
  const [teamGroupId, setTeamGroupId] = useState('');
  // Inline team rename + group reassignment.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editShort, setEditShort] = useState('');
  const [editTeamGroupId, setEditTeamGroupId] = useState('');
  // Inline group rename.
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  // Inline match reschedule (kick-off + court).
  const [editMatchId, setEditMatchId] = useState<string | null>(null);
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editField, setEditField] = useState('');
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [field, setField] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);

  const groupNameById = (id: string | null) => groups.find((g) => g.id === id)?.name ?? '—';
  const countInGroup = (id: string) => teams.filter((tm) => tm.groupId === id).length;

  // Teams table keeps groupmates together: groups in their creation order,
  // unassigned teams last, names alphabetical within a group. Reassigning a
  // team immediately re-slots it under its new group.
  const groupRank = (id: string | null) => {
    if (id === null) return groups.length;
    const i = groups.findIndex((g) => g.id === id);
    return i === -1 ? groups.length : i;
  };
  const sortedTeams = teams
    .slice()
    .sort((a, b) => groupRank(a.groupId) - groupRank(b.groupId) || a.name.localeCompare(b.name));

  // Round-robin pairs of the group not yet covered by any existing match
  // (A-B and B-A are the same fixture) — drives the generate button.
  const missingInGroup = (gid: string) => {
    const ids = teams.filter((tm) => tm.groupId === gid).map((tm) => tm.id);
    let missing = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const covered = order.some((mid) => {
          const m = byId[mid];
          return (
            m.group === gid &&
            ((m.home.id === ids[i] && m.away.id === ids[j]) || (m.home.id === ids[j] && m.away.id === ids[i]))
          );
        });
        if (!covered) missing++;
      }
    }
    return missing;
  };

  // Any group pairing still without a match? Drives both the per-group
  // generate buttons and whether the manual New game form appears at all.
  const totalMissing = groups.reduce((sum, g) => sum + missingInGroup(g.id), 0);

  // A team with scheduled opponents is locked to its group: regrouping it
  // would orphan those fixtures, so the edit form hides the group select.
  const teamHasMatches = (tid: string) =>
    order.some((mid) => byId[mid].home.id === tid || byId[mid].away.id === tid);

  const pairCovered = (gid: string, a: string, b: string) =>
    order.some((mid) => {
      const m = byId[mid];
      return m.group === gid && ((m.home.id === a && m.away.id === b) || (m.home.id === b && m.away.id === a));
    });

  // Groupmates this team has not met yet — the only legal opponents for a new
  // game. A team with none (or no group) cannot be picked at all.
  const openOpponentIds = (tid: string): string[] => {
    const tm = teams.find((x) => x.id === tid);
    if (!tm) return [];
    const gid = tm.groupId;
    if (!gid) return [];
    return teams
      .filter((o) => o.id !== tid && o.groupId === gid && !pairCovered(gid, tid, o.id))
      .map((o) => o.id);
  };

  const homeCandidates = teams.filter((tm) => openOpponentIds(tm.id).length > 0);
  // Once home is picked the away list narrows to its open groupmates.
  const awayCandidates = homeId
    ? teams.filter((tm) => openOpponentIds(homeId).includes(tm.id))
    : homeCandidates;

  // One action runs at a time (single busy flag), so starting a new one may
  // clear every section's stale error.
  async function run(section: PanelSection, fn: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setErrors({});
    try {
      await fn();
    } catch (err) {
      setErrors({ [section]: err instanceof ApiError ? err.message : t(fallback) });
    } finally {
      setBusy(false);
    }
  }

  async function onCreateGroup(e: FormEvent) {
    e.preventDefault();
    await run(PanelSection.Groups, async () => {
      await adminApi.createGroup(tournament.id, { name: groupName.trim() });
      setGroupName('');
    }, 'adminMatches.errorCreateGroup');
  }

  async function onCreateTeam(e: FormEvent) {
    e.preventDefault();
    await run(PanelSection.NewTeam, async () => {
      const { team } = await adminApi.createTeam(tournament.id, { name: teamName.trim(), shortName: teamShort.trim() });
      setTeamName('');
      setTeamShort('');
      // Optional immediate grouping through the regular assign path, so the
      // max-per-group and knockout-lock guards stay in one server-side place.
      // If it fails (e.g. the group is full) the team stays ungrouped and the
      // assign error is shown.
      if (teamGroupId) await adminApi.assignTeamGroup(team.id, { groupId: teamGroupId });
      setTeamGroupId('');
    }, 'adminMatches.errorCreateTeam');
  }

  async function onCreateMatch(e: FormEvent) {
    e.preventDefault();
    await run(PanelSection.NewGame, async () => {
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
      <div className="admin-grid">
        <section className="card">
          <h3>{t('adminMatches.groups')}</h3>
          {errors[PanelSection.Groups] && <p className="admin__error">{errors[PanelSection.Groups]}</p>}
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
                          onClick={() => void run(PanelSection.Groups, async () => {
                            await adminApi.updateGroup(g.id, { name: editGroupName.trim() });
                            setEditGroupId(null);
                          }, 'adminMatches.errorUpdateGroup')}>{t('adminMatches.save')}</button>
                        <button className="btn btn--sm btn--ghost" onClick={() => setEditGroupId(null)}>{t('adminMatches.cancel')}</button>
                      </>
                    ) : (
                      <>
                        {countInGroup(g.id) >= 2 && (
                          <button className="btn btn--sm btn--primary" disabled={busy || missingInGroup(g.id) === 0}
                            title={t('adminMatches.generateTitle')}
                            onClick={() => void run(PanelSection.Groups, () => adminApi.generateFixtures(g.id), 'adminMatches.errorGenerate')}>
                            {t('adminMatches.generate', { n: missingInGroup(g.id) })}
                          </button>
                        )}
                        <button className="btn btn--sm" onClick={() => { setEditGroupId(g.id); setEditGroupName(g.name); }}>{t('adminMatches.edit')}</button>
                        <button className="btn btn--sm btn--danger" title={t('adminMatches.deleteGroupTitle')}
                          onClick={() => void run(PanelSection.Groups, () => adminApi.deleteGroup(g.id), 'adminMatches.errorDeleteGroup')}>{t('adminMatches.delete')}</button>
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
          {errors[PanelSection.NewTeam] && <p className="admin__error">{errors[PanelSection.NewTeam]}</p>}
          <form className="stack" onSubmit={onCreateTeam}>
            <input className="input" placeholder={t('adminMatches.teamNamePlaceholder')} value={teamName}
              onChange={(e) => setTeamName(e.target.value)} required minLength={2} maxLength={40} />
            <input className="input" placeholder={t('adminMatches.teamShortPlaceholder')} value={teamShort}
              onChange={(e) => setTeamShort(e.target.value)} required minLength={2} maxLength={5} />
            <select className="input" value={teamGroupId} aria-label={t('adminMatches.colGroup')}
              onChange={(e) => setTeamGroupId(e.target.value)}>
              <option value="">{t('adminMatches.noGroup')}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button className="btn btn--primary" disabled={busy} type="submit">{t('adminMatches.addTeam')}</button>
          </form>
        </section>
      </div>

      <section className="card">
        <h3>{t('adminMatches.teamsTitle')} ({teams.length})</h3>
        {errors[PanelSection.Teams] && <p className="admin__error">{errors[PanelSection.Teams]}</p>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('adminMatches.colTeam')}</th><th className="table__actions">{t('adminMatches.colActions')}</th></tr>
            </thead>
            <tbody>
              {/* One band per group (unassigned last); the band names the group,
                  so rows carry no group control — membership is set at creation. */}
              {[...groups, null].map((g) => {
                const gid = g === null ? null : g.id;
                const members = sortedTeams.filter((tm) => tm.groupId === gid);
                if (members.length === 0) return null;
                return (
                  <ReactFragment key={gid ?? 'ungrouped'}>
                    <tr className="table__band">
                      <td colSpan={2}>
                        {g === null ? t('adminMatches.noGroup') : g.name}
                        {g !== null && <span className="table__band-count">{members.length}/{TOURNAMENT_FORMAT.maxPerGroup}</span>}
                      </td>
                    </tr>
                    {members.map((tm) => {
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
                                {!teamHasMatches(tm.id) && (
                                  <select className="input" value={editTeamGroupId} aria-label={t('adminMatches.colGroup')}
                                    onChange={(e) => setEditTeamGroupId(e.target.value)}>
                                    <option value="">{t('adminMatches.noGroup')}</option>
                                    {groups.map((gr) => <option key={gr.id} value={gr.id}>{gr.name}</option>)}
                                  </select>
                                )}
                              </div>
                            ) : (
                              <span><span className="standings__short">{tm.shortName}</span> {tm.name}</span>
                            )}
                          </td>
                          <td className="table__actions">
                            {editing ? (
                              <>
                                <button className="btn btn--sm btn--primary" disabled={busy}
                                  onClick={() => void run(PanelSection.Teams, async () => {
                                    await adminApi.updateTeam(tm.id, { name: editName.trim(), shortName: editShort.trim() });
                                    // Reassign through the regular path so the
                                    // max-per-group / knockout-lock guards apply.
                                    if (editTeamGroupId !== (tm.groupId ?? '')) {
                                      await adminApi.assignTeamGroup(tm.id, { groupId: editTeamGroupId || null });
                                    }
                                    setEditId(null);
                                  }, 'adminMatches.errorUpdateTeam')}>{t('adminMatches.save')}</button>
                                <button className="btn btn--sm btn--ghost" onClick={() => setEditId(null)}>{t('adminMatches.cancel')}</button>
                              </>
                            ) : (
                              <>
                                <button className="btn btn--sm" onClick={() => { setEditId(tm.id); setEditName(tm.name); setEditShort(tm.shortName); setEditTeamGroupId(tm.groupId ?? ''); }}>{t('adminMatches.edit')}</button>
                                <button className="btn btn--sm btn--danger"
                                  onClick={() => void run(PanelSection.Teams, () => adminApi.deleteTeam(tm.id), 'adminMatches.errorDeleteTeam')}>{t('adminMatches.delete')}</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </ReactFragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Manual game creation only makes sense while some group pairing still
          lacks a match; with full round-robin coverage the form disappears. */}
      {totalMissing > 0 && (
      <section className="card">
        <h3>{t('adminMatches.newGame')}</h3>
        {errors[PanelSection.NewGame] && <p className="admin__error">{errors[PanelSection.NewGame]}</p>}
        <form className="stack admin-grid" onSubmit={onCreateMatch}>
          <label className="field">
            <span>{t('adminMatches.home')}</span>
            <select className="input" value={homeId} required
              onChange={(e) => {
                const next = e.target.value;
                setHomeId(next);
                // Drop an away pick that is not an open opponent of the new home.
                if (awayId && !openOpponentIds(next).includes(awayId)) setAwayId('');
              }}>
              <option value="" disabled>{t('adminMatches.selectTeam')}</option>
              {homeCandidates.map((tm) => <option key={tm.id} value={tm.id}>{tm.name} ({groupNameById(tm.groupId)})</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('adminMatches.away')}</span>
            <select className="input" value={awayId} onChange={(e) => setAwayId(e.target.value)} required>
              <option value="" disabled>{t('adminMatches.selectTeam')}</option>
              {awayCandidates.map((tm) => <option key={tm.id} value={tm.id}>{tm.name} ({groupNameById(tm.groupId)})</option>)}
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
      )}

      <section className="card">
        <h3>{t('adminMatches.matchesTitle')} ({order.length})</h3>
        {errors[PanelSection.Matches] && <p className="admin__error">{errors[PanelSection.Matches]}</p>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('adminMatches.colGame')}</th><th>{t('adminMatches.colSchedule')}</th><th>{t('adminMatches.colScore')}</th><th>{t('adminMatches.colStatus')}</th><th className="table__actions">{t('adminMatches.colActions')}</th></tr>
            </thead>
            <tbody>
              {/* Same banding as the teams table: one labelled cluster per
                  group, so the GROUP column is gone. */}
              {groups.map((g) => {
                const ids = order.filter((id) => byId[id].group === g.id);
                if (ids.length === 0) return null;
                return (
                  <ReactFragment key={g.id}>
                    <tr className="table__band">
                      <td colSpan={5}>
                        {g.name}
                        <span className="table__band-count">{ids.length}</span>
                      </td>
                    </tr>
                    {ids.map((id) => {
                const m = byId[id];
                const editing = editMatchId === id;
                return (
                  <tr key={id}>
                    {/* Edit mode grows the schedule cell, so the game column
                        shrinks to the short codes to keep the row in bounds. */}
                    <td title={`${m.home.name} — ${m.away.name}`}>
                      {editing ? `${m.home.shortName} — ${m.away.shortName}` : `${m.home.name} — ${m.away.name}`}
                    </td>
                    <td>
                      {editing ? (
                        <div className="team-edit team-edit--stack">
                          <input className="input" value={editField} maxLength={40}
                            onChange={(e) => setEditField(e.target.value)}
                            placeholder={t('adminMatches.fieldPlaceholder')} aria-label={t('adminMatches.fieldLabel')} />
                          <input className="input" type="datetime-local" value={editStartsAt}
                            onChange={(e) => setEditStartsAt(e.target.value)} aria-label={t('adminMatches.start')} />
                        </div>
                      ) : (
                        <span>{m.field ? `${m.field} · ` : ''}{formatTime(m.startsAt)}</span>
                      )}
                    </td>
                    <td>{m.homeScore}:{m.awayScore}</td>
                    <td>
                      <span className={`chip chip--${m.status}`}>{t(`status.${m.status}`)}</span>
                    </td>
                    <td className="table__actions">
                      {editing ? (
                        <>
                          <button className="btn btn--sm btn--primary" disabled={busy || editStartsAt === ''}
                            onClick={() => void run(PanelSection.Matches, async () => {
                              await api.updateMatch(id, {
                                startsAt: new Date(editStartsAt).toISOString(),
                                field: editField.trim(),
                                expectedRev: m.rev,
                              });
                              setEditMatchId(null);
                            }, 'adminMatches.errorUpdateMatch')}>{t('adminMatches.save')}</button>
                          <button className="btn btn--sm btn--ghost" onClick={() => setEditMatchId(null)}>{t('adminMatches.cancel')}</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn--sm"
                            onClick={() => { setEditMatchId(id); setEditStartsAt(toLocalInput(m.startsAt)); setEditField(m.field); }}>{t('adminMatches.edit')}</button>
                          <button className="btn btn--sm btn--danger"
                            onClick={() => void run(PanelSection.Matches, () => adminApi.deleteMatch(id), 'adminMatches.errorDeleteMatch')}>{t('adminMatches.delete')}</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
                    })}
                  </ReactFragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

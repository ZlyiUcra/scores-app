// Aliased: Vite's automatic JSX runtime injects its own top-level `Fragment`
// binding into this module (for `<>...</>`), and a bare `Fragment` import
// collides with it at runtime even though TypeScript is fine with it.
import { Fragment as ReactFragment } from 'react';
import { TOURNAMENT_FORMAT } from '../../../../../shared/tournament';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { actionIcons } from '../../../constants';
import { DateField } from '../../../components/DateField';
import { useDateLabels } from '../../../lib/dateLabels';
import { formatKickoff } from '../../../lib/format';
import { participantName, ROUND_ORDER } from '../../../lib/bracketLabels';
import { useI18n } from '../../../i18n';
import { useAdminMatches, PanelSection } from './useAdminMatches';

/** Wire (ISO) date-time template used across the games panel. */
const DATETIME_FORMAT = 'DD.MM.YYYY HH:mm';

/**
 * Admin games panel UI - all state and mutations live in useAdminMatches.
 * Groups (create/rename/delete + fixture generation), teams (create/edit/
 * regroup while unplayed), manual game creation and the games table with inline
 * schedule editing. Each card is a <details> accordion - the entry forms open
 * by default, the (longer) teams/games tables collapsed.
 */
export function AdminMatches() {
  const { t } = useI18n();
  const dateLabels = useDateLabels();
  const {
    errors,
    busy,
    readOnly,
    groups,
    teams,
    order,
    byId,
    bracket,
    requestResetBracket,
    groupNameById,
    countInGroup,
    sortedTeams,
    missingInGroup,
    totalMissing,
    teamHasMatches,
    homeCandidates,
    awayCandidates,
    groupCreate,
    groupEdit,
    teamCreate,
    teamEdit,
    matchCreate,
    matchEdit,
    bracketEdit,
    confirmDialog,
  } = useAdminMatches();

  return (
    <div className="admin-panel">
      <div className="admin-grid">
        <details className="card" open>
          <summary><h3>{t('adminMatches.groups')}</h3></summary>
          {errors[PanelSection.Groups] && <p className="admin__error">{errors[PanelSection.Groups]}</p>}
          <form className="stack" onSubmit={groupCreate.submit}>
            <input className="input" placeholder={t('adminMatches.groupNamePlaceholder')} value={groupCreate.name}
              onChange={(e) => groupCreate.setName(e.target.value)} required minLength={2} maxLength={40} />
            <button className="btn btn--primary" disabled={busy} type="submit">{t('adminMatches.addGroup')}</button>
          </form>
          <div className="group-list">
            {groups.map((g) => {
              const editing = groupEdit.id === g.id;
              return (
                <div className="group-row" key={g.id}>
                  {editing ? (
                    <input className="input" value={groupEdit.name} maxLength={40}
                      onChange={(e) => groupEdit.setName(e.target.value)} aria-label={t('adminMatches.groupNamePlaceholder')} />
                  ) : (
                    <span className="group-row__name">
                      {g.name} <span className="team-chip__group">{countInGroup(g.id)}/{TOURNAMENT_FORMAT.maxPerGroup}</span>
                    </span>
                  )}
                  <div className="group-row__actions">
                    {editing ? (
                      <>
                        <button className="btn btn--sm btn--primary" disabled={busy} title={t('adminMatches.save')} aria-label={t('adminMatches.save')}
                          onClick={() => groupEdit.save(g.id)}>{actionIcons.save}</button>
                        <button className="btn btn--sm btn--ghost" title={t('adminMatches.cancel')} aria-label={t('adminMatches.cancel')}
                          onClick={groupEdit.cancel}>{actionIcons.cancel}</button>
                      </>
                    ) : (
                      <>
                        {countInGroup(g.id) >= 2 && (
                          <button className="btn btn--sm btn--primary" disabled={busy || missingInGroup(g.id) === 0}
                            title={t('adminMatches.generateTitle')}
                            onClick={() => groupEdit.generate(g.id)}>
                            {t('adminMatches.generate', { n: missingInGroup(g.id) })}
                          </button>
                        )}
                        <button className="btn btn--sm" title={t('adminMatches.edit')} aria-label={t('adminMatches.edit')}
                          onClick={() => groupEdit.begin(g)}>{actionIcons.edit}</button>
                        <button className="btn btn--sm btn--danger" title={t('adminMatches.deleteGroupTitle')} aria-label={t('adminMatches.delete')}
                          onClick={() => groupEdit.remove(g.id)}>{actionIcons.delete}</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>

        <details className="card" open>
          <summary><h3>{t('adminMatches.newTeam')}</h3></summary>
          {errors[PanelSection.NewTeam] && <p className="admin__error">{errors[PanelSection.NewTeam]}</p>}
          <form className="stack" onSubmit={teamCreate.submit}>
            <input className="input" placeholder={t('adminMatches.teamNamePlaceholder')} value={teamCreate.name}
              onChange={(e) => teamCreate.setName(e.target.value)} required minLength={2} maxLength={40} />
            <input className="input" placeholder={t('adminMatches.teamShortPlaceholder')} value={teamCreate.short}
              onChange={(e) => teamCreate.setShort(e.target.value)} required minLength={2} maxLength={5} />
            <select className="input" value={teamCreate.groupId} aria-label={t('adminMatches.colGroup')}
              onChange={(e) => teamCreate.setGroupId(e.target.value)}>
              <option value="">{t('adminMatches.noGroup')}</option>
              {/* A full group (max teams already) is not a valid target - the
                  server rejects it, so keep it out of the picker entirely. */}
              {groups.filter((g) => countInGroup(g.id) < TOURNAMENT_FORMAT.maxPerGroup).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button className="btn btn--primary" disabled={busy} type="submit">{t('adminMatches.addTeam')}</button>
          </form>
        </details>
      </div>

      <details className="card">
        <summary><h3>{t('adminMatches.teamsTitle')} ({teams.length})</h3></summary>
        {errors[PanelSection.Teams] && <p className="admin__error">{errors[PanelSection.Teams]}</p>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('adminMatches.colTeam')}</th><th className="table__actions">{t('adminMatches.colActions')}</th></tr>
            </thead>
            <tbody>
              {/* One band per group (unassigned last); the band names the group,
                  so rows carry no group control - membership is set at creation. */}
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
                      const editing = teamEdit.id === tm.id;
                      return (
                        <tr key={tm.id}>
                          <td>
                            {editing ? (
                              <div className="team-edit">
                                <input className="input input--short" value={teamEdit.short}
                                  onChange={(e) => teamEdit.setShort(e.target.value)} maxLength={5} aria-label={t('adminMatches.teamShortPlaceholder')} />
                                <input className="input" value={teamEdit.name}
                                  onChange={(e) => teamEdit.setName(e.target.value)} maxLength={40} aria-label={t('adminMatches.teamNamePlaceholder')} />
                                {!teamHasMatches(tm.id) && (
                                  <select className="input" value={teamEdit.groupId} aria-label={t('adminMatches.colGroup')}
                                    onChange={(e) => teamEdit.setGroupId(e.target.value)}>
                                    <option value="">{t('adminMatches.noGroup')}</option>
                                    {/* Hide full groups, but always keep this
                                        team's current group (it counts itself, so
                                        it may read as full while still being a
                                        valid no-op target). */}
                                    {groups
                                      .filter((gr) => countInGroup(gr.id) < TOURNAMENT_FORMAT.maxPerGroup || gr.id === tm.groupId)
                                      .map((gr) => <option key={gr.id} value={gr.id}>{gr.name}</option>)}
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
                                <button className="btn btn--sm btn--primary" disabled={busy} title={t('adminMatches.save')} aria-label={t('adminMatches.save')}
                                  onClick={() => teamEdit.save(tm)}>{actionIcons.save}</button>
                                <button className="btn btn--sm btn--ghost" title={t('adminMatches.cancel')} aria-label={t('adminMatches.cancel')}
                                  onClick={teamEdit.cancel}>{actionIcons.cancel}</button>
                              </>
                            ) : (
                              <>
                                <button className="btn btn--sm" title={t('adminMatches.edit')} aria-label={t('adminMatches.edit')}
                                  onClick={() => teamEdit.begin(tm)}>{actionIcons.edit}</button>
                                <button className="btn btn--sm btn--danger" title={t('adminMatches.delete')} aria-label={t('adminMatches.delete')}
                                  onClick={() => teamEdit.remove(tm.id)}>{actionIcons.delete}</button>
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
      </details>

      {/* Manual game creation only makes sense while some group pairing still
          lacks a match; with full round-robin coverage the form disappears. */}
      {totalMissing > 0 && (
      <details className="card" open>
        <summary><h3>{t('adminMatches.newGame')}</h3></summary>
        {errors[PanelSection.NewGame] && <p className="admin__error">{errors[PanelSection.NewGame]}</p>}
        <form className="stack admin-grid" onSubmit={matchCreate.submit}>
          <label className="field">
            <span>{t('adminMatches.home')}</span>
            <select className="input" value={matchCreate.homeId} required
              onChange={(e) => matchCreate.selectHome(e.target.value)}>
              <option value="" disabled>{t('adminMatches.selectTeam')}</option>
              {homeCandidates.map((tm) => <option key={tm.id} value={tm.id}>{tm.name} ({groupNameById(tm.groupId)})</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('adminMatches.away')}</span>
            <select className="input" value={matchCreate.awayId} onChange={(e) => matchCreate.setAwayId(e.target.value)} required>
              <option value="" disabled>{t('adminMatches.selectTeam')}</option>
              {awayCandidates.map((tm) => <option key={tm.id} value={tm.id}>{tm.name} ({groupNameById(tm.groupId)})</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('adminMatches.fieldLabel')}</span>
            <input className="input" value={matchCreate.field} onChange={(e) => matchCreate.setField(e.target.value)}
              placeholder={t('adminMatches.fieldPlaceholder')} maxLength={40} />
          </label>
          <label className="field">
            <span>{t('adminMatches.start')}</span>
            <DateField value={matchCreate.startsAt} onChange={matchCreate.setStartsAt} format={DATETIME_FORMAT} labels={dateLabels}
              required placeholder={t('date.hintTime')} />
          </label>
          <button className="btn btn--primary" disabled={busy} type="submit">{t('adminMatches.createGame')}</button>
        </form>
      </details>
      )}

      <details className="card">
        <summary><h3>{t('adminMatches.matchesTitle')} ({order.length})</h3></summary>
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
                const editing = matchEdit.id === id;
                return (
                  <tr key={id}>
                    {/* Edit mode grows the schedule cell, so the game column
                        shrinks to the short codes to keep the row in bounds. */}
                    <td title={`${m.home.name} - ${m.away.name}`}>
                      {editing ? `${m.home.shortName} - ${m.away.shortName}` : `${m.home.name} - ${m.away.name}`}
                    </td>
                    <td>
                      {editing ? (
                        <div className="team-edit team-edit--stack">
                          <input className="input" value={matchEdit.field} maxLength={40}
                            onChange={(e) => matchEdit.setField(e.target.value)}
                            placeholder={t('adminMatches.fieldPlaceholder')} aria-label={t('adminMatches.fieldLabel')} />
                          <DateField value={matchEdit.startsAt} onChange={matchEdit.setStartsAt} format={DATETIME_FORMAT}
                            labels={dateLabels} placeholder={t('date.hintTime')} ariaLabel={t('adminMatches.start')} />
                        </div>
                      ) : (
                        <span>{m.field ? `${m.field} - ` : ''}{formatKickoff(m.startsAt)}</span>
                      )}
                    </td>
                    <td>{m.homeScore}:{m.awayScore}</td>
                    <td>
                      <span className={`chip chip--${m.status}`}>{t(`status.${m.status}`)}</span>
                    </td>
                    <td className="table__actions">
                      {editing ? (
                        <>
                          <button className="btn btn--sm btn--primary" disabled={busy || !matchEdit.startsAt}
                            title={t('adminMatches.save')} aria-label={t('adminMatches.save')}
                            onClick={() => matchEdit.save(m)}>{actionIcons.save}</button>
                          <button className="btn btn--sm btn--ghost" title={t('adminMatches.cancel')} aria-label={t('adminMatches.cancel')}
                            onClick={matchEdit.cancel}>{actionIcons.cancel}</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn--sm" title={t('adminMatches.edit')} aria-label={t('adminMatches.edit')}
                            onClick={() => matchEdit.begin(m)}>{actionIcons.edit}</button>
                          <button className="btn btn--sm btn--danger" title={t('adminMatches.delete')} aria-label={t('adminMatches.delete')}
                            onClick={() => matchEdit.remove(id)}>{actionIcons.delete}</button>
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
      </details>
      {/* Read-only reference plus one narrow edit: the game name links out to
          the slot's own page (score, pens, overrides - a bracket slot is
          structural, not an independently created/deleted match, so this
          table has no per-row delete). The only editable field here is the
          kick-off time, inline, same mechanics as the games table above.
          Shown once the bracket has formed. */}
      {bracket.matches.length > 0 && (
        <details className="card">
          <summary>
            <h3>{t('adminMatches.bracketMatchesTitle')} ({bracket.matches.length})</h3>
            {!readOnly && (
              <button
                className="card__headerAction btn btn--sm btn--danger"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); requestResetBracket(); }}
              >
                {t('adminBracket.reset')}
              </button>
            )}
          </summary>
          {errors[PanelSection.Bracket] && <p className="admin__error">{errors[PanelSection.Bracket]}</p>}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>{t('adminMatches.colGame')}</th><th>{t('adminMatches.colSchedule')}</th><th>{t('adminMatches.colScore')}</th><th>{t('adminMatches.colStatus')}</th><th className="table__actions">{t('adminMatches.colActions')}</th></tr>
              </thead>
              <tbody>
                {ROUND_ORDER.map((round) => {
                  const matches = bracket.matches.filter((m) => m.round === round);
                  if (matches.length === 0) return null;
                  return (
                    <ReactFragment key={round}>
                      <tr className="table__band">
                        <td colSpan={5}>
                          {t(`bracket.${round}`)}
                          <span className="table__band-count">{matches.length}</span>
                        </td>
                      </tr>
                      {matches.map((m) => {
                        const editing = bracketEdit.slot === m.slot;
                        return (
                          <tr key={m.slot}>
                            <td title={`${participantName(m.home, t)} - ${participantName(m.away, t)}`}>
                              {participantName(m.home, t)} - {participantName(m.away, t)}
                            </td>
                            <td>
                              {editing ? (
                                <DateField value={bracketEdit.startsAt} onChange={bracketEdit.setStartsAt} format={DATETIME_FORMAT}
                                  labels={dateLabels} placeholder={t('date.hintTime')} ariaLabel={t('adminMatches.start')} />
                              ) : (
                                <span>{m.field ? `${m.field} - ` : ''}{m.startsAt ? formatKickoff(m.startsAt) : ''}</span>
                              )}
                            </td>
                            <td>
                              {m.homeScore}:{m.awayScore}
                              {m.homePens != null && m.awayPens != null && ` (${m.homePens}:${m.awayPens})`}
                            </td>
                            <td>
                              <span className={`chip chip--${m.status}`}>{t(`status.${m.status}`)}</span>
                            </td>
                            <td className="table__actions">
                              {editing ? (
                                <>
                                  <button className="btn btn--sm btn--primary" disabled={busy} title={t('adminMatches.save')} aria-label={t('adminMatches.save')}
                                    onClick={() => bracketEdit.save(m)}>{actionIcons.save}</button>
                                  <button className="btn btn--sm btn--ghost" title={t('adminMatches.cancel')} aria-label={t('adminMatches.cancel')}
                                    onClick={bracketEdit.cancel}>{actionIcons.cancel}</button>
                                </>
                              ) : (
                                <button className="btn btn--sm" title={t('adminMatches.edit')} aria-label={t('adminMatches.edit')}
                                  onClick={() => bracketEdit.begin(m)}>{actionIcons.edit}</button>
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
        </details>
      )}

      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </div>
  );
}

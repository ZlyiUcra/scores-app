import { useMemo, useState } from 'react';
import { useRosterStore, selectGroups, selectPlayers, selectTeams, bySquadOrder } from '../stores/rosterStore';
import { TeamSelect } from '../components/TeamSelect';
import { useI18n } from '../i18n';

/** Public read-only squads: pick a team, see who plays in it. */
export function Squads() {
  const { t } = useI18n();
  const teams = useRosterStore(selectTeams);
  const groups = useRosterStore(selectGroups);
  const players = useRosterStore(selectPlayers);
  const [teamId, setTeamId] = useState('');

  const team = teams.find((tm) => tm.id === teamId);
  const groupName = team?.groupId ? groups.find((g) => g.id === team.groupId)?.name : undefined;
  const squad = useMemo(
    () => players.filter((p) => p.teamId === teamId).sort(bySquadOrder),
    [players, teamId],
  );

  return (
    <div className="stack">
      <h2 className="section-title">{t('squads.title')}</h2>
      <TeamSelect
        teams={teams}
        groups={groups}
        value={teamId}
        onChange={setTeamId}
        placeholder={t('squads.selectTeam')}
        ungroupedLabel={t('squads.ungrouped')}
        ariaLabel={t('squads.selectTeam')}
      />

      {!team && <p>{t('squads.pickTeam')}</p>}

      {team && (
        <section className="card">
          <h3>
            <span className="standings__short">{team.shortName}</span> {team.name}
            {groupName ? ` \u00B7 ${groupName}` : ''}
          </h3>
          {squad.length === 0 ? (
            <p>{t('squads.empty')}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('squads.colNumber')}</th>
                    <th>{t('squads.colName')}</th>
                    <th>{t('squads.colPosition')}</th>
                  </tr>
                </thead>
                <tbody>
                  {squad.map((p) => (
                    <tr key={p.id}>
                      <td>{p.number ?? '-'}</td>
                      <td>{p.name}</td>
                      <td>{p.position ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

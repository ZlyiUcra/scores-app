import { useEffect, useState, type FormEvent } from 'react';
import type { Team } from '../../../../shared/types';
import { adminApi } from '../../adminApi';
import { ApiError } from '../../api';
import { useMatchStore, selectOrder } from '../../store';
import { useI18n } from '../../i18n';

export function AdminMatches() {
  const { t } = useI18n();
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const order = useMatchStore(selectOrder);
  const byId = useMatchStore((s) => s.byId);

  // team form
  const [teamName, setTeamName] = useState('');
  const [teamShort, setTeamShort] = useState('');
  // match form
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [group, setGroup] = useState('A');
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadTeams() {
    try {
      const { teams } = await adminApi.listTeams();
      setTeams(teams);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminMatches.errorLoadTeams'));
    }
  }

  useEffect(() => {
    void loadTeams();
  }, []);

  async function onCreateTeam(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.createTeam({ name: teamName.trim(), shortName: teamShort.trim() });
      setTeamName('');
      setTeamShort('');
      await loadTeams();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminMatches.errorCreateTeam'));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateMatch(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // datetime-local -> ISO with timezone (passes server's ISO validation).
      const iso = new Date(startsAt).toISOString();
      await adminApi.createMatch({ homeId, awayId, group: group.trim(), startsAt: iso });
      setHomeId('');
      setAwayId('');
      setStartsAt('');
      // No manual list update needed — the match:created broadcast adds it.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminMatches.errorCreateMatch'));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteMatch(id: string) {
    setError(null);
    try {
      await adminApi.deleteMatch(id);
      // Removal arrives via the match:removed broadcast.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminMatches.errorDeleteMatch'));
    }
  }

  async function onDeleteTeam(id: string) {
    setError(null);
    try {
      await adminApi.deleteTeam(id);
      await loadTeams();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminMatches.errorDeleteTeam'));
    }
  }

  return (
    <div className="admin-panel">
      {error && <p className="admin__error">{error}</p>}

      <div className="admin-grid">
        <section className="card">
          <h3>{t('adminMatches.newTeam')}</h3>
          <form className="stack" onSubmit={onCreateTeam}>
            <input className="input" placeholder={t('adminMatches.teamNamePlaceholder')} value={teamName}
              onChange={(e) => setTeamName(e.target.value)} required minLength={2} maxLength={40} />
            <input className="input" placeholder={t('adminMatches.teamShortPlaceholder')} value={teamShort}
              onChange={(e) => setTeamShort(e.target.value)} required minLength={2} maxLength={5} />
            <button className="btn btn--primary" disabled={busy} type="submit">{t('adminMatches.addTeam')}</button>
          </form>

          <div className="chips">
            {teams.map((team) => (
              <span key={team.id} className="team-chip">
                {team.shortName} · {team.name}
                <button className="team-chip__x" title={t('adminMatches.deleteTeamTitle')} onClick={() => onDeleteTeam(team.id)}>×</button>
              </span>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>{t('adminMatches.newGame')}</h3>
          <form className="stack" onSubmit={onCreateMatch}>
            <label className="field">
              <span>{t('adminMatches.home')}</span>
              <select className="input" value={homeId} onChange={(e) => setHomeId(e.target.value)} required>
                <option value="" disabled>{t('adminMatches.selectTeam')}</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t('adminMatches.away')}</span>
              <select className="input" value={awayId} onChange={(e) => setAwayId(e.target.value)} required>
                <option value="" disabled>{t('adminMatches.selectTeam')}</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t('adminMatches.group')}</span>
              <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} required maxLength={8} />
            </label>
            <label className="field">
              <span>{t('adminMatches.start')}</span>
              <input className="input" type="datetime-local" value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)} required />
            </label>
            <button className="btn btn--primary" disabled={busy} type="submit">{t('adminMatches.createGame')}</button>
          </form>
        </section>
      </div>

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
                    <td>{m.group}</td>
                    <td>{m.homeScore}:{m.awayScore}</td>
                    <td>{m.status}</td>
                    <td className="table__actions">
                      <button className="btn btn--sm btn--danger" onClick={() => onDeleteMatch(id)}>{t('adminMatches.delete')}</button>
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

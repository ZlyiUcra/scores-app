import { useState, type FormEvent } from 'react';
import type { BracketMatch, Match, Team } from '../../../../../shared/types';
import { adminApi } from '../../../api/admin';
import { api, ApiError } from '../../../api/client';
import { selectOrder, useMatchStore } from '../../../stores/matchStore';
import { selectGroups, selectTeams, useRosterStore } from '../../../stores/rosterStore';
import { selectBracket, useBracketStore } from '../../../stores/bracketStore';
import { useI18n } from '../../../i18n';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';
import { useAdminTournament } from '../AdminLayout';

/** Which card of the panel an error belongs to - every failure surfaces inside
 * the section whose data was being manipulated, not page-wide. */
export enum PanelSection {
  Groups = 'Groups',
  NewTeam = 'NewTeam',
  Teams = 'Teams',
  NewGame = 'NewGame',
  Matches = 'Matches',
  Bracket = 'Bracket',
}

/**
 * All behavior and state for the AdminMatches panel, kept out of the component
 * so it renders only. Owns the groups / teams / manual-game create forms, the
 * three inline edits (group rename, team rename+regroup, match reschedule), all
 * round-robin coverage / open-opponent derived data, and the section-scoped
 * mutation runner. Groups+teams+matches come from the live stores (socket-fed),
 * so writes never hand-refetch.
 */
export function useAdminMatches() {
  const { t } = useI18n();
  const { tournament } = useAdminTournament();
  const [errors, setErrors] = useState<Partial<Record<PanelSection, string>>>({});
  const order = useMatchStore(selectOrder);
  const byId = useMatchStore((s) => s.byId);
  const groups = useRosterStore(selectGroups);
  const teams = useRosterStore(selectTeams);
  const bracket = useBracketStore(selectBracket);

  // Group create form.
  const [groupName, setGroupName] = useState('');
  // Team create form.
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
  const [editStartsAt, setEditStartsAt] = useState<string | null>(null);
  const [editField, setEditField] = useState('');
  // Inline playoff-slot reschedule - kick-off time ONLY. Everything else about
  // a slot (score, pens, team overrides) stays on its own /ko/:slot page; this
  // table exists for visual reference plus the one narrow edit.
  const [editSlot, setEditSlot] = useState<string | null>(null);
  const [editSlotStartsAt, setEditSlotStartsAt] = useState<string | null>(null);
  // Manual game creation.
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [field, setField] = useState('');
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groupNameById = (id: string | null) => groups.find((g) => g.id === id)?.name ?? '-';
  const countInGroup = (id: string) => teams.filter((tm) => tm.groupId === id).length;

  // Teams table keeps groupmates together: groups in creation order, unassigned
  // last, names alphabetical within a group.
  const groupRank = (id: string | null) => {
    if (id === null) return groups.length;
    const i = groups.findIndex((g) => g.id === id);
    return i === -1 ? groups.length : i;
  };
  const sortedTeams = teams
    .slice()
    .sort((a, b) => groupRank(a.groupId) - groupRank(b.groupId) || a.name.localeCompare(b.name));

  // Round-robin pairs of a group not yet covered by any existing match
  // (A-B and B-A are the same fixture) - drives the generate button.
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

  // Any group pairing still without a match? Drives both the per-group generate
  // buttons and whether the manual New game form appears at all.
  const totalMissing = groups.reduce((sum, g) => sum + missingInGroup(g.id), 0);

  // A team with scheduled opponents is locked to its group: regrouping it would
  // orphan those fixtures, so the edit form hides the group select.
  const teamHasMatches = (tid: string) =>
    order.some((mid) => byId[mid].home.id === tid || byId[mid].away.id === tid);

  const pairCovered = (gid: string, a: string, b: string) =>
    order.some((mid) => {
      const m = byId[mid];
      return m.group === gid && ((m.home.id === a && m.away.id === b) || (m.home.id === b && m.away.id === a));
    });

  // Groupmates this team has not met yet - the only legal opponents for a new
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

  // One action runs at a time (single busy flag), so starting a new one clears
  // every section's stale error.
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

  async function submitGroup(e: FormEvent) {
    e.preventDefault();
    await run(PanelSection.Groups, async () => {
      await adminApi.createGroup(tournament.id, { name: groupName.trim() });
      setGroupName('');
    }, 'adminMatches.errorCreateGroup');
  }

  async function submitTeam(e: FormEvent) {
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

  async function submitMatch(e: FormEvent) {
    e.preventDefault();
    await run(PanelSection.NewGame, async () => {
      if (!startsAt) throw new ApiError(0, 'INVALID', t('date.invalidTime'));
      await adminApi.createMatch({ homeId, awayId, startsAt, field: field.trim() });
      setHomeId('');
      setAwayId('');
      setField('');
      setStartsAt(null);
    }, 'adminMatches.errorCreateMatch');
  }

  // --- group rename / generate / delete ---
  function beginGroup(g: { id: string; name: string }) {
    setEditGroupId(g.id);
    setEditGroupName(g.name);
  }
  function saveGroup(id: string) {
    void run(PanelSection.Groups, async () => {
      await adminApi.updateGroup(id, { name: editGroupName.trim() });
      setEditGroupId(null);
    }, 'adminMatches.errorUpdateGroup');
  }
  function generateFixtures(gid: string) {
    void run(PanelSection.Groups, () => adminApi.generateFixtures(gid), 'adminMatches.errorGenerate');
  }

  // --- team rename + regroup / delete ---
  function beginTeam(tm: Team) {
    setEditId(tm.id);
    setEditName(tm.name);
    setEditShort(tm.shortName);
    setEditTeamGroupId(tm.groupId ?? '');
  }
  function saveTeam(tm: Team) {
    void run(PanelSection.Teams, async () => {
      await adminApi.updateTeam(tm.id, { name: editName.trim(), shortName: editShort.trim() });
      // Reassign through the regular path so the max-per-group / knockout-lock
      // guards apply.
      if (editTeamGroupId !== (tm.groupId ?? '')) {
        await adminApi.assignTeamGroup(tm.id, { groupId: editTeamGroupId || null });
      }
      setEditId(null);
    }, 'adminMatches.errorUpdateTeam');
  }

  // --- match reschedule / delete ---
  function beginMatch(m: Match) {
    setEditMatchId(m.id);
    setEditStartsAt(m.startsAt);
    setEditField(m.field);
  }
  function saveMatch(m: Match) {
    void run(PanelSection.Matches, async () => {
      if (!editStartsAt) throw new ApiError(0, 'INVALID', t('date.invalidTime'));
      await api.updateMatch(m.id, {
        startsAt: editStartsAt,
        field: editField.trim(),
        expectedRev: m.rev,
      });
      setEditMatchId(null);
    }, 'adminMatches.errorUpdateMatch');
  }

  // --- playoff-slot kick-off time (inline, this table only) ---
  function beginBracketSlot(m: BracketMatch) {
    setEditSlot(m.slot);
    setEditSlotStartsAt(m.startsAt);
  }
  function saveBracketSlot(m: BracketMatch) {
    void run(PanelSection.Bracket, async () => {
      if (editSlotStartsAt !== m.startsAt) {
        await adminApi.updateBracketSlot(tournament.id, m.slot, { startsAt: editSlotStartsAt, expectedRev: m.rev });
      }
      setEditSlot(null);
    }, 'adminBracket.saveError');
  }

  // Picking a home side drops an away pick that is no longer a legal opponent.
  function selectHome(next: string) {
    setHomeId(next);
    if (awayId && !openOpponentIds(next).includes(awayId)) setAwayId('');
  }

  // A delete (or the bracket-wide reset) is gated by a confirm modal: the
  // triggering button only stages the action, and the component renders
  // <ConfirmDialog {...confirmDialog} /> while one is pending. One confirm is
  // active at a time, shared by group/team/match/bracket-reset.
  const { request, dialog: confirmDialog } = useConfirmDialog();
  function requestDeleteGroup(id: string) {
    request({ message: t('common.deleteConfirm'), tone: 'danger', onConfirm: () => { void run(PanelSection.Groups, () => adminApi.deleteGroup(id), 'adminMatches.errorDeleteGroup'); } });
  }
  function requestDeleteTeam(id: string) {
    request({ message: t('common.deleteConfirm'), tone: 'danger', onConfirm: () => { void run(PanelSection.Teams, () => adminApi.deleteTeam(id), 'adminMatches.errorDeleteTeam'); } });
  }
  function requestDeleteMatch(id: string) {
    request({ message: t('common.deleteConfirm'), tone: 'danger', onConfirm: () => { void run(PanelSection.Matches, () => adminApi.deleteMatch(id), 'adminMatches.errorDeleteMatch'); } });
  }
  // The ONE whole-bracket destructive action, mirrored here from the Knockout
  // page as a single table-level entry point (no per-row delete - a slot is
  // structural, not an independently removable match).
  function requestResetBracket() {
    request({ message: t('adminBracket.resetConfirm'), tone: 'danger', onConfirm: () => { void run(PanelSection.Bracket, () => adminApi.resetBracket(tournament.id), 'adminBracket.resetError'); } });
  }

  return {
    errors,
    busy,
    tournamentId: tournament.id,
    readOnly: tournament.status === 'finished',
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
    groupCreate: { name: groupName, setName: setGroupName, submit: submitGroup },
    groupEdit: {
      id: editGroupId,
      name: editGroupName,
      setName: setEditGroupName,
      begin: beginGroup,
      cancel: () => setEditGroupId(null),
      save: saveGroup,
      generate: generateFixtures,
      remove: requestDeleteGroup,
    },
    teamCreate: { name: teamName, short: teamShort, groupId: teamGroupId, setName: setTeamName, setShort: setTeamShort, setGroupId: setTeamGroupId, submit: submitTeam },
    teamEdit: {
      id: editId,
      name: editName,
      short: editShort,
      groupId: editTeamGroupId,
      setName: setEditName,
      setShort: setEditShort,
      setGroupId: setEditTeamGroupId,
      begin: beginTeam,
      cancel: () => setEditId(null),
      save: saveTeam,
      remove: requestDeleteTeam,
    },
    matchCreate: { homeId, awayId, field, startsAt, selectHome, setAwayId, setField, setStartsAt, submit: submitMatch },
    matchEdit: {
      id: editMatchId,
      startsAt: editStartsAt,
      field: editField,
      setStartsAt: setEditStartsAt,
      setField: setEditField,
      begin: beginMatch,
      cancel: () => setEditMatchId(null),
      save: saveMatch,
      remove: requestDeleteMatch,
    },
    bracketEdit: {
      slot: editSlot,
      startsAt: editSlotStartsAt,
      setStartsAt: setEditSlotStartsAt,
      begin: beginBracketSlot,
      cancel: () => setEditSlot(null),
      save: saveBracketSlot,
    },
    confirmDialog,
  };
}

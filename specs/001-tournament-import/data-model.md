# Data Model: Tournament Import

The import feature introduces NO new persistent entities and NO schema changes. Its data model is the existing
`TournamentExport` container (defined in `server/src/services/export.ts`, produced by the shipped export
feature) consumed as untrusted input, plus an in-memory remap table used during materialization.

## Container: TournamentExport (wire format, schemaVersion 1)

| Field | Type | Import validation |
|-------|------|-------------------|
| `schemaVersion` | `1` (literal) | Exactly `exportSchemaVersion` (1); any other value rejected |
| `exportedAt` | ISO datetime string | Shape-checked, otherwise ignored (not persisted) |
| `tournament` | `Tournament` | Name via existing tournament-name validator; dates ISO or null; status enum |
| `groups` | `Group[]` | Group-name validator; ids unique within file |
| `teams` | `SeedTeam[]` | Team-name/shortName validators; `groupId` null or resolvable in-file; `groupAddedAt` ISO or null |
| `players` | `Player[]` | Player-name validator; `teamId` resolvable in-file; `number` 1..99 or null, unique within team; `position` label validator or null |
| `matches` | `StoredMatch[]` | `homeId`/`awayId`/`group` resolvable in-file, `homeId !== awayId`; scores 0..99 int; status enum; `startsAt` ISO; field label validator; `rev` int >= 1 |
| `bracket` | `Partial<Record<BracketSlotId, BracketResult>>` | Keys against `bracketSlotIds()` for the size derived from the file's own groups/teams; values: scores/pens bounds, status enum, override ids null or resolvable in-file; `rev` int >= 1 |

Every object level is `.strict()`: an unknown key anywhere (including a top-level "bonus" collection) rejects
the whole file - for a file container, an unknown key means an unknown format, unlike mutation bodies where
unknown keys are stripped.

The container never carries accounts, password hashes or audit records (guaranteed by the export shape; the
strict schema means it cannot smuggle them in).

## Entities materialized on import (all existing)

- **Tournament** - one new row; server-minted id; name/dates/status from file. `createdAt` semantics: the
  tournament is NEW (created now) - default-tournament resolution stays honest.
- **Group** - N new rows via `groups.createMany`; order preserved from file array.
- **Team (SeedTeam)** - N new rows via `teams.createMany` + group assignment carrying `groupAddedAt` verbatim
  (the server-only seeding key that reproduces bracket seeding order).
- **Player** - N new rows via `players.createMany`.
- **StoredMatch** - N new rows via existing `matches.saveMany`.
- **BracketResult** - per-slot writes via existing `bracket.save`.

## In-memory: the remint map

`Map<oldId, newId>` built as entities are created, applied to all five reference classes:

1. `team.groupId` -> new group id
2. `player.teamId` -> new team id
3. `match.homeId` / `match.awayId` -> new team ids
4. `match.group` -> new group id
5. `bracket[slot].homeOverrideId` / `awayOverrideId` -> new team ids (nullable)

Bracket slot KEYS are symbolic (`R16M0`...), not ids - never remapped.

## Validation rules (pre-write, in order)

1. Body parses as JSON within the 1 MB route limit (parser-level).
2. `tournamentExportSchema` (zod, strict, reused field validators, Eq-pinned to `TournamentExport`).
3. Graph pass: in-file uniqueness of all ids; every reference resolves in-file; `homeId !== awayId`;
   jersey-number uniqueness per team; group size cap; bracket size cap (32) and slot-key validity for the
   derived size.
4. Only after 1-3 pass does the service take the mutation lock and begin writing.

## State transitions

None new. The imported tournament enters the standard `upcoming | active | finished` lifecycle with the
status read from the file; from then on it behaves exactly like a manually created tournament.

## Contract additions (storage seam)

`createMany` on group/team/player repositories - plural mirrors of the existing `matches.saveMany`: same row
shape as their singular `create`, one table each, staged in the Map cache, ONE persist, all-or-nothing
rollback of the staged entries on failure. No cross-repository knowledge.

# Tasks: Tournament Import from an Export File

**Input**: Design documents from `specs/001-tournament-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/import-api.md, quickstart.md

**Tests**: Not requested - the project deliberately parks automated tests (no test runner in devDeps).
Verification is `npm run typecheck` plus the runnable scenarios in quickstart.md.

**Organization**: Tasks are grouped by user story. US1 carries the whole import mechanic; US2/US3 are
status-behaviour verifications on top of it, per the spec's priorities.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Web app: `server/src/`, `client/src/`, `shared/` (see plan.md Project Structure).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: A real fixture to validate against - no scaffolding or dependencies are needed.

- [x] T001 Produce a sample export fixture: with the dev servers running, download
      `GET /api/admin/tournaments/:id/export` for a tournament that has groups, teams, players, played
      matches and bracket results; save it outside the repo (scratchpad) for use in every validation task.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The storage-seam batch methods and the boundary schema that every story's flow runs through.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Add `createMany` signatures for group, team and player repositories to
      `server/src/storage/contracts.ts`, mirroring the existing `matches.saveMany` doc contract (single
      table, one persist, all-or-nothing staging rollback); exact signatures per
      `contracts/import-api.md`.
- [x] T003 [P] Implement `createMany` in `server/src/storage/sqlite/groups.ts` (stage in Map cache, ONE
      persist, rollback staged entries on failure - copy the `saveMany` pattern from
      `server/src/storage/sqlite/matches.ts`).
- [x] T004 [P] Implement `createMany` in `server/src/storage/sqlite/teams.ts`; rows carry
      `groupId`/`groupAddedAt` so import needs no per-team `assign()` follow-up.
- [x] T005 [P] Implement `createMany` in `server/src/storage/sqlite/players.ts`.
- [x] T006 [P] Add `tournamentExportSchema` to `server/src/validation.ts`: `.strict()` at every level,
      REUSE the existing field validators (tournament/team/player names, `scoreField`, status enums,
      `.datetime()`), `schemaVersion` as `z.literal(exportSchemaVersion)` imported from
      `server/src/services/export.ts`, `rev` as `int().min(1)`, bracket record keys as strings (semantic
      slot check lives in the service); pin with an `Eq` drift-guard to `TournamentExport` in the existing
      guard block.

**Checkpoint**: `npm run typecheck` passes; foundation ready - user story implementation can now begin.

## Phase 3: User Story 1 - Restore a tournament from a backup (Priority: P1) - MVP

**Goal**: An admin picks an export file in the admin area and gets a complete, fully fresh tournament -
groups, teams, squads, matches with scores, bracket - with existing data untouched and invalid files
rejected before anything is written.

**Independent Test**: quickstart.md Scenario 1 (round trip), Scenario 3 (rejection paths), Scenario 4
(fresh identity).

### Implementation for User Story 1

- [x] T007 [US1] Create `server/src/services/import.ts`, part 1 - the pre-write graph pass over a
      schema-valid `TournamentExport`: in-file uniqueness of all ids; every reference resolves in-file
      (`team.groupId`, `player.teamId`, `match.homeId/awayId/group`, bracket override ids);
      `homeId !== awayId`; jersey-number uniqueness per team; group size cap; bracket keys against
      `bracketSlotIds()` for the size derived from the file's own groups/teams (reuse
      `shared/tournament.ts`, no second slot enumerator). Violations throw the standard VALIDATION error
      with a specific message.
- [x] T008 [US1] `server/src/services/import.ts`, part 2 - materialization: under ONE `withMutationLock`
      section (parse/zod/graph all happen before the lock), create the tournament (status as-is from the
      file), then `groups.createMany`, `teams.createMany` (with `groupAddedAt` verbatim),
      `players.createMany`, `matches.saveMany`, `bracket.save` per slot - all through the storage
      contracts, remapping every reference through one `Map<oldId, newId>`; write the audit entry (actor,
      resulting tournament id/name, entity counts); on a mid-import write failure, leave the partial
      tournament and rethrow with its id in the message (no cleanup).
- [x] T009 [US1] Create `server/src/routes/admin/import.ts` (`POST /tournaments/import`): route-scoped
      `express.json({ limit: '1mb' })`, dedicated 5/min rate limiter modeled on `exportLimiter` in
      `server/src/routes/admin/export.ts`, standard error envelope, 201 with `{ tournament }`; mount the
      router in `server/src/routes/admin/index.ts`.
- [x] T010 [P] [US1] Add `importTournament(fileText)` to `client/src/api/admin.ts` per
      `contracts/import-api.md` (send the file text as the JSON body unchanged).
- [x] T011 [US1] Add the import mutation to
      `client/src/pages/admin/AdminTournaments/useAdminTournaments.ts`: read the picked file as text,
      cheap client-side JSON sanity check for a friendlier message, call the API, refresh the tournament
      list on success, surface the server error message on failure.
- [x] T012 [US1] Add the Import action (file input + button next to Export) to
      `client/src/pages/admin/AdminTournaments/AdminTournaments.tsx`, following the page's existing
      button/error patterns.
- [x] T013 [US1] Add the new i18n keys (button label, title, progress/error messages) to ALL THREE
      catalogs in the same change: `client/src/i18n/en.json`, `client/src/i18n/ua.json`,
      `client/src/i18n/pt.json`.
- [x] T014 [US1] Validate: `npm run typecheck` in both packages, then quickstart.md Scenario 1 (round
      trip vs the T001 fixture), Scenario 3 rejection paths a-g (each returns the specified status and
      writes nothing), Scenario 4 (same file twice -> two independent tournaments).

**Checkpoint**: US1 fully functional - this is the MVP and the complete backup-restore loop.

## Phase 4: User Story 2 - Bring back an archive for viewing (Priority: P2)

**Goal**: A finished-status file arrives as a browsable read-only archive without disturbing the live
tournament or the default landing view.

**Independent Test**: quickstart.md Scenario 2, step 1.

### Implementation for User Story 2

- [x] T015 [US2] Verify archive behaviour end to end with a live tournament running: import the T001
      fixture edited to `"status": "finished"`; confirm it is browsable in full, rejects edits like any
      finished tournament, and the viewers' default landing tournament is unchanged. Fix any gap found
      within import scope (`server/src/services/import.ts`).

**Checkpoint**: Archives import correctly alongside a live tournament.

## Phase 5: User Story 3 - Move an upcoming tournament between environments (Priority: P3)

**Goal**: An upcoming-status file arrives fully prepared and inert; the documented active-status
default-takeover behaves as designed.

**Independent Test**: quickstart.md Scenario 2, steps 2-3.

### Implementation for User Story 3

- [x] T016 [US3] Complete the status matrix: import the fixture edited to `"status": "upcoming"` (arrives
      prepared, default unchanged) and to `"status": "active"` (becomes the default landing tournament in
      a fresh tab - the documented recovery behaviour). Fix any gap found within import scope
      (`server/src/services/import.ts`).

**Checkpoint**: All three statuses behave per spec FR-008.

## Phase N: Polish & Cross-Cutting Concerns

- [ ] T017 Full pass of quickstart.md Scenario 5: audit viewer shows an entry per import (FR-010); no
      visible viewer freeze during import (SC-005); EN/UA/PT all show translated labels and error
      messages; final `npm run typecheck` in both packages.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - needs only the running app.
- **Foundational (Phase 2)**: T002 blocks T003-T005; T006 independent of T002-T005. Blocks all stories.
- **US1 (Phase 3)**: Depends on Phase 2. T007 -> T008 (same file, sequential); T009 depends on T008; T010
  parallel with server tasks; T011 depends on T010; T012 depends on T011; T013 parallel with T011-T012;
  T014 last.
- **US2 (Phase 4)** and **US3 (Phase 5)**: Depend on US1 complete; independent of each other.
- **Polish**: After all stories.

### User Story Dependencies

- US1 (P1): Foundation only - delivers the entire mechanic.
- US2 (P2): US1 (verification of status behaviour the US1 service already carries).
- US3 (P3): US1 (same; independent of US2).

### Parallel Opportunities

- After T002: `T003 || T004 || T005 || T006` (four different files).
- Within US1: `T010 || T007` (client API vs server service); `T013 || T011/T012` (i18n vs hook/page).
- US2 and US3 verifications can run in either order or together.

## Implementation Strategy

**MVP first**: Phases 1-3 only (T001-T014). US1 alone closes the backup-restore loop - the feature's whole
reason to exist. Stop, validate, demo.

**Incremental delivery**: US2 (T015) and US3 (T016) are cheap verification passes over machinery US1
already shipped; run them next, then Polish (T017). Each checkpoint leaves the app releasable.

# Implementation Plan: Tournament Import from an Export File

**Branch**: `001-tournament-import` | **Date**: 2026-07-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-tournament-import/spec.md`, technical constraints from the
approved consilium decision record at `.specify/consilium/2026-07-09-tournament-import.md`.

## Summary

An admin uploads a previously produced export file (`TournamentExport`, `schemaVersion 1`); the server
validates it fully as untrusted input, then materializes a brand-new tournament (fresh ids throughout) with
all groups, teams, squads, matches and bracket state, without touching any existing data. Technical approach:
one new zod schema pinned to the existing `TournamentExport` type, one new `services/import.ts` writing only
through the storage contracts under the global mutation lock, `createMany` batch mirrors added to three
repositories, and a dedicated admin route with its own body-size limit and rate limiter. UI is one action on
the existing admin Tournaments page.

## Technical Context

**Language/Version**: TypeScript 5.5 on Node >= 22.5 (server), TypeScript + React 18 via Vite 5 (client)

**Primary Dependencies**: express 4.x, zod 3.23, express-rate-limit 7.x (all already installed - no new
dependencies)

**Storage**: node:sqlite (`DatabaseSync`) behind `server/src/storage/contracts.ts`; collections cached in Maps,
persist = full-table rewrite per repository transaction

**Testing**: No test runner (deliberately parked project-wide). Verification = `npm run typecheck` in both
packages + the runnable scenarios in [quickstart.md](quickstart.md)

**Target Platform**: Single self-hosted Node server + browser client

**Project Type**: Web application (server + client packages, shared types)

**Performance Goals**: Import completes in a few seconds end to end; synchronous event-loop hold kept to ~6
batched persists (one per collection) instead of ~230 per-entity rewrites; live viewers see no visible stall

**Constraints**: Route-scoped body limit 1 MB (global 16 KB cap untouched); 5 imports/min rate limit; no
cross-table transaction (deferred to storage Phase C) - failure policy documented instead; import never touches
existing rows

**Scale/Scope**: One instance, tournaments up to 32 teams / ~640 players; real export files weigh ~50-200 KB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Data Preservation | Import only creates; never modifies/deletes existing rows; partial tournament after a mid-import failure REMAINS (no auto-cleanup) and is named in the error | PASS |
| II. Explicit Scope, Smallest Diff | No new dependencies; scope pinned by the consilium record (create-new only, own format only); no adjacent refactors | PASS |
| III. One Source of Truth Behind Seams | Import schema is a zod mirror of the existing `TournamentExport` pinned by an Eq drift-guard (no second wire format); all writes go through `storage/contracts.ts`; `createMany` additions are plural mirrors of existing flat CRUD verbs (same row shape, one table, zero cross-repo logic); domain rules live in `services/import.ts` under the mutation lock | PASS |
| IV. Trust Boundary Discipline | File body validated by zod at the route boundary REUSING the charset field validators from `validation.ts` (anti-stored-XSS); `.strict()` throughout; `requireAdmin` inherited from the admin router mount; single `{ error: { code, message } }` contract; audit entry written | PASS |
| V. Strict Types, ASCII, i18n | No `any`/casts; new i18n keys land in en/ua/pt in the same change; source ASCII | PASS |
| Tech constraints | Global 16 KB body cap NOT raised - the import route defines its own 1 MB parser (constitution names this exact rule); import scoped to one tournament (sync `node:sqlite`) | PASS |
| Workflow gates | Design pre-reviewed (consilium, 5 archetypes + interrogation); typecheck required; feature exercised in the running app via quickstart | PASS |

**Post-design re-check (after Phase 1)**: PASS - no design artifact introduces a violation; Complexity
Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-tournament-import/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── import-api.md    # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
shared/
├── types.ts                          # wire types (unchanged)
└── tournament.ts                     # SeedTeam, BracketResult, bracketSlotIds() (unchanged)

server/src/
├── services/
│   ├── export.ts                     # TournamentExport + exportSchemaVersion (source of the format)
│   └── import.ts                     # NEW: validate-then-write import service
├── routes/admin/
│   ├── export.ts                     # existing mirror (route + limiter pattern)
│   ├── import.ts                     # NEW: POST /tournaments/import, 1mb parser, 5/min limiter
│   └── index.ts                      # + mount adminImportRouter
├── validation.ts                     # + tournamentExportSchema (reuses field validators, Eq-guard)
└── storage/
    ├── contracts.ts                  # + createMany on group/team/player repositories
    └── sqlite/
        ├── groups.ts                 # + createMany (mirror of matches.saveMany staging pattern)
        ├── teams.ts                  # + createMany
        └── players.ts                # + createMany

client/src/
├── api/admin.ts                      # + importTournament()
├── pages/admin/AdminTournaments/
│   ├── AdminTournaments.tsx          # + import button + file input
│   └── useAdminTournaments.ts        # + import state/mutation
└── i18n/{en,ua,pt}.json              # + import keys (all three, same commit)
```

**Structure Decision**: Existing web-application layout (server + client + shared). The feature adds two new
server files and extends six existing ones; no new layers, packages or pages - the UI action joins the
existing admin Tournaments page per the established folder-split.

## Complexity Tracking

No constitution violations - table intentionally empty.

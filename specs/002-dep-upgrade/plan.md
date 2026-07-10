# Implementation Plan: Dependency Upgrade (Security-Driven)

**Branch**: `002-dep-upgrade` | **Date**: 2026-07-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-dep-upgrade/spec.md` plus the consilium handoff
`.specify/consilium/2026-07-10-dep-upgrade.md` (exact versions, GHSA identifiers, smoke checklist,
rollback criteria, deferred backlog).

## Summary

Upgrade exactly four packages plus one manifest field, in two independently confirmed commits, to
close all outstanding npm audit advisories in both workspaces without changing product behavior.
Commit 1 (server hygiene): `cookie` `^0.6.0 -> ^0.7.2` (CVE-2024-47764) and `express-rate-limit`
`^7.4.0 -> ^8` (drops vulnerable `ip` lib, honest IPv6 /56 bucketing). Commit 2 (frontend
toolchain): `vite` `^5.4.2 -> 7.3.6` and `@vitejs/plugin-react` `^4.3.1 -> ^5`, plus root
`engines.node` `>=22.5 -> >=22.12`. Vite 7.3.6 - not 8 - is the deliberate target: it closes all
four dev-server advisories (including the one confirmed active vector, NTLMv2 hash leak via
`/__open-in-editor`, GHSA-v6wh-96g9-6wx3) while keeping the rollup bundler; vite 8 (Rolldown) is
deferred. Verification is a fixed manual smoke checklist in dev and prod-served modes, because the
project deliberately has no test suite.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (unchanged) on Node >= 22.12 (dev machine runs 22.14.0);
client is React 18.3.1 via Vite (5.4.21 -> 7.3.6)

**Primary Dependencies (touched)**: server `cookie` -> ^0.7.2, `express-rate-limit` -> ^8; client
`vite` -> 7.3.6, `@vitejs/plugin-react` -> ^5; root `engines.node` -> >=22.12. Nothing else - no
new packages, all other majors deferred (see research.md R6).

**Storage**: N/A - node:sqlite behind storage/contracts.ts, untouched by this feature

**Testing**: none by deliberate project decision; verification = fixed smoke checklist
(quickstart.md) + typecheck + build in both workspaces

**Target Platform**: single Node instance (Express + Socket.IO) serving a browser SPA; development
happens on Windows (which is why GHSA-v6wh-96g9-6wx3 is the active vector)

**Project Type**: web application - npm workspaces `client/` and `server/` with separate
package.json + package-lock.json, thin root package.json (scripts + engines only)

**Performance Goals**: none new - builds/typechecks are seconds at this scale; explicit non-goal:
no performance claims motivate this feature (consilium: performance archetype)

**Constraints**: zero user-facing behavior change; manifests updated, not only lockfiles;
`client/vite.config.ts` `server.fs` and `host` MUST NOT be widened (stop and investigate instead);
client bundle measured against baseline 350082 B raw / 109070 B gzip; each commit separately
confirmed by the user; rollback of commit 2 = revert (5.4.21 reopens nothing beyond today's state)

**Scale/Scope**: one instance, one local tournament; 2 package.json edits + 1 root field + 2
lockfile regenerations; 0 expected source-code changes (research.md R4/R5 verify why)

## Constitution Check

*GATE: constitution v1.0.1. Evaluated before Phase 0; re-evaluated after Phase 1 design - PASS both.*

- **I. Data Preservation**: PASS. No data path is touched; no migration, no schema change, no
  file deletion. Lockfile regeneration replaces no user data.
- **II. Explicit Scope, Smallest Diff**: PASS. Exactly the four packages + one field approved by
  the consilium; no refactors, no "while I'm here" (nitpicker condition: upgrade is not a license
  to rewrite; the express-4 comment in auth.ts stays as-is because express is NOT upgraded here).
  No new dependencies; version bumps of existing ones were explicitly user-approved 2026-07-10.
- **III. One Source of Truth Behind Seams**: PASS. shared/types.ts, zod pins, storage contracts
  all untouched (zod major is deferred).
- **IV. Trust Boundary Discipline**: PASS with an explicit verify step. The rate-limit major sits
  on the boundary: smoke checklist asserts the 11th login/min still returns 429 and the server
  boots cleanly with `trust proxy: 1`. Cookie parsing path (`auth.ts` socket handshake) is
  API-compatible. The 16KB global body cap and the import route's own 1MB limit are untouched and
  both re-asserted in smoke.
- **V. Strict Types, ASCII Sources, Complete i18n**: PASS. Expected source diff is JSON manifests
  only; no i18n keys, no TS code. If vite 7 typegen forces a client tsconfig/env change, it stays
  ASCII and minimal.
- **Technology and Scale Constraints**: PASS. Runtime floor "Node >= 22.12" (v1.0.1, amended
  2026-07-10 exactly for this feature). Global 16KB body cap preserved.
- **Workflow and Quality Gates**: PASS. Typecheck both workspaces per commit; runtime surface
  exercised via the fixed smoke checklist in dev AND prod-served modes (constitution: "exercised
  in the running app, not merely typechecked").

No violations -> Complexity Tracking intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-dep-upgrade/
├── plan.md              # This file
├── research.md          # Phase 0: version targets, advisory mapping, breaking-change audit
├── quickstart.md        # Phase 1: runnable verification guide (smoke checklist)
├── checklists/
│   └── requirements.md  # Spec quality checklist (done at /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks - NOT created by /speckit-plan)
```

data-model.md is deliberately absent: the feature introduces no entities, no fields, no state
transitions. contracts/ is deliberately absent: no API surface is added or changed; the existing
wire contracts are exactly what the smoke checklist re-asserts.

### Source Code (repository root)

```text
package.json                 # engines.node ">=22.5" -> ">=22.12"        (commit 2)

server/
├── package.json             # cookie ^0.7.2, express-rate-limit ^8      (commit 1)
├── package-lock.json        # regenerated                               (commit 1)
└── src/                     # NO changes expected; verify-only files:
    ├── auth.ts              #   cookie.parse at socket handshake (l.181)
    ├── routes/auth.ts       #   limiters already on v7+ naming (limit/standardHeaders)
    └── index.ts             #   trust proxy: 1 (l.22); body caps (l.24-30)

client/
├── package.json             # vite 7.3.6, @vitejs/plugin-react ^5       (commit 2)
├── package-lock.json        # regenerated                               (commit 2)
└── vite.config.ts           # NO changes expected; server.fs/host must stay as-is
```

**Structure Decision**: existing two-workspace layout, untouched. The whole feature is manifest +
lockfile edits; every listed source file is a verification point, not an edit point.

## Complexity Tracking

No constitution violations - table intentionally empty.

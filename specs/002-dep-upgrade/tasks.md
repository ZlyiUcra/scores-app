# Tasks: Dependency Upgrade (Security-Driven)

**Input**: Design documents from `specs/002-dep-upgrade/` (plan.md, research.md, quickstart.md) plus
the consilium handoff `.specify/consilium/2026-07-10-dep-upgrade.md`.

**Tests**: Not generated - the project deliberately has no test suite (constitution-acknowledged).
Verification is the fixed smoke checklist in quickstart.md; smoke tasks below are mandatory, not
optional.

**Organization**: Grouped by user story. Phase order follows the user-approved delivery sequence
(consilium: commit 1 = server pins, commit 2 = vite toolchain), which puts US2 before US1. This is a
deliberate, documented deviation from strict P1-first ordering: the stories are fully independent
(disjoint workspaces), and the cheap commit was approved to land first.

**Commit rule**: every commit below happens ONLY after explicit user confirmation (project rule).
No pushes, ever.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Preconditions)

**Purpose**: confirm the environment matches the plan's assumptions before touching anything

- [ ] T001 Verify preconditions: `node --version` >= 22.12, `git status` clean, and re-run
      `npm audit` in `server/` and `client/` confirming the baseline findings (server: 1 low;
      client: 1 high + 1 moderate) still match research.md - if the registry moved, stop and
      report before proceeding

---

## Phase 2: Foundational (Blocking Prerequisites)

None. The two stories touch disjoint file sets (`server/` vs `client/` + root `package.json`) and
share no code prerequisite. Phase intentionally empty.

---

## Phase 3: User Story 2 - Server audit hygiene + honest rate limits (Priority: P2) - COMMIT 1

**Goal**: server workspace audits clean; login/register limits hold for IPv6 ranges.

**Independent Test**: `npm audit` in `server/` reports 0 vulnerabilities; 11th login attempt within
a minute returns 429; all existing flows unchanged.

- [ ] T002 [US2] Edit `server/package.json`: `"cookie": "^0.6.0"` -> `"^0.7.2"` and
      `"express-rate-limit": "^7.4.0"` -> `"^8.0.0"`; leave `@types/cookie` at ^0.6.0 (compatible,
      no 0.7 types line exists - research.md R3)
- [ ] T003 [US2] Run `npm install` in `server/` to regenerate `server/package-lock.json`; then
      verify per quickstart.md: `npm ls cookie` shows no 0.6.0 anywhere, `npm audit` reports 0
      vulnerabilities
- [ ] T004 [US2] Run `npm run typecheck` and `npm run build` in `server/`; both must pass with
      zero source-code edits (limiters already use v8-compatible naming - research.md R3)
- [ ] T005 [US2] Runtime smoke per quickstart.md "After commit 1": clean dev boot (no
      express-rate-limit startup warnings with `trust proxy: 1` in `server/src/index.ts:22`),
      11-login test -> attempts 1-10 return 401 and attempt 11 returns 429, then a normal UI
      session (login, one admin mutation, logout)
- [ ] T006 [US2] Report results to the user and request confirmation; after explicit "yes", create
      commit 1 (files: `server/package.json`, `server/package-lock.json`)

**Checkpoint**: server workspace clean and verified; US2 fully delivered.

---

## Phase 4: User Story 1 - Close the active dev-machine vulnerability (Priority: P1) - COMMIT 2

**Goal**: all four dev-server advisories gone, including the live NTLMv2 vector; bundler unchanged;
zero product behavior change.

**Independent Test**: `npm audit` in `client/` reports 0 vulnerabilities; `/__open-in-editor`
returns 404 on the running dev server; full smoke checklist green in dev AND prod-served modes.

- [ ] T007 [P] [US1] Edit `client/package.json`: `"vite": "^5.4.2"` -> `"7.3.6"` (exact - it is
      also the rollback pin) and `"@vitejs/plugin-react": "^4.3.1"` -> `"^5.0.0"` (NOT ^6 - it
      requires vite 8; research.md R2)
- [ ] T008 [P] [US1] Edit root `package.json`: `"engines": { "node": ">=22.5" }` ->
      `">=22.12"` (vite 7 engines requirement; constitution v1.0.1 already authorizes this)
- [ ] T009 [US1] Run `npm install` in `client/` to regenerate `client/package-lock.json`; then
      verify per quickstart.md: `npm audit` reports 0 vulnerabilities and `npm ls launch-editor`
      is empty
- [ ] T010 [US1] Confirm `client/vite.config.ts` requires NO edits (expected per research.md R5)
      and its diff stays empty - in particular `server.fs` and `host`. If the build/dev server
      only works by widening them: STOP, revert working tree, report to the user (hard rule)
- [ ] T011 [US1] Run `npm run typecheck` and `npm run build` in `client/`
- [ ] T012 [US1] Dev-mode smoke per quickstart.md: `npm run dev` at repo root; login, change a
      score in admin, observe live update in a viewer tab (socket through vite proxy); with the
      dev server running, GET `http://localhost:5173/__open-in-editor?file=x` returns 404
- [ ] T013 [US1] Prod-served smoke per quickstart.md: build, start with `NODE_ENV=production` +
      secrets; verify login, live update, deep link serves app shell, `/api/health` returns JSON,
      unknown `/api/*` does NOT return index.html, admin import >16KB succeeds, ~17KB body on an
      ordinary mutation returns 413, export downloads
- [ ] T014 [US1] Measure the built bundle vs baseline per quickstart.md (raw 350082 / gzip 109070
      for `client/dist/assets/index-*.js`); record the delta and weigh any regression before
      keeping the change
- [ ] T015 [US1] Report results (including bundle delta) to the user and request confirmation;
      after explicit "yes", create commit 2 (files: `client/package.json`,
      `client/package-lock.json`, root `package.json`)

**Checkpoint**: both workspaces audit clean; the active vector is dead; US1 delivered.

---

## Phase 5: User Story 3 - Deferred backlog with return triggers (Priority: P3)

**Goal**: every deferred upgrade has a written, concrete return trigger.

**Independent Test**: reading the backlog section, each entry names a trigger (date, EOL
announcement, unpatched CVE, or peer requirement).

- [ ] T016 [US3] Verify the "Свідомо не робимо (backlog з тригерами повернення)" section of
      `.specify/consilium/2026-07-10-dep-upgrade.md` names a concrete trigger for every deferred
      item (vite 8, express 5 incl. December 2026 review date, zod 4, react 19 trio, TypeScript 7,
      bcryptjs 3 / cookie 2.x / @types/node 26); fix any gap found - documentation-only task, no
      code

**Checkpoint**: all three stories delivered.

---

## Phase 6: Polish & Final Validation

- [ ] T017 Run the complete quickstart.md checklist end-to-end once more and confirm every spec
      success criterion: SC-001 (both audits 0), SC-002 (endpoint gone), SC-003 (smoke green in
      both modes), SC-004 (429 window unchanged), SC-005 (bundle delta recorded), SC-006 (no
      behavior change), SC-007 (backlog triggers recorded); report the final summary to the user

---

## Dependencies & Execution Order

- Phase 1 (T001) blocks everything.
- Phase 2 is empty - no foundational work.
- US2 chain: T002 -> T003 -> T004 -> T005 -> T006 (strictly sequential; same workspace).
- US1 chain: T007, T008 in parallel [P] (different files) -> T009 -> T010 -> T011 -> T012 ->
  T013 -> T014 -> T015.
- US1 and US2 are independent (disjoint files) and COULD run in parallel; the approved delivery
  order is US2's commit first. Do not interleave their commits.
- T016 (US3) has no code dependency and can run any time after T001 [P].
- T017 requires T006, T015, T016.

## Parallel Opportunities

- T007 + T008 (different package.json files).
- T016 alongside either story (documentation only).
- Everything else is sequential by nature: single machine, each step feeds the next.

## Implementation Strategy

Single-developer, incremental: T001 -> US2 (T002-T006, commit 1 after user confirmation) ->
US1 (T007-T015, commit 2 after user confirmation) -> T016 -> T017. Stop at any checkpoint; each
commit is independently revertable (`git revert`), and reverting commit 2 reopens nothing beyond
today's already-present advisories (research.md R7 / quickstart rollback note).

MVP note: US1 alone (the P1 story) would already deliver the security value; the approved sequence
simply lands the five-minute US2 commit first.

## Notes

- Zero source-code changes expected across the whole feature; any required source edit outside the
  three manifests + two lockfiles is a signal to stop and report, not to improvise.
- Commits only with explicit per-commit user confirmation; pushing is forbidden.
- Do not touch: `client/vite.config.ts` (esp. `server.fs`, `host`), body-size limits, zod, express,
  react - all out of scope or deferred.

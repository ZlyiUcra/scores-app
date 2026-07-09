<!--
Sync Impact Report
==================
Version change: unversioned template -> 1.0.0
Bump rationale: initial ratification. Every placeholder token replaced with concrete text.

Principles defined (all new):
- I. Data Preservation (NON-NEGOTIABLE)
- II. Explicit Scope, Smallest Diff
- III. One Source of Truth Behind Seams
- IV. Trust Boundary Discipline
- V. Strict Types, ASCII Sources, Complete i18n

Sections added:
- Technology and Scale Constraints (was [SECTION_2_NAME])
- Development Workflow and Quality Gates (was [SECTION_3_NAME])
- Governance (was [GOVERNANCE_RULES])

Sections removed: none.

Template consistency check:
- .specify/templates/plan-template.md - aligned, no change needed. Its "Constitution Check"
  is a runtime slot ("[Gates determined based on constitution file]") filled per feature.
- .specify/templates/spec-template.md - aligned, no change needed. This constitution adds no
  mandatory spec section and forbids no existing one.
- .specify/templates/tasks-template.md - aligned, no change needed. Tests are already marked
  OPTIONAL, which matches the project's deliberate parked-tests stance.
- .specify/templates/checklist-template.md - aligned, no change needed.
- .specify/templates/commands/ - not present in this install; nothing to reconcile.

Deviation from the /speckit-constitution instructions: the report status markers are written in
ASCII words instead of the requested emoji, because CLAUDE.md forbids emoji and mandates ASCII.

Follow-up TODOs:
- TODO(README_DATA_ROW): README.md still describes the data layer as "JSON files behind
  repository interfaces (easy to swap for SQLite)". The active driver is node:sqlite behind
  storage/contracts.ts. Out of scope for this amendment; flagged for a separate docs fix.
-->

# Live Scores Constitution

## Core Principles

### I. Data Preservation (NON-NEGOTIABLE)

Code MUST NOT delete, overwrite, or truncate user data by default. This covers files, records,
logs, caches, and especially diagnostic or recovery artifacts such as error dumps, backups, and
anything retained for inspection.

- Destructive behaviour MUST be explicitly requested and approved as a change of its own. It MUST
  NEVER be introduced as a convenience or a "nice to have".
- Seeding and bootstrap MUST run behind an emptiness guard and MUST leave existing data untouched.
- Import and restore MUST create, never overwrite. The default resolution of a collision is to
  fail loudly, not to replace.

Rationale: the app is the live record of a tournament in progress, and a lost result cannot be
recovered from anywhere else. Destructive code is written once but runs repeatedly, on data its
author never saw.

### II. Explicit Scope, Smallest Diff

A change MUST touch only what was asked for. Refactors, renames, reorganisation, new modules, and
adjacent "while I am here" improvements are out of scope unless explicitly requested.

- Ambiguity MUST be resolved by asking, before code is written. A proposal is the default
  deliverable; implementation follows an explicit go-ahead.
- New dependencies MUST be approved explicitly, naming the package, its purpose, and its
  approximate size. Bundle size counts for anything shipped to the client.
- A broken approach MUST be reverted and retried, never patched with compensating hacks.

Rationale: this is a single-instance, small-scale product. Bloat costs more here than the
abstraction it buys.

### III. One Source of Truth Behind Seams

- `shared/types.ts` is the single wire truth for client and server. Zod schemas at the server
  boundary MUST stay pinned to it with drift guards.
- All data access MUST go through `storage/contracts.ts`. No route and no service may reach around
  the contracts into SQL.
- Domain rules live in services, under the global mutation lock. Drivers are flat CRUD with
  persist-or-rollback and MUST hold no domain logic.
- Two projections of the same data MUST share one projection source. Parallel collectors of the
  same facts are a defect, not a convenience.

Rationale: the contracts are the portability seam. They are the entire reason the storage driver
is replaceable.

### IV. Trust Boundary Discipline

- Every mutation body MUST be validated by zod at the server boundary, with unknown keys stripped.
- Authorization MUST be enforced once at the router level, not per handler. Client-side guards are
  defence in depth only and are never the real boundary.
- Session tokens MUST live in httpOnly cookies under a pinned algorithm. The client MUST never be
  able to read the token.
- Anything crossing the trust boundary - request bodies, uploaded or imported files - MUST be
  treated as untrusted input: identifiers, roles, and size are all validated.
- Errors MUST use the single contract `{ error: { code, message } }`, with codes drawn from
  `AppErrorCode`.

Rationale: admin actions are irreversible in the domain. The boundary is the only place they can
still be stopped.

### V. Strict Types, ASCII Sources, Complete i18n

- Source files MUST be ASCII. Required non-ASCII characters MUST be escaped. The sole exception is
  i18n catalogs and long-form help prose, which are natural-language content.
- TypeScript: prefer `type` over `interface` and `&` over `extends`. Enums are PascalCase and MUST
  NEVER be numeric, and an enum MUST NEVER be treated as an object.
- `any`, `as unknown as`, and `@ts-ignore` are forbidden. `@ts-expect-error <reason>` is permitted
  where satisfying the checker would materially complicate the code.
- Application constants MUST be camelCase and grouped in a single exported object.
- Every i18n key MUST exist in all three catalogs (en, ua, pt).

Rationale: a missing i18n key silently renders the key itself and the type checker does not catch
it. The typing rules exist because the escape hatches they forbid hide exactly the bugs the type
checker was bought to find.

## Technology and Scale Constraints

- Runtime is Node >= 22.5. Client is Vite, React, TypeScript, Zustand, react-router, and
  socket.io-client. Server is Express, Socket.IO, JWT, bcryptjs, and Zod.
- The storage driver is `node:sqlite` (`DatabaseSync`), still flagged experimental on this Node
  line. The contracts seam is the accepted mitigation and a Postgres driver is the escape hatch.
  Migrating to a third-party driver without cause is not warranted.
- `node:sqlite` is synchronous: a long synchronous operation blocks the event loop. Whole-database
  dumps and serialization MUST stay scoped to one tournament rather than the whole database.
- Scale is one instance, one local tournament, small collections. Full-scan reads are acceptable.
  An argument from scale (N+1 over thousands of rows, denial of service, sharding) MUST first show
  that the volume is real rather than hypothetical.
- The shared JSON parser caps request bodies at 16KB. A feature that must accept larger payloads
  MUST define its own limit rather than raising the global one.
- Hot paths use an indexed `for`, not `forEach`.
- Data durability is an open hosting concern - a persistent disk and an explicit data directory -
  and not a code concern. Code MUST NOT pretend to solve it.

## Development Workflow and Quality Gates

- A non-trivial proposal SHOULD be reviewed before it is implemented. A remark only survives review
  if it carries evidence: a mechanism, an attack vector, or a measurement. Taste presented as a
  defect is not a finding.
- Every change MUST pass the type check before it is considered done.
- A change with runtime surface MUST be exercised in the running app, not merely typechecked.
- Destructive actions in the UI MUST route through the shared confirm dialog, never a native
  `confirm`.
- Admin pages follow the folder split: `<Page>/<Page>.tsx` renders, `use<Page>.ts` holds state and
  mutations, `index.ts` re-exports.
- Design documentation stays high-level. It outlines decisions and their boundaries, not
  implementation detail.

## Governance

This constitution supersedes ad-hoc practice. `CLAUDE.md` is its operational companion and MUST NOT
contradict it; where the two diverge, this document wins and `CLAUDE.md` is corrected.

- Every `/speckit-plan` run MUST perform a Constitution Check before Phase 0 research and again
  after Phase 1 design. A violation that survives MUST be recorded in the plan's Complexity
  Tracking table, together with the simpler alternative and the reason it was rejected.
- Amendments require explicit approval, a version bump under the policy below, and an entry in the
  Sync Impact Report at the top of this file.
- Versioning is semantic. MAJOR: a principle is removed or redefined in a backward-incompatible
  way. MINOR: a principle is added, or guidance is materially expanded. PATCH: clarifications,
  wording, and non-semantic refinements.
- Compliance is reviewed at change-review time. Complexity MUST be justified; unjustified
  complexity is a blocking finding.

**Version**: 1.0.0 | **Ratified**: 2026-07-09 | **Last Amended**: 2026-07-09

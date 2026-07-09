# Phase 0 Research: Tournament Import

All unknowns were resolved before planning by a five-archetype design review with cross-examination
(record: `.specify/consilium/2026-07-09-tournament-import.md`). This file consolidates those decisions in the
research format; no open NEEDS CLARIFICATION items remain.

## D1. Validation strategy for the uploaded file

- **Decision**: One zod schema (`tournamentExportSchema`) that REUSES the existing field validators from
  `server/src/validation.ts` (tournament/team/player name charset allowlists, `scoreField` 0..99 int, status
  enums, `.datetime()` checks), is `.strict()` at every level, validates `schemaVersion` as
  `z.literal(exportSchemaVersion)` re-exported from `services/export.ts`, and is pinned to the existing
  `TournamentExport` type with the project's `Eq` drift-guard pattern.
- **Rationale**: The charset allowlists are the project's documented anti-stored-XSS boundary; a structural
  mirror of `shared/types` (plain `z.string()`) would let a hand-crafted "export" carry markup into names that
  render on every client. The Eq-guard prevents the schema and the type from drifting apart silently - the
  exact failure mode the repo already guards against for mutation schemas.
- **Alternatives considered**: Plain structural zod mirror (rejected: reopens the XSS boundary); hand-rolled
  validation without zod (rejected: second validation mechanism, drift-prone); trusting the file because only
  admins upload (rejected: the file is untrusted input regardless of who carries it).

## D2. Referential integrity and identifier handling

- **Decision**: Full pre-write graph validation, then an unconditional remint: every entity gets a fresh
  server-minted uuid via the repositories' own `create*` methods; a single `Map<oldId, newId>` remaps all five
  reference classes - `team.groupId`, `player.teamId`, `match.homeId/awayId`, `match.group`, and
  `homeOverrideId`/`awayOverrideId` inside bracket results. Every reference must resolve INSIDE the file;
  duplicate ids inside the file are an error; bracket keys are validated against `bracketSlotIds()` for the
  bracket size derived from the file's own group setup.
- **Rationale**: File ids must never be trusted as identity - a file can carry the uuid of an EXISTING team
  from another tournament in the same database (exports circulate), which would silently cross-link
  tournaments. Remapping everything makes "import the same file twice = two independent tournaments" hold by
  construction. Bracket overrides are the only stored team reference in the knockout and the easiest one to
  miss.
- **Alternatives considered**: Keep file ids when free, remint only colliding ones (rejected: cross-tournament
  references pass validation and corrupt both tournaments); reject files whose ids collide (rejected: makes
  restoring into the same database impossible - the primary use case).

## D3. `rev` fields from the file

- **Decision**: Carry `rev` verbatim, floored by zod as `z.number().int().min(1)`.
- **Rationale**: Legitimate exports always contain `rev >= 1` (server mints 1 and only increments), so real
  files always pass. A hand-edited `rev: 0` would brick editing from the admin UI - the client always echoes
  `expectedRev` and every mutation schema requires `int().min(1)` - so such files are rejected loudly at the
  boundary instead of being silently "repaired". Server-minted rev was rejected because it degrades round-trip
  fidelity for no gain. (This resolves the one direct conflict the review board produced.)
- **Alternatives considered**: Unbounded verbatim (rejected: rev 0 bricks the admin UI); server-minted reset
  to 1 (rejected: needless loss of fidelity).

## D4. Write path and batching

- **Decision**: New `services/import.ts` is the only writer: parse + zod + graph validation happen BEFORE
  taking the global mutation lock; all writes run under one `withMutationLock` section and go exclusively
  through the storage contracts. Three repositories gain `createMany` (groups, teams, players) as plural
  mirrors of the existing `matches.saveMany` staging pattern (stage in Map, ONE persist, all-or-nothing
  rollback per repository). No driver-level "importGraph" method.
- **Rationale**: Composing per-entity `create()` calls costs ~230 full-table rewrites under a synchronous
  driver (`persist` = DELETE + reinsert whole table); batching brings it to ~6 - one per collection. A
  cross-collection driver method was rejected by the review as domain assembly below the portability seam:
  the concurrency contract explicitly assigns check-then-write invariants to the service layer. The
  performance archetype withdrew the cross-table-transaction demand under interrogation (import is a rare,
  admin-initiated action, not a hot path).
- **Alternatives considered**: Compose existing per-entity creates (rejected: quadratic table rewrites under
  the sync event loop); driver-level single-transaction import (rejected: violates the seam; real
  transactionality arrives with storage Phase C / `withTransaction`, and import inherits it for free because
  all writes already go through the contracts).

## D5. Failure mid-import

- **Decision**: If a write fails after writing began, the partially created tournament REMAINS, the error
  names its id, and nothing is deleted automatically; the admin removes it manually. This limit of the
  guarantee is documented user-facing behaviour (spec FR-011).
- **Rationale**: Constitution principle I forbids destructive behaviour by default - compensating cleanup is
  code that deletes data and runs on inputs its author never saw. The blast radius is inherently isolated:
  the tournament is brand new, existing data is untouched by construction.
- **Alternatives considered**: Automatic rollback deletion (rejected: destructive-by-default, and
  `removeTournament` correctly refuses non-empty tournaments); blocking on Phase C transactions (rejected:
  postpones the whole feature for a rare failure mode that validation-before-write already minimizes).

## D6. Transport, limits and abuse controls

- **Decision**: `POST /api/admin/tournaments/import` with the raw export JSON as the request body
  (`Content-Type: application/json`); a route-scoped `express.json({ limit: '1mb' })`; a dedicated rate
  limiter of 5/min modeled on the existing `exportLimiter`; the global 16 KB body cap stays untouched.
- **Rationale**: Real export files (pretty-printed) weigh ~50-200 KB - the global cap would 413 them before
  validation, and raising it globally would let every endpoint (including unauthenticated auth routes) accept
  megabyte bodies. The constitution codifies exactly this: a feature needing larger payloads defines its own
  limit. Multipart upload was rejected as a new parsing dependency for zero benefit - the client can read the
  file and send its text.
- **Alternatives considered**: Multipart/form-data (rejected: needs a new dependency, no benefit at 1 MB);
  raising the global JSON limit (rejected: constitution violation, widens attack surface).

## D7. Imported tournament status

- **Decision**: Status is imported as-is from the file. Documented side effect: an imported `active`
  tournament becomes the default landing tournament (default = most recently created active one) - which is
  the desired outcome in the disaster-recovery scenario. `finished` and `upcoming` imports cannot steal the
  default.
- **Rationale**: The file's status IS the tournament's actual state: archives arrive viewable, upcoming ones
  arrive prepared, restored live ones go straight back on air. User decision recorded in the consilium file.
- **Alternatives considered**: Forcing `upcoming` (rejected by the user: adds a manual activation step to the
  most urgent scenario - recovery); asking per import (rejected: UI complexity for a rare edge).

## D8. Audit and UI placement

- **Decision**: Import writes an audit entry (who, when, resulting tournament id/name, entity counts) via the
  existing audit pattern; the UI is a file-pick action next to Export on the existing admin Tournaments page,
  extending `AdminTournaments.tsx`/`useAdminTournaments.ts` per the folder-split convention; new i18n keys
  land in en/ua/pt in the same change.
- **Rationale**: Import is the largest single mutation in the system - forensics requires a trail (export is
  audit-free deliberately because it is a pure read; import is not). Placing the action on the existing page
  follows "no new pages/layers for one action".
- **Alternatives considered**: A dedicated import page (rejected: bloat for a single action).

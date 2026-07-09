# Feature Specification: Tournament Import from an Export File

**Feature Branch**: `001-tournament-import`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Admin tournament import from a JSON export file. An administrator can restore or
transfer a tournament from a previously downloaded export file. Uploading the file in the admin area creates a
brand-new tournament with all of its contents - groups, teams, player squads, the match schedule with results,
and the knockout bracket state - exactly as they were at export time. Existing data is never modified or
overwritten. An invalid, corrupted, or unfamiliar file is loudly rejected and nothing enters the system. The
tournament arrives with the status it had in the file. Full board decision context:
.specify/consilium/2026-07-09-tournament-import.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restore a tournament from a backup (Priority: P1)

The database was lost or damaged mid-season. The administrator has a previously downloaded export file of the
tournament. They open the admin area, pick the file, and the tournament reappears in full - groups, teams,
squads, every played and scheduled match with its score, and the knockout bracket - ready for viewers again.

**Why this priority**: This is the disaster-recovery half of the backup loop. Export (already shipped) produces
backup files; without import those files cannot actually save a tournament. This is the core value of the
feature.

**Independent Test**: Export an existing tournament, wipe or switch to an empty environment, import the file,
and compare what viewers see against the original.

**Acceptance Scenarios**:

1. **Given** a valid export file of a tournament, **When** the admin imports it, **Then** a new tournament
   appears containing the same groups, teams, players, match schedule, scores, and bracket state as the
   original at export time.
2. **Given** the imported tournament was active in the file, **When** the import completes, **Then** viewers
   without an explicitly chosen tournament land on it and see its live tables.
3. **Given** an import just completed, **When** the admin exports the new tournament, **Then** the produced
   file describes the same tournament content as the file that was imported.

---

### User Story 2 - Bring back an archive for viewing (Priority: P2)

A past tournament was archived as an export file and later removed from the system. Someone wants to look up
its results. The administrator imports the file; the tournament appears as a finished, read-only archive with
its final tables, results, and bracket, without disturbing anything currently running.

**Why this priority**: Archives are the second most likely use of stored export files. It requires nothing
beyond Story 1 except respecting the finished status from the file.

**Independent Test**: Import a file whose tournament is finished while another tournament is live; verify the
archive is browsable and the live tournament remains the default view.

**Acceptance Scenarios**:

1. **Given** an export file of a finished tournament, **When** the admin imports it, **Then** the tournament
   appears with finished status, is viewable in full, and rejects edits like any other finished tournament.
2. **Given** a live tournament is in progress, **When** a finished archive is imported, **Then** viewers'
   default landing tournament does not change.

---

### User Story 3 - Move an upcoming tournament between environments (Priority: P3)

A tournament was fully prepared (groups, teams, squads, schedule) on one instance and needs to run on another.
The administrator exports it there and imports it here; it arrives as an upcoming tournament, ready to be
activated when play starts.

**Why this priority**: Convenience scenario on top of the same mechanics; valuable but rarer than recovery and
archiving.

**Independent Test**: Import a file whose tournament is upcoming; verify it appears as upcoming, fully
prepared, and does not affect the current default view.

**Acceptance Scenarios**:

1. **Given** an export file of an upcoming tournament, **When** the admin imports it, **Then** the tournament
   appears with upcoming status and its full setup intact.

---

### Edge Cases

- File is not valid JSON, is truncated, or is not an export file at all: rejected with a clear message,
  nothing is created.
- File declares an unfamiliar format version: rejected with a clear message naming the version problem.
- File is internally inconsistent (a match refers to a team that is not in the file, a squad entry refers to a
  missing team, duplicated identifiers inside the file, bracket entries for slots that cannot exist for the
  group setup): rejected before anything is written.
- File content violates the product's content rules (names outside the allowed character rules, group larger
  than the allowed cap, more teams than the bracket supports, duplicate jersey numbers within a team): rejected
  the same way manual entry would be.
- File exceeds the size limit, or imports are attempted too frequently: rejected with a clear message.
- The same file is imported twice: two independent tournaments appear; the second import does not touch the
  first. Duplicate tournament names are acceptable; the admin can rename.
- A write failure occurs mid-import (for example a storage error): the partially created tournament remains,
  the error identifies it by name/id, and nothing else in the system is affected. It is never deleted
  automatically; the admin removes it manually.
- An active-status backup is imported while another tournament is live: the imported tournament becomes the
  default landing tournament for viewers who have not chosen one. This is intended for the recovery scenario
  and is a documented effect; the admin can change either tournament's status to adjust.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Administrators MUST be able to import a tournament from a previously produced export file via
  the admin area. Viewers MUST NOT be able to import.
- **FR-002**: An import MUST always create a new tournament. No existing tournament, team, player, match,
  bracket entry, or account may be modified, replaced, or deleted by an import, whether it succeeds or fails.
- **FR-003**: The imported tournament MUST contain the full content of the file: tournament name, planned
  dates and status, groups, teams with their group placement and seeding order, player squads (names, jersey
  numbers, positions), the match schedule with kick-off times, courts, scores, penalty outcomes and match
  statuses, and the knockout bracket state including manual team assignments.
- **FR-004**: The system MUST fully validate the file before writing anything. A file that fails validation
  MUST be rejected with a clear, specific error message, and the system state MUST remain exactly as before
  the attempt.
- **FR-005**: The system MUST accept only the export format version it knows. A file declaring any other
  version MUST be rejected with a message naming the version mismatch.
- **FR-006**: Imported content MUST satisfy every content rule that applies to manually entered data - naming
  character rules, group size caps, bracket size caps, uniqueness of jersey numbers within a team, and
  internal consistency of all references inside the file.
- **FR-007**: Imported records MUST receive fresh identities. Identifiers found in the file MUST never be
  reused or linked to existing records; importing the same file twice MUST yield two fully independent
  tournaments.
- **FR-008**: The imported tournament MUST keep the status recorded in the file (upcoming, active, or
  finished). The effect that an imported active tournament becomes the default landing view MUST be
  documented user-facing behaviour.
- **FR-009**: The system MUST enforce an upload size limit of 1 MB and a frequency limit of 5 imports per
  minute, rejecting attempts beyond either limit with a clear message.
- **FR-010**: Every import - successful or failed after writing began - MUST leave an audit trail entry
  recording who imported, when, and what tournament resulted.
- **FR-011**: If writing fails mid-import, the partially created tournament MUST remain in the system, MUST
  be identified in the error message, and MUST NOT be deleted automatically.
- **FR-012**: Once imported, the tournament MUST behave like any other tournament: it appears in the
  tournament list, supports live score entry (subject to its status), can be exported, edited, and deleted
  under the same rules as tournaments created manually.

### Key Entities

- **Export file**: A self-contained snapshot produced by the existing export feature. Carries a format version
  marker and one tournament: its descriptive details and status, groups, teams (with group placement and
  seeding order), player squads, matches with results, and knockout bracket state. Never contains user
  accounts or credentials.
- **Imported tournament**: A brand-new tournament materialized from an export file, indistinguishable in
  behaviour from a manually created one, with no links to the file's original identifiers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can restore a tournament from a valid export file in a single action, with the
  tournament fully visible to viewers in under one minute end to end.
- **SC-002**: Round-trip fidelity: exporting an imported tournament produces a file whose tournament content
  (names, placements, schedule, results, bracket) matches the originally imported file.
- **SC-003**: 100% of invalid files - malformed, wrong version, internally inconsistent, rule-violating, or
  oversized - are rejected with a specific error message, and zero records are created for fully rejected
  files.
- **SC-004**: After any import attempt, successful or not, every pre-existing tournament and all of its data
  are unchanged.
- **SC-005**: Viewers watching a live tournament experience no visible interruption while an import runs.

## Assumptions

- Import files originate from this product's own export feature; supporting files from other tools or older
  format versions is out of scope.
- A typical export file weighs tens to a few hundred kilobytes; the 1 MB cap leaves ample headroom.
- Duplicate tournament names after repeated imports are acceptable; renaming is a manual admin action.
- Manual cleanup of a partially created tournament after a mid-import write failure is acceptable, given the
  rarity of such failures and the rule against automatic deletion.
- The existing export feature remains the single source of the file format; the import feature follows it.

## Out of Scope

- Merging into or overwriting an existing tournament.
- Importing foreign file formats or migrating older export format versions.
- Automatic name de-duplication (suffixes, copy counters).
- Any automatic deletion or rollback of partially imported data.

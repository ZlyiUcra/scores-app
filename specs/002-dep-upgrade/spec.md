# Feature Specification: Dependency Upgrade (Security-Driven)

**Feature Branch**: `002-dep-upgrade`

**Created**: 2026-07-10

**Status**: Draft

**Input**: Consilium handoff 2026-07-10 (`.specify/consilium/2026-07-10-dep-upgrade.md`). Upgrade
client and server dependencies just enough to close known vulnerabilities and clear audit noise
without changing product behavior; defer every other major to a backlog with named return triggers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Close the active developer-machine vulnerability (Priority: P1)

A maintainer runs the development server on a Windows machine. Today, while that dev server is
running, a malicious page open in the same browser can trigger a blind cross-site request to a
service endpoint of the dev server and cause a Windows credential hash to leak. The maintainer wants
this vector closed so day-to-day development is safe.

**Why this priority**: This is the only confirmed active exploit path found by the review. It affects
the maintainer's own credentials on the platform development actually happens on. Everything else in
this feature is hygiene; this is the reason the work is scheduled now.

**Independent Test**: After the frontend toolchain is upgraded, the vulnerable service endpoint no
longer exists in the running dev server, and a security audit of the client workspace reports no
outstanding advisories.

**Acceptance Scenarios**:

1. **Given** the development server is running, **When** a security audit of the client workspace is
   run, **Then** it reports zero known advisories.
2. **Given** the upgraded development server is running, **When** the application is loaded and a live
   score update is made, **Then** the score updates in real time exactly as before the upgrade.
3. **Given** the upgraded toolchain, **When** a production build is produced and served, **Then** the
   application behaves identically to before (login, deep links, real-time updates, import, export).

---

### User Story 2 - Clear server audit noise and make rate limits honest (Priority: P2)

A maintainer wants the server workspace to also report a clean security audit, and wants the abuse
protection on login and registration to actually hold for the full range of client addresses rather
than being trivially bypassable by an attacker rotating within an address block.

**Why this priority**: No active server exploit path was confirmed, so this is hygiene rather than an
emergency. It ships in the same effort because it is cheap and removes the remaining audit warning.

**Independent Test**: A security audit of the server workspace reports zero known advisories, and the
login rate limit still returns a rejection on the expected attempt count after the upgrade.

**Acceptance Scenarios**:

1. **Given** the upgraded server, **When** a security audit of the server workspace is run, **Then**
   it reports zero known advisories.
2. **Given** the upgraded server, **When** more than the allowed number of login attempts are made
   within a minute, **Then** the excess attempts are rejected with the standard rate-limit response.
3. **Given** the upgraded server, **When** all existing flows are exercised (login, session cookies,
   mutations, import, export), **Then** they behave identically to before the upgrade.

---

### User Story 3 - Record deferred upgrades with return triggers (Priority: P3)

A maintainer wants everything deliberately not upgraded now to be written down with a concrete
condition that brings it back, so deferral is a decision with a trip-wire rather than something
quietly forgotten.

**Why this priority**: Prevents "deferred" from silently becoming "never" on the one item where that
would eventually cost more (the server framework's end-of-life window). Documentation only, no code.

**Independent Test**: The backlog record exists and each deferred item names a specific condition
that would trigger picking it up.

**Acceptance Scenarios**:

1. **Given** the handoff artifact, **When** the deferred list is read, **Then** each entry states a
   concrete return trigger (a date to review, an end-of-support announcement, an unpatched
   vulnerability, or a dependency requirement).

---

### Edge Cases

- If the upgraded frontend toolchain fails any smoke-check step, the change is reverted to the
  previous known-good version rather than patched around; reverting does not reopen any advisory
  beyond those already present before the upgrade.
- If the frontend toolchain will not build without widening development-server file or host access,
  work stops and the cause is investigated; access is never widened to force a green build.
- The runtime version floor is raised so it cannot admit runtime versions the new toolchain does not
  support. (The matching constitution constraint was amended to ">= 22.12" in v1.0.1 before
  planning; see Assumptions.)
- A payload just over the shared body-size cap must still be rejected, and the larger-payload import
  path must still succeed, after the upgrade.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The frontend build toolchain MUST be upgraded to a version that eliminates all four
  known development-server advisories, including the confirmed active credential-hash-leak vector,
  without switching the underlying bundler technology.
- **FR-002**: The frontend framework build plugin MUST be upgraded to the version compatible with the
  chosen toolchain version (not a newer version that requires a different toolchain major).
- **FR-003**: The two affected server libraries (the cookie library and the rate-limit library) MUST
  be upgraded to versions that clear the server security audit.
- **FR-004**: The rate limiting on login and registration MUST remain effective and MUST correctly
  bucket the full range of client addresses after the upgrade.
- **FR-005**: The declared minimum runtime version MUST be raised so it cannot admit a runtime the
  upgraded toolchain does not support.
- **FR-006**: Dependency version ranges in the manifests MUST be updated to reflect what is installed,
  not only the lockfiles.
- **FR-007**: The work MUST be delivered as two separate commits - one for the server library bumps,
  one for the frontend toolchain - each independently confirmed before it is made.
- **FR-008**: The upgrade MUST NOT change any user-facing product behavior. All existing flows MUST
  behave identically before and after.
- **FR-009**: Every deferred upgrade MUST be recorded with a concrete condition that triggers picking
  it up later.
- **FR-010**: The upgrade MUST NOT widen the development server's file-access or host exposure. If a
  green build is impossible without doing so, the work stops for investigation.

### Non-Functional / Verification Requirements

- **FR-011**: Both workspaces MUST pass their type check after the upgrade.
- **FR-012**: The change MUST be exercised against a fixed smoke checklist in the running app, in both
  development mode and production-served mode, because the project has no automated tests. The
  checklist MUST cover: login; live score update over the real-time channel; a deep link to a
  bracket; the health endpoint returning structured data; an unknown API path NOT returning the app
  shell; an administrator import of a file larger than the shared body cap succeeding; a body just
  over the cap on an ordinary mutation being rejected; export; and the login rate limit rejecting the
  excess attempt.
- **FR-013**: The client bundle size MUST be measured against the recorded baseline (109070 bytes
  gzipped) after the frontend upgrade, and a regression MUST be weighed before the change is kept.
- **FR-014**: The installed dependency tree MUST be confirmed free of the vulnerable cookie version
  after the server bump.

### Key Entities

- **Server dependency bumps (commit 1)**: The cookie library raised to a patched line, and the
  rate-limit library raised to its new major (which makes address bucketing honest for the full
  client address range).
- **Frontend toolchain bump (commit 2)**: The build toolchain raised to the target line that closes
  all four advisories without changing the bundler, its framework plugin raised to the matching
  version, and the runtime floor raised to the toolchain's supported minimum.
- **Deferred backlog**: The set of upgrades deliberately not done now, each with a return trigger -
  the next-generation toolchain (bundler change), the server framework major, the validation library
  major, the frontend framework/router/state trio, the type-checker major, and three low-value or
  packaging-only bumps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A security audit of both the client and server workspaces reports zero known
  advisories.
- **SC-002**: The confirmed active credential-leak vector is gone: sending the UNC-path payload to
  the development-server's open-in-editor endpoint no longer reaches the filesystem/network call
  that leaked the NTLMv2 hash (the endpoint route itself still exists - the fix is a guard in the
  bundled `launch-editor` code, verified with the live attack payload, not removal of the route).
- **SC-003**: Every item on the fixed smoke checklist passes in both development mode and
  production-served mode.
- **SC-004**: The login rate limit rejects the excess attempt within the same window as before the
  upgrade.
- **SC-005**: The client bundle size after the frontend upgrade is measured and recorded against the
  109070-byte-gzipped baseline, with any change accounted for.
- **SC-006**: No user-facing behavior differs before and after the upgrade, as demonstrated by the
  smoke checklist.
- **SC-007**: The deferred backlog is recorded, and every entry names a concrete return trigger.

## Assumptions

- The single confirmed active vector is the credential-hash leak via the development server's
  file-open service endpoint on Windows; it is exploitable only while the dev server is running. The
  other three frontend advisories are closed by the same upgrade but were not independently
  exploitable in the current configuration.
- The cookie library bump is audit hygiene rather than an active-hole fix: the only direct use is
  parsing, which is not the vulnerable path.
- The next-generation toolchain (the bundler-changing major) is NOT required for security; the
  security goal is fully met on the chosen target line. It is deferred as a separate, non-urgent
  step.
- The frontend application code is already compatible with a future framework/router/state major
  (modern root API, router future flags enabled, state stores on the named-create API); that trio is
  still deferred because it carries the largest regression surface for no current user value.
- Raising the runtime floor conflicted with the constitution's stated "Runtime is Node >= 22.5".
  Resolved through governance before planning: constitution v1.0.1 (2026-07-10, PATCH) raises the
  stated floor to ">= 22.12". The root manifest's engines field itself is raised inside this
  feature's frontend toolchain commit.
- The project deliberately has no automated test suite, so a fixed manual smoke checklist is the
  accepted verification and must be defined rather than left as "run it".
- Two open production concerns are out of scope for this feature and remain on the backlog: a
  hardcoded viewer credential without an environment override, and data durability (a hosting
  concern).

## Out of Scope

- Switching the frontend bundler technology (the next-generation toolchain major).
- The server framework major, the validation library major, and the frontend framework/router/state
  trio - all deferred with triggers.
- The type-checker major (just reached general availability; awaiting ecosystem confirmation).
- Packaging-only or no-vulnerability bumps deliberately not taken.
- The two open production concerns (hardcoded viewer credential, data durability) - tracked
  separately, not addressed here.

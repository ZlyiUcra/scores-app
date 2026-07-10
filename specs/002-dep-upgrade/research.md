# Phase 0 Research: Dependency Upgrade (Security-Driven)

All facts below were established during the consilium review of 2026-07-10 (five-archetype review
plus cross-examination; full record in `.specify/consilium/2026-07-10-dep-upgrade.md`) and verified
against the live registry and the installed tree on 2026-07-10. No NEEDS CLARIFICATION markers
remained in the spec; this file records the decisions and the evidence behind them.

## R1. Frontend toolchain target: vite 7.3.6, not 8.1.4

- **Decision**: upgrade `vite` to exactly 7.3.6 and `@vitejs/plugin-react` to ^5.
- **Rationale**: `npm audit --json` vulnerable ranges are GHSA-4w7w-66w2-5vf9 `<=6.4.1`,
  GHSA-fx2h-pf6j-xcff `<=6.4.2`, GHSA-v6wh-96g9-6wx3 `<=6.4.2`, esbuild GHSA-67mh-4wv8-2f99
  `<=0.24.2`. No range reaches 7.x. `npm view vite@7.3.6 dependencies` shows esbuild
  `^0.27.0 || ^0.28.0` (fix was 0.25.0). `npm ls launch-editor` is empty post-upgrade, but that is
  because vite now bundles `launch-editor` inside its own `dist/node` output instead of listing it
  as a resolvable dependency - it is NOT gone. Live re-test on 2026-07-10 (T017) against the
  running vite 7.3.6 dev server: the `/__open-in-editor` route still responds (500, not 404), but
  sending the actual attack payload (a UNC path) hits an explicit guard added upstream in the
  bundled `launch-editor@2.14.1` (`client/node_modules/vite/dist/node/chunks/config.js:14880`)
  that rejects Windows UNC paths BEFORE the `fs.existsSync` call that used to trigger the SMB/NTLM
  handshake. So the confirmed vector is closed by that guard, not by the dependency disappearing -
  SC-002 in spec.md was reworded to match. Audit's suggestion of 8.1.4 is merely "latest", not the
  minimal fix. Staying on 7.x keeps the rollup bundler - no Rolldown/Oxc/Lightning-CSS variables in
  a security-motivated step.
- **Alternatives considered**: vite 8.1.4 (rejected now: three majors + bundler swap in one step,
  largest regression surface for zero additional security value; deferred - see R6); staying on
  5.4.21 (rejected: 5.x is EOL, no more backports, and the launch-editor UNC-path vector is live
  during every dev session on Windows).

## R2. Plugin pairing: @vitejs/plugin-react ^5 (NOT 6)

- **Decision**: `@vitejs/plugin-react` ^5 (5.0.4 verified).
- **Rationale**: `npm view @vitejs/plugin-react@5.0.4 peerDependencies` = vite
  `^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`; version 6.0.3 requires vite `^8.0.0` plus rolldown
  plugins. The original proposal paired plugin 6 with vite 8; with the 7.3.6 target the only
  correct pairing is ^5.
- **Alternatives considered**: keeping 4.7.0 (its peer range does not include 7.x... it does
  include ^7.0.0? No - 4.7.0 predates vite 7; ^5 is the line released and tested against vite 7).

## R3. Server bumps: cookie ^0.7.2 and express-rate-limit ^8

- **Decision**: raise the direct `cookie` pin to ^0.7.2; raise `express-rate-limit` to ^8.
- **Rationale (cookie)**: CVE-2024-47764 / GHSA-pxg6-pf52-xh8x, the only server audit finding.
  Honest framing from review: audit hygiene, not an active hole - the sole direct use is
  `cookie.parse` in `server/src/auth.ts:181` (socket handshake), and parse is not the vulnerable
  path (serialize is); cookie names are constants. Transitive `cookie` under express/cookie-parser
  already resolves patched (0.7.x). API of 0.7.2 is compatible with 0.6 usage; `@types/cookie`
  ^0.6.0 stays (types are compatible, no 0.7 types major exists).
- **Rationale (express-rate-limit)**: v8 replaced the vulnerable `ip` package with `ip-address`
  and masks IPv6 keys to /56 by default - in v7 an attacker with a /64 prefix could rotate
  addresses past the login/register limits, so this is a boundary strengthening. Verified in code:
  all six limiters already use v7+ naming (`limit`, `standardHeaders: true`,
  `legacyHeaders: false` - routes/auth.ts:21-33 and admin routes); `req.rateLimit.current` (renamed
  to `used` in v8) is not referenced anywhere. `app.set('trust proxy', 1)` (index.ts:22) is a
  narrow, valid config that v8's stricter validation accepts.
- **Alternatives considered**: cookie 2.x (rejected: a major with zero CVEs between 0.7.2 and 2.x -
  churn without value); deferring rate-limit 8 (rejected by user: attached to commit 1, one manual
  run covers both).

## R4. Runtime floor: engines.node >= 22.12

- **Decision**: root `package.json` `engines.node` `">=22.5"` -> `">=22.12"`.
- **Rationale**: `npm view vite@7.3.6 engines` = `^20.19.0 || >=22.12.0`. The current `>=22.5`
  admits node 22.5-22.11, which vite 7 does not support. The project stays on the 22 line (the 20
  branch is irrelevant: node:sqlite here assumes 22+). Dev machine runs 22.14.0 - already
  compliant. Constitution conflict was resolved first: v1.0.1 (2026-07-10) states the floor as
  \>= 22.12.
- **Alternatives considered**: leaving engines untouched (rejected: manifest would lie about what
  the toolchain supports - the exact class of drift the consilium flagged).

## R5. Expected source-code changes: none - and the evidence

- vite.config.ts (20 lines): no `build.rollupOptions`, one plugin, ESM config, no Sass/PostCSS -
  nothing removed in vite 6/7 is used. Lightning CSS is NOT default on 7.x (that is vite 8), so
  the single plain styles.css (708 lines) goes through the same pipeline.
- React 18 stays; plugin-react 5 supports React 18 and 19.
- Client legacy scan clean: createRoot, no defaultProps/propTypes/string refs/forwardRef; RR
  future flags already on (main.tsx:15) - irrelevant to this feature but confirms no hidden
  coupling.
- Server code: no changes - see R3 verifications.
- If any of this proves wrong at install time (e.g. vite 7 dev server refuses `../shared` via
  `fs.allow`), the rule is STOP and investigate; widening `server.fs`/`host` to force a green
  build is forbidden (security condition - the current narrow config is itself a defense layer).

## R6. Deferred backlog with return triggers (decided, recorded, out of scope)

- vite 7 -> 8 (Rolldown): security goal fully met on 7.3.6; separate, non-urgent step.
- express 4 -> 5: review December 2026; trigger = announced EOL < 6 months away OR first
  moderate+ CVE unfixed in 4.x. Known scope: `app.get('*')` -> `'/*splat'` (index.ts:67,
  prod-only branch), @types/express ^5, re-verify dual body-parser (`req._body` internal) and
  SPA-fallback guard order.
- zod 3 -> 4: cheap (single error-API line, drift-guards catch inference drift at typecheck) but
  zero value now; watch for silent 400-message wording changes when done.
- react 19 + react-router 7 + zustand 5: triggers = end of react 18 security fixes, a needed
  dependency requiring react >=19 peer, or react-router 6 patch stop (most likely first). Mandatory
  bundle measurement vs 109070 B gzip baseline when done.
- TypeScript 7: GA 2026-07-08 (two days old); wait for typescript-eslint / tsx / @vitejs support.
- bcryptjs 3 (packaging/ESM only), cookie 2.x, @types/node 26 (track hosting runtime) - not taken.

## R7. Verification approach (no test suite exists, by project decision)

- Fixed smoke checklist (quickstart.md) replaces "run it manually" hand-waving - a consilium
  condition. It must run in BOTH dev mode (socket.io live updates through the vite proxy) and
  prod-served mode (`express.static` + SPA fallback exist only in the isProd branch of index.ts).
- Bundle baseline recorded before any change: `client/dist` single chunk 350082 B raw /
  109070 B gzip + CSS 24863 B raw / 5082 B gzip (measured 2026-07-10). Compare after commit 2.
- `npm ls cookie` after commit 1 must show no 0.6.0 anywhere in the tree.
- `npm audit` in both workspaces must report 0 vulnerabilities at the end.

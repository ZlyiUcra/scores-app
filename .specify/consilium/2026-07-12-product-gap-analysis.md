---
consilium: 2026-07-12
topic: Product-wide gap analysis - what implementations are still needed
slug: product-gap-analysis
verdict: approved-with-conditions
route: mixed (see per-item routes below)
archetypes:
  nitpicker: blocks
  security: blocks (durability/recovery only; perimeter itself does not block)
  performance: ok
  best-practices: ok
  pragmatist: blocks (durability + login-wave)
---

# Product-wide gap analysis

## Узгоджена пропозиція

Five-archetype board reviewed the whole product (not one feature) for what implementations are
still needed, after 17 sessions of prior hardening work. Board convened with freshly actualized
briefings (local + web, versions checked against `npm ls` 2026-07-12; all advisories in the
current dependency tree are closed by resolution). Cross-examination (grill-me) ran two rounds:
round 1 collected all five reports, round 2 sent targeted challenges back. Three of the five
challenged agents (security, performance, best-practices) failed on an account session-limit
error before answering (not a substantive failure) - the interrogator verified their contested
claims directly against the code instead of waiting for recovery, per the established fallback
pattern from the 2026-07-11 admin-pagination session. The pragmatist did answer and, under
challenge, both retracted a wrong claim and surfaced a new confirmed finding (G3, login-wave).

The backlog below is organized in four tiers by confidence and actionability, not by archetype.
Each item's status is tracked here and MUST be updated (checked off, not deleted) as work lands,
so this file stays the single source of truth for gap-analysis progress across sessions.

## Tier 1 - small diff, real pain, do now

- [x] T1.1 Login-wave 429 under shared NAT (`server/src/routes/auth.ts` loginLimiter): add
  `skipSuccessfulRequests: true` so only failed login attempts count toward the 10/min bucket.
  ~50 viewers behind one venue NAT (`trust proxy: 1`) hitting the shared bucket would otherwise
  mostly get 429'd at event start. route: direct-verified. DONE: commit f8728f2, verified via a
  13-attempt failing-login curl loop (429 from the 11th) and a 15-attempt successful-login curl
  loop (all 200, none counted).
- [x] T1.2 Gate the destructive dev-only DROP (`server/src/storage/sqlite/db.ts:33-41`): the
  unconditional `DROP TABLE bracket/matches/teams/groups` on an old-shape `teams` table runs even
  in production, silently, with no backup. Gate on `!isProd`, fail loudly instead in prod.
  route: direct-verified. DONE: commit 5376c6f, verified via a single-process seed+call harness
  (production case throws with the file untouched; development case still drops+recreates as
  before).
- [x] T1.3 Require `DATA_DIR` explicitly in production (throw at boot like the other prod
  secrets) instead of defaulting relative to `__dirname` (`server/src/config.ts:86`), and stop
  silently reseeding demo data on an unexpectedly-empty production database. route: direct-verified.
  DONE: commit cd2c994, verified in three single-process scenarios (prod + no DATA_DIR refuses to
  boot; prod + DATA_DIR on an empty DB seeds the default tournament and operator accounts only,
  0 demo teams, with a loud console warning; dev on an empty DB still seeds the 9-team demo
  roster unchanged).
- [x] T1.4 Localize server error messages on the client: route `ApiError.code` (already carries
  `AppErrorCode`) through a code -> i18n-key map instead of rendering `err.message` (English)
  directly in the uk/pt UI. route: direct-verified. DONE: commit d262f77. Scope note: 19 of 27
  AppErrorCode values carry one fixed, non-interpolated message and are now translated via a new
  `apiError.*` i18n namespace (en/ua/pt, key-parity verified); the other 8 (BAD_REQUEST, INVALID,
  NOT_FOUND, STORE_WRITE_FAILED, DATA_INTEGRITY, GROUP_FULL, NUMBER_TAKEN, TEAM_IN_USE) are
  generic wrappers around a per-call dynamic English string or interpolate a runtime value, and
  deliberately keep falling back to `err.message` unchanged - translating those would need either
  a fragile string-matching table or a larger wire-contract change (structured params alongside
  the message), out of this item's smallest-diff scope. Verified via headless-Chrome CDP against
  a prod-built instance: switching to Ukrainian and submitting a wrong password renders
  "Неправильний логін або пароль." (not the English server string); 12 rapid attempts trip the
  rate limiter and render "Забагато спроб. Спробуйте трохи пізніше." in Ukrainian.
- [x] T1.5 Make `trust proxy` env-controlled, default `false` (`server/src/index.ts:22`), instead
  of hardcoded `1` - the hardcoded value assumes exactly one rewriting proxy, which does not hold
  for a direct-access self-hosted deployment. route: direct-verified. DONE: commit a1d0c38,
  verified via 12 curl requests each with a different spoofed X-Forwarded-For: with TRUST_PROXY
  unset, all 12 land in the same real-IP bucket (429 from the 11th) - spoofing does not evade the
  limiter; with TRUST_PROXY=1, all 12 land in distinct buckets (all 401, none rate-limited),
  matching the previous hardcoded Render behavior when explicitly opted in.

## Tier 2 - needs explicit user decision/consent

- [ ] T2.1 Password-change endpoint (admin self-service minimum): no such endpoint exists at all
  today (`config.ts:47-49` documents this) - the seed value is the only point either the admin or
  viewer password can ever be set; env-var change on a live DB is a no-op. Independently raised by
  three archetypes (nitpicker N1, security S4, best-practices A4). route: speckit (new
  contract/endpoint/UI + i18n x3).
- [ ] T2.2 Unit tests for the pure domain logic (`shared/tournament.ts` tie-breaks/qualification/
  bracket resolution, `services/import.ts` validateGraph). Gated on the user un-parking vitest as
  a dev dependency. route: direct-verified once unparked.

## Tier 3 - gated on an external decision, not code work now

- [ ] T3.1 Data durability: a documented ops runbook (periodic `scores.db` copy / `VACUUM INTO`
  run outside the app) plus the still-open hosting decision (persistent disk vs. Postgres). The
  constitution explicitly forbids solving this in code ("Data durability is an open hosting
  concern... Code MUST NOT pretend to solve it"); a prior consilium (tournament-export) also
  deliberately excluded accounts/audit from any export as PII. This item is NOT a code deliverable
  - it is an ops decision + a runbook document.
- [ ] T3.2 Storage Phase C (from [[storage-layering-plan]]): `withTransaction` unit-of-work
  (fixes the two-transaction `removeTeam` + player-cascade window), a Postgres driver, a migration
  ledger. Gated on the user picking a second database.

## Tier 4 - hygiene, bundle into one pass whenever picked up

- [ ] T4.1 README self-contradiction: still describes accounts as living in
  `server/data/users.json` (README.md:73/222/372) when the real store is `scores.db`;
  `users.json` is a one-time legacy import only.
- [ ] T4.2 `<html lang="ua">` is not a valid BCP-47 tag (should be `uk`) and is only synced to the
  active locale inside `setLang`, not on mount - a fresh English-UI load ships under `lang="ua"`.
- [ ] T4.3 Dead i18n keys with zero call sites in all three catalogs: `date.invalid`,
  `adminTournaments.start`, `adminTournaments.end`.
- [ ] T4.4 Dead `.table-link` CSS class (`client/src/styles.css`), left over from commit
  `10b2a16`.
- [ ] T4.5 ASCII-rule violations in client source (U+2212 minus, middle dot, ellipsis, emoji
  literals, em-dashes in comments) that bypass the `constants.ts` escaping convention used
  elsewhere.
- [ ] T4.6 SCREAMING_SNAKE_CASE constant names outside `constants.ts` (`STORAGE_KEY`, `TOKEN`,
  `TIME_TOKENS`, `POPOVER_SHEET_MAX`, `DATETIME_FORMAT`, `STATUSES`) inconsistent with the
  project's camelCase convention.

## Зауваження, що вціліли

- [підтверджено] Password-change endpoint missing entirely (nitpicker N1, security S4,
  best-practices A4 - independent convergence)
- [підтверджено] Login-wave 429 risk under shared NAT (performance P1 + pragmatist G3, confirmed
  under cross-examination with a one-line fix)
- [підтверджено] Destructive DROP not gated to non-prod (nitpicker N11, verified directly in code
  by the interrogator: db.ts:33-41 runs unconditionally, including in prod)
- [підтверджено] DATA_DIR defaults under dist + silent prod reseed (security S2 + nitpicker N4,
  verified directly in code by the interrogator)
- [підтверджено] Client-side error messages not localized (nitpicker N2)
- [підтверджено] Zero tests on pure domain logic (nitpicker N10 + best-practices A1, independent
  convergence)
- [підтверджено] withTransaction / migration ledger gaps (best-practices A2/A3, file:line
  evidence: services/roster.ts two-transaction cascade)
- [підтверджено] README self-contradicts on account storage; invalid html lang tag; dead i18n
  keys; dead CSS class; ASCII-rule violations; SCREAMING_SNAKE_CASE constants (nitpicker
  N3/N6/N7/N8/N9/N12, verified directly in code by the interrogator)

## Позначене допитувачем

- [слабке] Full system backup / whole-DB export including accounts+audit (security S1) - рішення
  користувача: звужено до T3.1 (ops runbook, без коду), бо суперечить і конституції, і
  export-консиліуму (accounts/audit deliberately excluded as PII).
- [слабке] bcrypt cost 12 as a perf concern (performance P2) - рішення користувача: not adopted;
  math shows ~2-5% CPU over a 5-10 minute login wave, no material jitter until the rate limit is
  raised to hundreds/min.
- [слабке] Static asset compression/caching (performance P3) - рішення користувача: conditional
  on the still-undecided hosting choice; not adopted as a standalone code item now.
- [слабке] MAX_USERS registration-fill DoS (security S5) - рішення користувача: not adopted;
  repeats a 2026-07-05 finding that real fixes (CAPTCHA/verify/approval) are bloat for this scale.
- [слабке] SameSite-only CSRF on admin mutations (security S6) - рішення користувача: not adopted;
  no named 2026 browser population ignores SameSite=strict.
- [слабке] CI workflow + client ESLint (best-practices A5) - рішення користувача: conditional;
  revisit if a second contributor or a deploy pipeline appears.
- [суперечить pragmatist] Pragmatist initially claimed "viewers watch without accounts" -
  factually wrong (App.tsx:76 gates the whole client behind login; the socket handshake is
  authenticated). Retracted under cross-examination; the retraction itself surfaced T1.1 (G3).

## Свідомо не робимо

- Player stats/top-scorers - Player is deliberately decorative by design (does not affect
  standings/seeding).
- Automated cron backups to the same ephemeral disk - solves nothing, masks the real durability
  decision.
- Offline/PWA/service worker - no matching real-world scenario at this event scale.
- 2FA / session store / observability stack - single instance, operator present, out of proportion.
- Dependency waves (express 5, react 19, zod 4, TS 7) ahead of their recorded return triggers.

## Маршрут виконання

- Рекомендація ради: Tier 1 як компактний пакет `direct-verified`, один коміт на пункт;
  Tier 2.1 (паролі) - `speckit`; решта гейтована на рішення користувача.
- Рішення користувача: приступити до Tier 1 зараз, по одному пункту, кожен своїм комітом.
  Beклог усіх 4 тіерів зберігається тут і в цьому файлі позначається виконаним по ходу роботи.
- Verification-список (Tier 1, direct-verified): typecheck (server+client) після кожного пункту;
  T1.1 - curl-цикл з одного IP: серія невдалих логінів досягає 429 на 11-й, серія УСПІШНИХ логінів
  (спільний viewer) не рахується в лічильник; T1.2 - на temp DATA_DIR з навмисно старою формою
  teams-таблиці підтвердити відмову замість дропу в NODE_ENV=production, і що дроп досі працює в
  dev; T1.3 - prod-boot без DATA_DIR відмовляє стартувати (як JWT_SECRET), порожня prod-база більше
  НЕ ресідиться мовчки; T1.4 - CDP/ручний прогін кожної помилкової дії (wrong password, username
  taken, тощо) у всіх трьох локалях показує перекладений текст; T1.5 - curl з підробленим
  X-Forwarded-For проти дефолтної конфігурації (trust proxy вимкнено) не змінює рахований IP.

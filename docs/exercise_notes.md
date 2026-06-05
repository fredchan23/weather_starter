# Exercise Notes

Use this as a changelog. Add one entry per branch or commit, and keep the same order inside every entry.

Related research: [Weather Dashboard API Mapping](./dashboard_api_mapping.md)

## 2026-06-05 | branch `main` | commits `71b7771`–`5454ed3` | per-browser session isolation (Checkpoint 1)

- status: implemented
- implementation request: Add per-browser session isolation so each browser maintains an independent location list. Tasks 1–4 from `tasks/todo.md` (Phase 1).
- implementation challenges:
  - `npm run db:migrate` (drizzle-kit) cannot connect to the Node built-in `node:sqlite` driver — it requires `better-sqlite3` or `@libsql/client`. Migrations are applied automatically at startup via the `migrate()` call in `db.ts`, so `db:generate` is sufficient and the drizzle-kit migrate step is a no-op in this project.
  - The `server.test.ts` integration test makes two separate HTTP requests (POST then GET) without carrying cookies; after session middleware landed, each request received a fresh UUID and the GET saw an empty list. Fixed by extracting the `wsid` Set-Cookie header from the POST response and forwarding it to the GET.
  - TypeScript typed `supertest` response headers as flat `string`, so `as string[]` was rejected; worked around with an `Array.isArray` branch.
- scope: `backend/src/schema.ts`, `backend/drizzle/0001_luxuriant_anita_blake.sql`, `backend/drizzle/meta/`, `backend/src/db.ts`, `backend/src/routes/locations.ts`, `backend/src/routes/locations.test.ts`, `backend/src/server.ts`, `backend/src/server.test.ts`.
- decisions:
  - Task 1: added `session_id text NOT NULL DEFAULT 'legacy'` column; replaced `(latitude, longitude)` unique index with `(session_id, latitude, longitude)`.
  - Task 2: all five DB helpers (`listLocations`, `createLocation`, `getLocation`, `deleteLocation`, `updateWeather`) now accept `sessionId` and scope every query to it — prevents cross-session reads and deletes by ID-guessing.
  - Task 3: `sessionMiddleware` in `server.ts` reads the `wsid` cookie, validates it as a UUID, generates a new one if absent or invalid, sets it `httpOnly + sameSite=lax + maxAge 1 year`, and writes `res.locals.sessionId` for all downstream handlers. No third-party cookie-parser dependency — manual header parsing is sufficient for a single cookie key.
  - Task 4 (TDD): wrote failing tests first (RED — 2 new tests fail, 53 existing pass), then implemented Tasks 2 & 3 (GREEN — all 55 pass). `callRoute` defaults `locals` to `{ sessionId: 'test-session' }` so existing tests required no per-call changes.
- verification:
  - `npm test` — **55/55 pass** (53 pre-existing + 2 new session-isolation tests)
  - `npm run build` — clean (frontend + backend TS)
  - `npm run doctor` — healthy (`/health` and `/api/locations` smoke-test pass)
  - Manual Checkpoint 1 Item 4 — two browsers side by side (Arctic Glass theme: Seletar 32°; Botanical Garden theme: City 30°) show fully independent location lists, confirming `wsid` cookie isolation end-to-end.
- follow-up: Phase 2 (Tasks 5 & 6) — region → area picker frontend (`regionMap.ts` + rewrite `AddLocationForm.tsx`).

## 2026-06-05 | branch `main` | commit `17da7d6` | checkpoint — security hardening Phase 3 complete (Cloudflare/registrar free tier)

- status: implemented
- implementation request: Close out Phase 3 of the security hardening plan (docs/pending/security-hardening-followup.md) — infrastructure-only items applied to the live site at https://weather.assurecraft.org/ via Cloudflare and domain registrar dashboards.
- implementation challenges: Free-tier Cloudflare does not expose cipher suite selection (requires Business plan); TLS 1.0/1.1 disable, HSTS, and DNSSEC are available and applied. BREACH mitigation and session ticket key rotation are Cloudflare-managed with no free-tier override.
- scope: Cloudflare SSL/TLS settings, registrar DNSSEC config, `docs/pending/security-hardening-followup.md` (Phase 3 status updated).
- decisions: Applied all free-tier-reachable controls (minimum TLS 1.2, HSTS, DNSSEC). Accepted remaining gaps (cipher suite selection, BREACH, EV cert) as out of scope for free tier — documented and closed.
- verification: Live site reachable at https://weather.assurecraft.org/ with HTTPS. Phase 3 marked complete in security-hardening-followup.md.
- follow-up: Cipher suite hardening and BREACH mitigation require Cloudflare Business plan if needed in future.

## 2026-06-01 | branch `main` | commits `fdcd0df`–`fa72b25` | security hardening Phase 1 + Phase 2

- status: implemented
- implementation request: work through all 7 tasks in docs/pending/security-hardening-followup.md using TDD + incremental implementation
- implementation challenges: TypeScript flagged `locationId` as used-before-assigned in the refresh route catch block after extracting `parseLocationId`; fixed by initializing to `null`
- scope: `backend/src/server.ts`, `backend/src/routes/locations.ts`, `backend/src/routes/locations.test.ts`
- decisions: Task 3 used Option A (comment only) — Option B's rate-limit counter separation is not testable without exhausting live buckets; `parseLocationId` exported from locations.ts so it can be unit-tested directly
- verification: `npm test` (53 tests, all pass), `npm run build` (clean)
- follow-up: Phase 3 items (TLS 1.2 minimum, modern ciphers, DNSSEC, BREACH mitigation) are Cloudflare/registrar dashboard changes — no code review needed

## 2026-06-01 | branch `main` | commit `3bd2de8` | 360px mobile viewport support + CSP dev-mode fix

- status: implemented
- implementation request: Assess and fix text overflow observed at 360px mobile viewport width (screenshot: Golden Hour theme, UV "Moderate" label and FORECAST card clipped). Support 360px as minimum width. Fix blank dev-server load caused by CSP blocking Vite HMR.
- implementation challenges:
  - Root cause was non-obvious: `AirQualityTile` and `WindTile` passed `col-span-2` unconditionally to `TileShell`. In a `grid-cols-1` context (< 640px), CSS Grid generates an implicit second column to satisfy the span, making every other tile render at half-width (~148px) and causing overflow. Changing two class names (`col-span-2` → `sm:col-span-2`) fixed the layout entirely.
  - The CSP added in the previous session was applied unconditionally. Vite's HMR WebSocket (`ws://`) and the `@vitejs/plugin-react` inline preamble are both blocked by a strict `script-src 'self'` / `connect-src 'self'` policy, causing a blank page. The fix: disable helmet's CSP in dev (`NODE_ENV !== 'production'`); production CSP unchanged.
- scope: `frontend/src/components/Tiles.tsx`, `frontend/src/components/Hero.tsx`, `backend/src/server.ts`.
- decisions:
  - Scoped `col-span-2` to `sm:col-span-2` rather than removing it — the full-row layout for Air Quality and Wind tiles at ≥ 640px is correct and intentional.
  - Added `min-w-0` to the Wind tile's text column (inside `grid-cols-[1fr_auto]`) so it can shrink without pushing the compass out.
  - Added `break-words` to the Air Quality PM2.5 paragraph (API-sourced region name) and the Hero `<h1>` (variable-length area name) as defensive overflow guards.
  - Disabled CSP entirely in dev rather than enumerating Vite's injections — dev is localhost-only, enumerating Vite internals is fragile across versions.
- verification: `npm test` (48 tests, all pass), `npm run build`, `npm run dev` — 360px DevTools viewport: all tiles single-column, no overflow in 4 themes; site loads without CSP console errors.
- follow-up: none.

## 2026-06-01 | branch `main` | commit `86e6d9c` | security hardening — ADR-001

- status: implemented
- implementation request: Fix all findings from the security audit (ADR-001) in priority order: helmet headers (H1), rate limiting (H2), drizzle-kit upgrade (H3), locationId param validation (M1), 502 error message sanitization (M3), /api/logs metadata limits (M2), explicit CORS config (M4).
- implementation challenges:
  - `express-rate-limit` draft-7 headers use a combined `RateLimit` field, not separate `RateLimit-Limit`/`RateLimit-Remaining`; switched to draft-6 to match test assertions.
  - Applying `app.use('/api/locations', mutationLimiter)` hit GET routes in tests, causing 429s on unrelated assertions; fixed by targeting only POST routes with `app.post(...)`.
  - drizzle-kit 0.31.10 still depends transitively on `@esbuild-kit/core-utils` (esbuild ~0.18.x); `npm audit fix --force` would downgrade — accepted residual risk since the vulnerable `serve()` API is not called in this path; the bundled esbuild inside drizzle-kit itself is 0.25.12 (patched).
  - `locationId` declared inside `try` was out of scope in the `catch` block after moving the guard; hoisted declaration outside.
- scope: `backend/src/server.ts`, `backend/src/routes/locations.ts`, `backend/src/server.test.ts`, `backend/src/routes/locations.test.ts`, `docs/decisions/ADR-001-security-hardening.md`, `package.json`, `package-lock.json`.
- decisions: Wrote failing tests before each fix (TDD red-green cycle). Applied helmet as first middleware for broadest coverage. Used POST-only mutation limiter to avoid throttling cheap GETs. Replaced both 502 error message passthroughs with a fixed string, logging originals server-side. Metadata validation rejects arrays and nested objects outright; truncates flat objects to 10 keys. CORS disabled by default (safe for same-origin SPA), opt-in via `ALLOWED_ORIGINS`.
- verification: `npm test` (48 tests, all pass), `npm run build`, `npm run db:generate` (no schema changes), `npm run lint`.
- follow-up: Residual `@esbuild-kit/core-utils` esbuild CVE should be revisited when drizzle-kit publishes a patch that removes the dependency. Consider adding `ALLOWED_ORIGINS` to ops/systemd service template.

## 2026-05-31 | branch `main` | commit `pending` | document Caddy domain and HTTPS setup

- status: implemented
- implementation request: Document the deployed Caddy reverse-proxy, domain, and HTTPS setup in `docs`.
- implementation challenges:
  - Needed to capture both the current working sslip domain flow and a reusable custom-domain path without overfitting to one hostname.
  - Had to include practical troubleshooting for transient upstream failures (`502` when app is not listening) and certificate issuance pitfalls.
- scope: `docs/caddy_setup.md`, `docs/compute_engine.md`, `docs/exercise_notes.md`.
- decisions: Added a dedicated Caddy guide with validated command sequence, verification checks, and troubleshooting; linked it from the Compute Engine deployment doc.
- risks: The documented sslip hostname is tied to current external IP and will change if the VM IP changes.
- verification: External checks passed for HTTP redirect and HTTPS health/root responses on `34-60-122-241.sslip.io`.
- follow-up: Optionally assign a static external IP and move to a custom domain to avoid hostname drift.

## 2026-05-31 | branch `main` | commit `pending` | add GitHub Actions VM deploy workflow

- status: implemented
- implementation request: Add a push-on-`main` GitHub Actions deploy path for the GCE VM so routine fixes can ship without manual `gcloud compute ssh` deploys.
- implementation challenges:
  - The VM deploy path needed to avoid the interactive `gcloud` SSH key generation prompt, so the workflow had to use a dedicated SSH deploy key instead of the gcloud-managed keypair.
  - The deployment should stay compatible with the existing SQLite data on the VM, which meant updating only tracked source files on the VM and leaving the database outside the repo tree.
- scope: `.github/workflows/deploy-vm.yml`, `docs/compute_engine.md`, `README.md`, `docs/exercise_notes.md`.
- decisions: Added a GitHub Actions workflow triggered on push to `main` that SSHes into the VM, hard-resets the repo to `origin/main`, rebuilds there, restarts the service, and health-checks the local app before reporting success.
- risks: The workflow assumes the VM user has SSH access and can run the restart commands with `sudo`; if that changes, the workflow or VM sudoers config will need to be updated.
- verification: `npm test`, `npm run build`.
- follow-up: Optionally add a manual `workflow_dispatch` input for alternate branches or a status badge once the deploy path is in regular use.

## 2026-05-31 | branch `main` | commit `pending` | add VM SSH/npm recovery RCA document

- status: implemented
- implementation request: Document full root-cause analysis and recovery actions for the GCE VM SSH instability and npm install failures in `docs`.
- implementation challenges:
  - The incident combined multiple coupled symptoms (SSH banner timeout, connection refused, npm `ENOTEMPTY`, and service restart churn), which required one coherent RCA rather than isolated notes.
  - Control-plane troubleshooting looked healthy while guest-level behavior was unstable, so the document had to separate confirmed facts from unproven low-level causes.
- scope: `docs/rca-2026-05-31-gce-vm-ssh-npm-recovery.md`, `docs/exercise_notes.md`.
- decisions: Created a dedicated RCA with timeline, root cause/contributing factors, recovery steps, final state, and preventive runbook snippets.
- risks: The initial SSH degradation trigger remains partially indeterminate; future recurrences should capture richer guest logs at onset.
- verification: Confirmed recovered state with successful `npm ci`, successful `npm run build`, active `weather-starter.service`, and healthy `curl http://127.0.0.1:3000/health` response.
- follow-up: Optionally codify maintenance-mode deploy sequencing in scripts to stop service before install/build and start only after health checks pass.

## 2026-05-31 | branch `main` | commit `pending` | document SSH recovery incident as ADR

- status: implemented
- implementation request: Document the full Compute Engine SSH troubleshooting and recovery flow as an ADR under `docs`.
- implementation challenges:
  - The incident had multiple symptoms (`banner exchange timeout` then `connection refused`) that needed to be captured as a coherent sequence.
  - The control-plane troubleshoot command reported no issues, so the ADR needed to explicitly distinguish path checks from guest `sshd` health.
- scope: `docs/adr-2026-05-31-ssh-access-recovery-gce-vm.md`, `docs/exercise_notes.md`.
- decisions: Use an incident-focused ADR format with context, timeline, decision, recovery implementation, outcome, and follow-up actions.
- risks: The exact underlying trigger for `sshd` degradation remains unproven; the ADR records this as an open risk rather than claiming a definitive cause.
- verification: Confirmed SSH recovery and persistence using `gcloud compute ssh weather-starter-vm --zone us-central1-a --project automatic-ace-488412-a7 --command 'echo SSH_STILL_OK'`.
- follow-up: Add periodic VM runbook checks for `systemctl is-active ssh` and capture richer guest logs if the issue reappears.

## 2026-05-31 | branch `main` | commit `pending` | add Compute Engine script workflow

- status: implemented
- implementation request: Add runnable scripts and documentation so the Compute Engine deployment path can be learned and executed step by step.
- implementation challenges:
  - The scripts had to be practical for immediate use while remaining readable enough for learning, which required balancing automation with explicit command steps.
  - The bootstrap flow needed to handle both first-time setup and repeat runs without destroying the VM state.
  - Documentation had to cover script defaults and override variables so users can adapt to different repo URLs and VM names without editing script code.
- scope: `scripts/gcp/provision-vm.sh`, `scripts/gcp/bootstrap-vm.sh`, `scripts/gcp/redeploy-vm.sh`, `package.json`, `README.md`, `docs/compute_engine.md`, `docs/exercise_notes.md`.
- decisions: Added three focused scripts (`create`, `bootstrap`, `redeploy`) with environment-variable overrides, wired npm commands for each script, and expanded deployment docs with both manual and script-driven flows.
- risks: Bootstrap assumes Debian-based apt package management and remote access through `gcloud compute ssh`; non-Debian images or restricted environments will need script adjustments.
- verification: `npm test`, `npm run build`.
- follow-up: Optionally add a lightweight health-check smoke script that runs after bootstrap/redeploy and prints pass/fail output.

## 2026-05-31 | branch `main` | commit `pending` | add Compute Engine deployment support

- status: implemented
- implementation request: Start implementing the Compute Engine deployment path for the current monolith in project `automatic-ace-488412-a7`.
- implementation challenges:
  - The app already fit a VM deployment model, so the main work was turning the plan into concrete runtime and ops artifacts without overengineering the deployment.
  - Production startup previously hard-coded `127.0.0.1`, which is safe behind a reverse proxy but too rigid for future direct binding or other host-level deployment arrangements.
  - Deployment guidance needed to be specific enough to use on GCP while still keeping the repository usable as a template.
- scope: `backend/src/server.ts`, `README.md`, `docs/compute_engine.md`, `ops/systemd/weather-starter.service.example`, `ops/caddy/Caddyfile.example`, `docs/exercise_notes.md`.
- decisions: Added configurable host binding plus graceful shutdown to the production server entrypoint, documented a single-VM Compute Engine deployment with Caddy and systemd, and committed example service configs so the deployment steps are reproducible from the repo.
- risks: The Compute Engine deployment docs assume Debian-based VM provisioning and a relatively small hobby-scale workload on one VM; a higher-traffic deployment would need stronger backup and capacity planning.
- verification: `npm test`, `npm run build`.
- follow-up: Optionally add an automated bootstrap script or Terraform config once the manual Compute Engine flow has been exercised end to end.

## 2026-05-31 | branch `main` | commit `pending` | improve mobile dashboard responsiveness

- status: implemented
- implementation request: Enhance the existing weather site so the dashboard is mobile responsive instead of remaining desktop-first.
- implementation challenges:
  - The root layout hard-locked the viewport with a fixed sidebar and internal scrolling, so the first fix had to be at the shell level rather than inside individual cards.
  - Several dashboard sections assumed wide rows or oversized typography, so the mobile pass needed coordinated changes across the Hero, hourly strip, ten-day forecast, map card, and sidebar controls without regressing desktop.
- scope: `frontend/src/components/Layout.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/SidebarCard.tsx`, `frontend/src/components/Hero.tsx`, `frontend/src/components/Tiles.tsx`, `frontend/src/components/HourlyStrip.tsx`, `frontend/src/components/TenDayForecast.tsx`, `frontend/src/components/MapCard.tsx`, `frontend/src/components/AddLocationForm.tsx`, `frontend/src/components/icons.tsx`, `docs/exercise_notes.md`.
- decisions: Replaced the always-visible fixed sidebar with a mobile drawer plus top bar, scaled the hero and dashboard grids mobile-first, made dense forecast sections adapt instead of forcing the desktop layout onto phones, and hid the closed mobile drawer via classes instead of desktop-hostile ARIA state.
- risks: There is still no automated frontend visual regression coverage, so future dashboard layout changes can regress phone behavior unless they are checked in a browser at small widths.
- verification: `npm run build`, `npm test`, `agent-browser --session weather-mobile batch --bail "open http://weather-starter.localhost:1355" "set viewport 390 844" "wait 1500" "snapshot -i -c" "screenshot /home/fredc/codeforfun/weather_starter/frontend-mobile-390.png"`, `agent-browser --session weather-mobile batch --bail "click @e2" "wait 500" "snapshot -i -c" "screenshot /home/fredc/codeforfun/weather_starter/frontend-mobile-drawer.png"`, `agent-browser --session weather-mobile batch --bail "click @e4" "wait 300" "scroll down 850" "wait 500" "screenshot /home/fredc/codeforfun/weather_starter/frontend-mobile-lower.png"`.
- follow-up: Optionally add frontend viewport or visual-regression coverage if responsive layout changes will continue frequently.

## 2026-05-31 | branch `main` | commit `pending` | add docs-site SOP init guide

- status: implemented
- implementation request: Update docs-site with a standard operating procedure page for session startup (`/init`) and make it discoverable from the docs.
- implementation challenges:
  - The SOP needed to align with existing repository conventions (verification, changelog discipline, scoped edits) without duplicating too much content from development docs.
  - Navigation discoverability required cross-linking from both the docs home map and development page.
- scope: `docs-site/src/content/docs/sop-init.mdx`, `docs-site/src/content/docs/index.mdx`, `docs-site/src/content/docs/development.mdx`, `docs/exercise_notes.md`.
- decisions: Added a dedicated SOP page with a step-by-step checklist and linked it from Home and Development rather than embedding the full checklist inline in existing pages.
- risks: SOP content can drift from actual team workflow if future process changes are not reflected in this page.
- verification: `cd docs-site && npm run build`, `npm test`, `npm run build`.
- follow-up: Optionally add a contributor quick-link section in docs-site navigation if SOP becomes a primary entry point.

## 2026-05-31 | branch `main` | commit `pending` | auto-refresh on load and hero today label

- status: implemented
- implementation request: Add automatic weather refresh when the site loads and display a Today date label in the hero section.
- implementation challenges:
  - The initial page load should remain fast and render cached weather immediately, so startup refresh had to run in the background without blocking first paint.
  - React Strict Mode can double-run mount effects in development; the load-time refresh flow needed a guard to avoid duplicate refresh calls.
- scope: `frontend/src/state/store.tsx`, `frontend/src/components/format.ts`, `frontend/src/components/Hero.tsx`, `docs/exercise_notes.md`.
- decisions: Auto-refresh only the selected/home location on initial load, keep manual refresh unchanged, and render a shared Today label helper in the hero regardless of data source availability.
- risks: Startup auto-refresh failures now surface as store errors while cached weather still renders; if needed, this can later be softened into a non-blocking toast-only path.
- verification: `npm test`, `npm run build`.
- follow-up: Optionally add a frontend test harness to unit-test StoreProvider mount behavior and Hero date-label rendering.

## 2026-05-23 | branch `main` | commit `pending` | expand docs-site pages from source

- status: implemented
- implementation request: Read the existing backend and frontend source and fill in Weather Starter docs-site pages, including Mermaid diagrams for system architecture.
- implementation challenges:
  - The docs-site initially contained only a minimal home page, so the new content had to be derived directly from backend and frontend source files rather than existing docs structure.
  - API and UI behavior include fallback paths (stale forecast areas, partial refresh merges, forecast-first rendering) that needed precise documentation to avoid misleading simplifications.
- scope: `docs-site/src/content/docs/index.mdx`, `docs-site/src/content/docs/architecture.mdx`, `docs-site/src/content/docs/backend-api.mdx`, `docs-site/src/content/docs/frontend.mdx`, `docs-site/src/content/docs/data-model.mdx`, `docs-site/src/content/docs/development.mdx`, `docs/exercise_notes.md`.
- decisions: Added dedicated docs pages for architecture, backend API, frontend behavior, data model, and development workflow; included Mermaid diagrams for runtime topology, request flow, and frontend composition.
- risks: Docs can drift as routes or UI behavior evolve unless kept in sync with future implementation changes.
- verification: `npm test`, `npm run build`, `cd docs-site && npm run build`.
- follow-up: Optionally add endpoint-level request/response examples for every API route if external consumers need stricter contracts.

## 2026-05-23 | branch `main` | commit `pending` | document duplicate precheck logging behavior

- status: implemented
- implementation request: Document why adding a duplicate location can show an in-app duplicate message without producing a backend level 40 warning log.
- implementation challenges:
  - Frontend interaction logs (`/api/logs`) and backend warning logs (`logger.warn`) are emitted by different code paths, which can look similar in `app.log` unless the route and message are checked.
  - Duplicate behavior depends on whether the request is preempted in the client or reaches `POST /api/locations` and triggers a database uniqueness error.
- scope: `frontend/src/components/AddLocationForm.tsx`, `backend/src/routes/locations.ts`, `backend/logs/app.log`, `docs/exercise_notes.md`.
- decisions: Keep the current frontend-first duplicate handling; when a duplicate is detected in the client, select the existing location, show "Already saved. Showing ...", and skip the create API call.
- risks: The backend duplicate warning path may be under-observed in manual testing because normal UI usage short-circuits duplicate submissions before they hit the server.
- verification: `cat backend/logs/app.log | jq 'select(.level == 40)'`, `grep -n '"level": 40' backend/logs/app.log`.
- follow-up: If duplicate diagnostics are needed in production telemetry, add a dedicated frontend event for duplicate-prevented creates and dashboard it separately from backend warnings.

## 2026-05-23 | branch `main` | commit `pending` | add backend app API tests

- status: implemented
- implementation request: Add Vitest coverage for backend API endpoints using existing route test patterns, then run lint and tests.
- implementation challenges:
  - Existing route tests validate router handlers directly, so app-level API verification needed separate HTTP-style assertions without introducing flaky server lifecycle behavior.
  - The new app tests required isolated SQLite state to avoid cross-test interference with the existing backend suite.
- scope: `backend/src/server.test.ts`, `backend/src/routes/locations.ts`.
- decisions: Added a new `createApp` test suite with `supertest` covering `/health`, `/api/logs`, and mounted `/api/locations`; fixed an unused route middleware arg to satisfy ESLint.
- risks: App-level tests intentionally avoid Vite/frontend middleware paths (`serveFrontend: false`), so frontend serving behavior remains covered by runtime smoke checks rather than unit tests.
- verification: `npm run lint`, `npm test`.
- follow-up: Optionally add focused tests for the shared error handler and non-2xx weather provider paths through the full app layer.

## 2026-05-23 | branch `main` | commit `pending` | fix manual coordinate input overlap

- status: implemented
- implementation request: Fix overlapping latitude and longitude inputs in the manual add-location form.
- implementation challenges:
  - The overlap appeared at narrower widths where the two fixed columns and intrinsic input sizing could force fields into each other.
  - The fix needed to preserve the existing side-by-side layout on larger screens without changing validation or submit behavior.
- scope: `frontend/src/components/AddLocationForm.tsx`.
- decisions: Switched the coordinate grid to one column by default and two columns from the small breakpoint, and added `w-full min-w-0` constraints on both labels and number inputs so each field stays inside its grid track.
- risks: Very narrow screens now stack coordinates vertically, which is intentional but slightly changes visual density in the sidebar.
- verification: `npm test`, `npm run build`.
- follow-up: None.

## 2026-05-22 | branch `main` | commit `pending` | use my location and forecast areas

- status: implemented
- implementation request: Add a default-on "Use my location" flow that resolves the browser position to the nearest Singapore forecast area, deduplicates against saved locations, and keeps manual coordinate entry available with the same snapping pipeline.
- implementation challenges:
  - The backend already knew how to match a coordinate to a forecast area inside the weather client, but the locations router still needed its own cached forecast-areas endpoint for the frontend to reuse.
  - Duplicate prevention had to move onto normalized 4-decimal coordinates so the manual and geolocation paths would agree on what counts as the same location.
  - The new add flow needed to stay accessible and transparent, so the component had to juggle busy states, inline status messaging, and fallback explanations without turning into a modal workflow.
- scope: `backend/src/weather.ts`, `backend/src/routes/locations.ts`, `backend/src/routes/locations.test.ts`, `frontend/src/api.ts`, `frontend/src/locationHelpers.ts`, `frontend/src/components/AddLocationForm.tsx`, `frontend/src/state/store.tsx`, `frontend/src/types.ts`, `README.md`.
- decisions: Added `GET /api/locations/forecast-areas` with TTL caching and stale fallback, normalized create coordinates to 4 decimals before persistence, introduced shared frontend helpers for snapping and duplicate checks, and made the add form geolocation-first with a manual fallback path.
- risks: The frontend still falls back to a direct create when forecast metadata is unavailable and the coordinate is within Singapore bounds, so stale or missing area metadata can slightly change the wording of the success state.
- verification: `npm test -- --run backend/src/routes/locations.test.ts`, `npm run build`, `npm test`.
- follow-up: If the product should surface richer analytics, thread the source and fallback flags from the new flow into the existing logging pipeline.

## 2026-05-21 | branch `main` | commit `pending` | add workspace ESLint setup

- status: implemented
- implementation request: Install and configure ESLint for the monorepo so it lints both the React frontend and TypeScript backend, and expose a root `lint` script.
- implementation challenges:
  - The repo already had ESLint 9 and plugin dependencies but no active config file or lint script, so a flat config had to be added at the workspace root.
  - Installing `@eslint/js` without a version pin tried to pull v10, which conflicts with ESLint 9. The package had to be aligned to the v9 line.
  - Enabling lint surfaced two pre-existing unused-symbol errors, requiring a small frontend cleanup and an underscore-ignore convention for intentionally unused middleware args.
- scope: `eslint.config.js` (new), `package.json`, `frontend/src/components/Hero.tsx`.
- decisions: Use a single root flat config covering `backend/**/*.ts` and `frontend/**/*.{ts,tsx}`, include React and React Hooks rules for frontend files, and add underscore-based ignore patterns for `@typescript-eslint/no-unused-vars`.
- risks: The underscore-ignore convention can hide accidental unused variables if they are intentionally prefixed; this trade-off is accepted for Express-style handler signatures.
- verification: `npm run lint`, `npm test`, `npm run build`.
- follow-up: Optionally add stricter type-aware linting (`typescript-eslint` type-checked configs) once per-package `tsconfig` project references are standardized for ESLint.

## 2026-05-18 | branch `main` | commit `pending` | add Apple Weather-style MapCard

- status: implemented
- implementation request: Add a `MapCard` component using `react-leaflet` that renders a dark-themed Leaflet map inside a glassmorphism tile, shows all saved locations as custom pill-shaped pins, supports fullscreen expand/shrink, and integrates into the Hero for both the selected and no-selection states.
- implementation challenges:
  - Leaflet requires its CSS to be imported before the app CSS, otherwise tiles render as overlapping squares. The import was added to `main.tsx` ahead of `index.css`.
  - Two simultaneous `MapContainer` instances cause duplicate resource allocation, so the card's `MapInner` is replaced with a placeholder `<div>` while the fullscreen modal is open.
  - Leaflet's default `iconAnchor` must be zeroed out for `DivIcon` to avoid the pin bubble sitting underground.
- scope: `frontend/src/components/MapCard.tsx` (new), `frontend/src/components/icons.tsx`, `frontend/src/components/Hero.tsx`, `frontend/src/main.tsx`, `frontend/package.json`.
- decisions: CartoDB DarkMatter tile layer (free, no key, matches dark theme). Card zoom 11, fullscreen zoom 12. Pin click calls `select(loc.id)`. Condition truncated at 16 chars. Temperature omitted from pill when value is `"--°"`.
- verification: `npm test` — 9/9 pass. `npm run build` — compiles cleanly.
- follow-up: Could add a "fit bounds" action so the map always frames all pins. Zoom controls are intentionally hidden but scroll-zoom still works.

## 2026-05-18 | branch `main` | commit `a54863e` | preserve dashboard values across partial refreshes

- status: implemented
- implementation request: Stop the dashboard from losing previously shown weather values on successive refreshes when the upstream provider returns only a partial snapshot for a location.
- implementation challenges:
  - The refresh route replaced the entire stored weather snapshot, so any temporarily missing upstream reading immediately blanked out cards that had valid values from the previous refresh.
  - The fix needed to preserve older values only for fields omitted by the latest refresh, without blocking legitimate new readings or breaking the backend snapshot contract.
  - The merge helper initially used the runtime weather snapshot type for both inputs, but the stored database snapshot is nullable in a few places, which caused a backend TypeScript build error that had to be resolved before the change could ship.
- scope: `backend/src/routes/locations.ts`, `backend/src/routes/locations.test.ts`.
- decisions: Merge refresh results with the persisted snapshot before saving, keep prior readings and forecast arrays when the latest refresh omits them, and add a route-level regression test that simulates a partial follow-up refresh.
- risks: Holding on to the last good reading can mask a genuinely unavailable upstream metric for one refresh cycle, so any future UX that needs to distinguish "stale" from "missing" will need explicit metadata instead of relying on nulls alone.
- verification: `npm test -- backend/src/routes/locations.test.ts`, `npm run build`.
- follow-up: If the product should surface freshness per tile, extend the snapshot model to track per-reading timestamps or stale-state flags instead of only merged values.

## 2026-05-17 | branch `main` | commit `aba619a` | air quality feature completion

- status: implemented
- implementation request: Complete the air quality feature end to end by wiring the backend weather client to retrieve PSI and PM2.5 data from the realtime data.gov.sg APIs and expose those values through the existing weather snapshot flow.
- implementation challenges:
  - The weather client already had a dedicated air-quality helper, but `getCurrentWeather` was not including it in the composed snapshot, so the fetch path existed without reaching the UI or persistence layers.
  - The latest timestamp logic needed to account for the air-quality response so the snapshot reflected the freshest available reading across all sources.
  - Test coverage had to be updated to cover both the new requests and the merged PSI/PM2.5 output while keeping the existing two-hour forecast behavior intact.
- scope: `backend/src/weather.ts`, `backend/src/weather.test.ts`.
- decisions: Fold the air-quality fetch into the same `Promise.all` composition used for the other realtime readings, surface PSI/PM2.5/region on the returned `WeatherSnapshot`, and update the backend tests to lock the new behavior in.
- risks: Any consumer that assumes `observed_at` comes only from the forecast or non-air-quality readings may see a later timestamp once PSI or PM2.5 updates arrive.
- verification: `npm test -- --run backend/src/weather.test.ts`, `npx tsc -p backend/tsconfig.json --noEmit`.
- follow-up: If any UI copy or dashboard summary should highlight the new air-quality values more prominently, update the frontend presentation separately.

## 2026-05-17 | branch `main` | commit `c28c5ea` | weather metrics expansion

- status: implemented
- implementation request: Add weather metric support so the app can read and expose wind, UV, temperature, rainfall, and humidity data.
- implementation challenges:
  - The weather payload needed to be normalized into consistent metric readings so downstream code could consume the new fields without special cases.
  - Test coverage had to be updated alongside the data model changes so the metric extraction behavior stayed predictable.
- scope: `backend/src/weather.ts`, `backend/src/weather.test.ts`.
- decisions: Extend the weather transformation layer to include the new metric readings and lock the expected shape in tests.
- risks: Any UI or API consumer that still assumes the older weather shape may need a follow-up update to use the added metrics.
- verification: `npm test`, `npm run build`.
- follow-up: Wire the new metrics through any frontend views or API mappings that should display them.

## 2026-05-17 | branch `main` | commit `74e0e5c` | two-hour forecast-first dashboard

- status: implemented
- implementation request: Complete the condition card flow using the existing `two-hr-forecast` backend integration, make the dashboard display forecast data correctly even when realtime sensor readings are absent, and stabilize local dev startup after the Vite HMR websocket port conflict.
- implementation challenges:
  - The original UI assumed temperature was the primary hero value, but the `two-hr-forecast` endpoint does not provide temperature. That produced a technically correct but misleading `--°` state.
  - The backend saved `condition` and `valid_period_text`, but the forecast strip rendered from `forecast_periods`, so the dashboard still showed "unavailable" even when two-hour forecast data existed.
  - Older saved snapshots in SQLite would not immediately have the new `forecast_periods` shape, so the frontend needed a safe fallback derived from existing fields.
  - The dev server used Vite middleware mode without attaching HMR to the parent HTTP server, which caused a separate websocket bind on port `24678` and local startup failures.
  - The broader dashboard includes many secondary tiles that remain empty until other data sources are integrated, so the UI had to hide or downplay unavailable sections instead of making the page look broken.
- scope: `backend/src/server.ts`, `backend/src/weather.ts`, `backend/src/weather.test.ts`, `frontend/src/components/Hero.tsx`, `frontend/src/components/HourlyStrip.tsx`, `frontend/src/components/SidebarCard.tsx`.
- decisions: Populate `forecast_periods` from the two-hour payload, keep current-condition sensor reads as optional enrichment, switch the hero and sidebar to a forecast-first presentation when temperature is unavailable, and attach Vite middleware HMR to the shared Node HTTP server.
- risks: Existing stored rows may still need a manual refresh to hydrate newly added snapshot fields. The UI now conditionally hides empty sections, so later data-source additions need to preserve these fallback paths.
- verification: `npm test`, `npm run build`.
- follow-up: If the app should show temperature, humidity, rainfall, UV, wind, or air quality by default, the backend still needs to compose and persist those sources consistently for every refresh path.

## 2026-05-17 | branch `main` | commit `cd53906` | delete location

- status: implemented
- implementation request: Add end-to-end delete support for saved locations so a user can remove a location from the sidebar and keep the frontend, backend, and database state in sync.
- implementation challenges:
  - No single-location delete path existed in the backend. The route needed a DB helper so it could return `404` for a missing id and `204` for a successful delete.
  - The location card is already clickable for selection, so the delete control had to stop event propagation to avoid accidental selection on delete clicks.
  - The delete affordance needed to be visible without overpowering the card, so it was placed as a compact top-right cross button with absolute positioning.
  - Deleting the selected location required store-level recovery logic. After reload, selection must move to the next available location or clear entirely when the list becomes empty.
  - The existing backend tests used HTTP-style integration helpers that tried to bind a socket in this sandbox, so the tests had to be rewritten to exercise the router directly.
  - The README still described delete as a future task, so the docs had to be updated to match the implemented behavior.
- scope: `backend/src/db.ts`, `backend/src/routes/locations.ts`, `backend/src/routes/locations.test.ts`, `frontend/src/api.ts`, `frontend/src/state/store.tsx`, `frontend/src/components/SidebarCard.tsx`, `frontend/src/types.ts`, `README.md`.
- decisions: Added a dedicated delete helper, exposed `DELETE /api/locations/:locationId`, wired a store action to reload and reselect after delete, and used a top-right cross button inside the card.
- risks: The selected item can become stale after deletion unless the store re-evaluates selection. The delete button must stop propagation inside a clickable card.
- verification: `npm test`, `npm run build`.
- follow-up: None.

## Entry Template

## YYYY-MM-DD | branch `...` | commit `...` | summary

- status: `implemented`, `in progress`, `reviewed`, or `blocked`
- implementation request: What is being built?
- implementation challenges:
  - What made the work harder than expected?
  - What needed careful coordination across layers?
- scope: Which files or layers change?
- decisions: What approach was chosen?
- risks: What could regress?
- verification: What was run to validate the change?
- follow-up: What remains open?

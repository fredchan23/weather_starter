# Implementation Plan: Migrate Weather Starter to Netlify

## Overview

Move the app from a single long-running Express process (serving both `/api/*` and
the SPA, backed by a local SQLite file) to Netlify's model: a **static SPA on the
CDN + the existing Express app wrapped in one Netlify Function**, with the local
SQLite file replaced by **Turso / libSQL** (SQLite-compatible, HTTP driver suited to
serverless). The existing Google Compute Engine deployment path is removed so Netlify
becomes the sole target. The app is reached at `https://weather.assurecraft.org`
(Cloudflare DNS → Netlify).

The `createApp()` factory, the injectable router, and the `sqlite-proxy` abstraction
make this mostly an adapter-and-driver swap rather than a rewrite. Router-level tests
stay valid.

## Architecture Decisions

1. **One Function wrapping the whole Express app** (via `serverless-http`), not a
   per-route rewrite. Preserves all routes, middleware, session logic, and tests.

2. **Turso / libSQL** as the database, swapped in `db.ts` via `drizzle-orm/libsql`.
   Schema is already SQLite, so no SQL dialect port. Credentials come from
   `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (a database auth token, not a platform
   API token).

3. **Migrations run out of the request path** — via a build/one-off script against
   the Turso URL, never at module load on every cold start.

4. **`netlify.toml` owns routing** — redirect `/api/*` and `/health` to the function;
   SPA fallback `/* -> /index.html`. Frontend keeps using relative `/api`, so no
   frontend URL changes.

5. **Static serving in `server.ts` becomes inert on Netlify** — the CDN serves
   `frontend/dist`; the function only handles the API (`serveFrontend: false`).

6. **GCP path removed entirely** — scripts, workflow, and deploy/proxy docs deleted;
   Netlify is the single documented target. Historical incident docs (RCA/ADR) are
   kept as history.

7. **Known degradations accepted**: in-memory rate limiter and forecast-area cache
   reset per cold start. Documented as follow-ups (could later be backed by
   Turso / Netlify Blobs).

---

## Dependency Graph

```
Turso DB provisioned + schema migrated
        |
        +-- db.ts driver swap (sqlite-proxy -> libsql)
                |
                +-- Function entrypoint (serverless-http wrap of createApp)
                        |
                        +-- netlify.toml (build + redirects)
                        |       |
                        |       +-- Frontend build output served by CDN
                        |
                        +-- Migration-at-load removed / guarded
                                |
                                +-- Deploy + custom domain + verify + docs

(Task 0: remove GCP -- independent, can run any time)
```

---

## Task 0: Strip the GCP deployment path

**Description:** Remove the Google Compute Engine deployment path so Netlify is the
sole target. Independent of all other tasks; can run first.

**Acceptance criteria:**
- [ ] Deleted: `scripts/gcp/` (all scripts), `.github/workflows/deploy-vm.yml`,
  `docs/compute_engine.md`, `docs/caddy_setup.md`
- [ ] Removed `gcp:vm:*` scripts from `package.json`
- [ ] Removed Deployment/GCP sections and `gcp:vm:*` command lines from `README.md`
  (incl. the GCP mention near the top)
- [ ] Kept as history: `docs/adr-2026-05-31-ssh-access-recovery-gce-vm.md`,
  `docs/rca-2026-05-31-gce-vm-ssh-npm-recovery.md`
- [ ] `grep -ri gcp` returns only the kept RCA/ADR history docs

**Verification:**
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0

**Dependencies:** None

**Files touched:** `scripts/gcp/*` (delete), `.github/workflows/deploy-vm.yml`
(delete), `docs/compute_engine.md` (delete), `docs/caddy_setup.md` (delete),
`package.json`, `README.md`

**Estimated scope:** M

---

## Phase 1: Database Portability

### Task 1: Provision Turso and add the libSQL driver

**Description:** Create a Turso database, capture `TURSO_DATABASE_URL` +
`TURSO_AUTH_TOKEN` into `.env`, and add `@libsql/client`. Add `.env.example` with the
two key names (no values).

**Acceptance criteria:**
- [ ] `@libsql/client` added to dependencies; `npm install` clean
- [ ] `.env` contains non-empty `TURSO_DATABASE_URL` (`libsql://...`) and
  `TURSO_AUTH_TOKEN` (`eyJ...`)
- [ ] `.env.example` documents both keys with empty values
- [ ] A connectivity check (`SELECT 1`) succeeds against the remote DB

**Verification:**
- [ ] Throwaway connect script prints the `SELECT 1` result
- [ ] `npm install` exits 0

**Dependencies:** None (requires the user to create the Turso account + paste creds)

**Files touched:** `package.json`, `.env` (local, gitignored), `.env.example` (new)

**Estimated scope:** S

---

### Task 2: Swap `db.ts` to the libSQL driver

**Description:** Replace `node:sqlite` `DatabaseSync` + the `sqlite-proxy` callback
with `drizzle-orm/libsql`. Keep every exported helper
(`listLocations`, `createLocation`, `getLocation`, `deleteLocation`,
`updateWeather`, `resetStore`) signature-identical. Remove `mkdirSync` / local-file
path logic and the module-load `migrate()` call (moves to Task 3). Tests use a local
file URL (`file:weather.db` / `:memory:`); production uses the remote Turso URL.

**Acceptance criteria:**
- [ ] No remaining reference to `node:sqlite` or `drizzle-orm/sqlite-proxy`
- [ ] Connection reads `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (falls back to a
  local file URL when unset, for tests/dev)
- [ ] All exported helper signatures unchanged
- [ ] Existing tests pass against libSQL

**Verification:**
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0

**Dependencies:** Task 1

**Files touched:** `backend/src/db.ts`, `drizzle.config.ts`

**Estimated scope:** M

---

### Task 3: Migration script for Turso

**Description:** Add a script that applies `backend/drizzle/*` migrations to the
configured libSQL URL, replacing the at-startup `migrate()`. Wire it as an npm script.

**Acceptance criteria:**
- [ ] Running it against an empty Turso DB creates the `locations` table + unique index
- [ ] Safe to re-run (idempotent against already-applied migrations)
- [ ] `package.json` exposes `db:migrate:remote` (or similar)

**Verification:**
- [ ] Script run exits 0 against a fresh Turso DB
- [ ] `npm run doctor` (pointed at the Turso DB) lists locations

**Dependencies:** Task 2

**Files touched:** `scripts/migrate.mjs` (new), `package.json`

**Estimated scope:** S

---

### Checkpoint A — Data Layer

- [ ] `npm test` and `npm run build` pass
- [ ] CRUD works end-to-end against remote Turso locally (`npm run dev` with Turso env)
- [ ] No code path references the local `weather.db` file at runtime

---

## Phase 2: Netlify Function + Routing

### Task 4: Function entrypoint wrapping Express

**Description:** Add `netlify/functions/api.ts` that calls
`createApp({ serveFrontend: false })` once at module scope (reused across warm
invocations) and exports a `serverless-http` handler. Add `serverless-http`. Confirm
`sessionMiddleware` still sets the `wsid` cookie correctly behind the function
(path `/`).

**Acceptance criteria:**
- [ ] `netlify dev` serves `/api/locations`, `/health`, and `/api/locations/forecast-areas`
- [ ] First request sets `Set-Cookie: wsid=...`; subsequent requests reuse it
- [ ] App is created once per warm container, not per request

**Verification:**
- [ ] `npx netlify dev` + curl the endpoints succeed
- [ ] `wsid` cookie present in response headers

**Dependencies:** Task 2

**Files touched:** `netlify/functions/api.ts` (new), `package.json`

**Estimated scope:** M

---

### Task 5: `netlify.toml` build + redirects

**Description:** Configure build command (`npm run build`),
`publish = frontend/dist`, the functions directory, esbuild bundler, pinned Node
version, and redirects: `/api/*` and `/health` -> `/.netlify/functions/api`;
SPA fallback `/* -> /index.html` (status 200).

**Acceptance criteria:**
- [ ] Production-style build serves the SPA from the publish dir and the API from the
  function with no frontend path changes
- [ ] `/health` and `/api/*` resolve to the function; all other paths serve the SPA

**Verification:**
- [ ] `npx netlify build` exits 0
- [ ] `npx netlify dev` serves SPA + API together

**Dependencies:** Task 4

**Files touched:** `netlify.toml` (new)

**Estimated scope:** S

---

### Task 6: Production hardening of `server.ts` for the function context

**Description:** Ensure no HTTP listener starts under Netlify (the
`import.meta.url === argv[1]` guard already prevents it — verify), make
`serveFrontend: false` the function default, and set CORS/CSP `connect-src` and
cookie attributes appropriate to the Netlify/custom-domain origin via env. Since SPA
and API share one origin, CORS is not triggered in normal use; `ALLOWED_ORIGINS`
stays optional.

**Acceptance criteria:**
- [ ] Function logs show no `server.listen`
- [ ] Security headers (helmet CSP) correct for the deployed HTTPS origin
- [ ] Cookie attributes valid for HTTPS (`SameSite=Lax`; `Secure` in production)

**Verification:**
- [ ] `npm run build` exits 0
- [ ] Manual header/cookie check against `netlify dev`

**Dependencies:** Task 4

**Files touched:** `backend/src/server.ts` (minimal), env config

**Estimated scope:** S

---

### Checkpoint B — Runs on Netlify Locally

- [ ] `npx netlify dev` serves SPA + all API routes against Turso
- [ ] Create / list / refresh / delete a location works through the function
- [ ] Session cookie persists across requests

---

## Phase 3: Deploy, Domain, Verify, Document

### Task 7: First deploy + env wiring

**Description:** Link the repo to a Netlify site, set env vars
(`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `WEATHER_API_KEY`, `NODE_ENV=production`,
and `ALLOWED_ORIGINS` if ever needed), trigger a deploy, and run remote migrations
against the production Turso DB.

**Acceptance criteria:**
- [ ] Public `*.netlify.app` URL serves the app
- [ ] A location can be created and survives a page reload (data persists in Turso)

**Verification:**
- [ ] `/health` and `/api/locations` respond on the deployed URL
- [ ] create -> reload persists

**Dependencies:** Task 5, Task 6

**Files touched:** Netlify dashboard / `netlify env:` (no repo files)

**Estimated scope:** S

---

### Task 8: Connect custom domain `weather.assurecraft.org`

**Description:** Add the domain in Netlify, create the Cloudflare DNS record
(CNAME `weather` -> `<site>.netlify.app`, DNS-only / grey cloud), confirm Netlify
provisions HTTPS, and set it as the primary domain. Optionally re-enable the
Cloudflare proxy with SSL/TLS mode Full (strict). See the "Custom Domain" appendix.

**Acceptance criteria:**
- [ ] `https://weather.assurecraft.org` serves the app with a valid certificate
- [ ] `*.netlify.app` redirects to the custom domain
- [ ] `http -> https` redirect works

**Verification:**
- [ ] `dig +short weather.assurecraft.org` resolves to the Netlify target
- [ ] `curl -I https://weather.assurecraft.org/health` returns 200 with a valid cert

**Dependencies:** Task 7

**Files touched:** Netlify + Cloudflare dashboards (no repo files)

**Estimated scope:** S

---

### Task 9: Docs + changelog

**Description:** Add a Netlify deployment section to `README.md` and `CLAUDE.md`
(commands, env vars, `netlify dev`, Turso setup, custom domain). Add `docs/netlify.md`.
Append the dated entry to `docs/exercise_notes.md` per the changelog convention.

**Acceptance criteria:**
- [ ] A fresh reader can deploy from the docs alone
- [ ] README/CLAUDE reflect Netlify as the sole target (no stale GCP references)
- [ ] `docs/exercise_notes.md` has the dated migration entry

**Verification:**
- [ ] `npm run lint` exits 0
- [ ] Doc review

**Dependencies:** Task 8

**Files touched:** `README.md`, `CLAUDE.md`, `docs/netlify.md` (new),
`docs/exercise_notes.md`

**Estimated scope:** S

---

### Checkpoint C — Complete

- [ ] `https://weather.assurecraft.org` works end-to-end with persistent data
- [ ] `npm test`, `npm run build`, `npm run lint` all pass
- [ ] Docs updated; changelog entry added

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `node:sqlite` / `DatabaseSync` unavailable in the Lambda runtime | High | Task 2 removes it in favor of `@libsql/client` (pure JS, HTTP) |
| Migration-at-module-load runs per cold start (slow/races) | Med | Task 3 moves migrations to a build/one-off script |
| Cloudflare orange-cloud blocks Netlify cert issuance | Med | Provision cert with grey cloud first; flip to orange + Full (strict) after |
| Cookie `Secure`/`SameSite`/path differs behind the function | Med | Task 6 sets attributes for the HTTPS origin; verified in Checkpoint B |
| Function bundling misses ESM/`drizzle` deps | Med | Use Netlify esbuild bundler; verify with `netlify build` (Task 5) |
| In-memory rate limiter + forecast cache don't span invocations | Low | Documented; follow-up to back with Turso/Blobs if needed |

## Open Questions

1. Remove the kept GCP history docs (RCA/ADR) too, or leave them as history? (Default: keep.)
2. Keep Cloudflare DNS-only (simplest, Netlify TLS) or proxy through Cloudflare
   (orange cloud, Full strict)? (Default: DNS-only.)

---

## Appendix: Custom Domain (Cloudflare DNS -> Netlify)

**1. Netlify** — Domain management -> Add a domain -> `weather.assurecraft.org`.
Note the CNAME target it shows (`<site>.netlify.app`).

**2. Cloudflare** — DNS -> Records -> Add record:
- Type `CNAME`, Name `weather`, Target `<site>.netlify.app`
- Proxy status **DNS only (grey cloud)** — lets Netlify issue the Let's Encrypt cert
- TTL Auto

**3. Netlify** — HTTPS provisions automatically within minutes. Set the custom domain
as primary (auto-redirects http->https and netlify.app->custom domain).

**Optional (Cloudflare proxy / orange cloud)** — only after the cert is green:
flip the record to Proxied, set SSL/TLS -> Overview -> **Full (strict)** (never
"Flexible"), optionally enable Always Use HTTPS. If API data looks stale, add a
Cloudflare cache rule to **bypass cache** for `weather.assurecraft.org/api/*`.

**Verify:**
```
dig +short weather.assurecraft.org
curl -I https://weather.assurecraft.org/health
```

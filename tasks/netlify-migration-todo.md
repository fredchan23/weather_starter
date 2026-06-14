# Todo: Migrate Weather Starter to Netlify

## Task 0 — Strip the GCP deployment path (independent)
- [ ] Delete `scripts/gcp/`, `.github/workflows/deploy-vm.yml`, `docs/compute_engine.md`, `docs/caddy_setup.md`
- [ ] Remove `gcp:vm:*` scripts from `package.json`
- [ ] Remove Deployment/GCP sections + command lines from `README.md`
- [ ] Keep RCA/ADR history docs; `grep -ri gcp` returns only those
- [ ] Verify: `npm run lint` + `npm run build` exit 0

---

## Phase 1 — Database Portability

- [ ] **Task 1** — Provision Turso + add libSQL driver
  - Create Turso DB; put real `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in `.env`
  - Add `@libsql/client`; add `.env.example`
  - Verify: `SELECT 1` connectivity check; `npm install` clean

- [ ] **Task 2** — Swap `db.ts` to libSQL driver
  - Replace `node:sqlite`/`sqlite-proxy` with `drizzle-orm/libsql`
  - Keep all helper signatures; remove module-load `migrate()` and file-path logic
  - Verify: `npm test` + `npm run build` exit 0

- [ ] **Task 3** — Migration script for Turso
  - Add `scripts/migrate.mjs` + `db:migrate:remote` npm script
  - Verify: creates `locations` table on fresh Turso DB; `npm run doctor` lists locations

### Checkpoint A — Data Layer
- [ ] `npm test` + `npm run build` pass
- [ ] CRUD works against remote Turso via `npm run dev`
- [ ] No runtime reference to local `weather.db`

---

## Phase 2 — Netlify Function + Routing

- [ ] **Task 4** — Function entrypoint wrapping Express
  - `netlify/functions/api.ts`: `createApp({ serveFrontend: false })` + `serverless-http`
  - Verify: `netlify dev` serves API; `wsid` cookie set

- [ ] **Task 5** — `netlify.toml` build + redirects
  - Build cmd, `publish=frontend/dist`, functions dir, esbuild, Node pin
  - Redirects: `/api/*` + `/health` -> function; `/* -> /index.html` (200)
  - Verify: `netlify build` + `netlify dev` exit 0

- [ ] **Task 6** — Harden `server.ts` for function context
  - No `server.listen`; `serveFrontend:false` default; CSP/cookie for HTTPS origin
  - Verify: `npm run build` exit 0; header/cookie check

### Checkpoint B — Runs on Netlify Locally
- [ ] `netlify dev` serves SPA + API against Turso
- [ ] Create/list/refresh/delete works through function
- [ ] Session cookie persists

---

## Phase 3 — Deploy, Domain, Verify, Document

- [ ] **Task 7** — First deploy + env wiring
  - Link site; set env vars; deploy; run remote migrations
  - Verify: `*.netlify.app` works; create->reload persists

- [ ] **Task 8** — Custom domain `weather.assurecraft.org`
  - Netlify add domain; Cloudflare CNAME `weather` -> `<site>.netlify.app` (grey cloud)
  - Confirm HTTPS; set primary; (optional) orange cloud + Full strict
  - Verify: `dig` resolves; `curl -I https://weather.assurecraft.org/health` 200

- [ ] **Task 9** — Docs + changelog
  - README + CLAUDE Netlify sections; `docs/netlify.md`; `docs/exercise_notes.md` entry
  - Verify: `npm run lint` exit 0

### Checkpoint C — Complete
- [ ] Custom domain works end-to-end with persistent data
- [ ] `npm test` + `npm run build` + `npm run lint` pass
- [ ] Docs + changelog updated

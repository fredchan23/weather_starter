# ADR-004: Migrate Deployment from a Compute Engine VM to Netlify + Turso

## Status
Accepted

## Date
2026-06-14

## Context

The app previously ran as a single long-lived Node process on a Google Compute
Engine (GCE) virtual machine, serving both the API and the React SPA, with a local
SQLite file (`backend/weather.db`) as its database. We decided to move to **Netlify**
as the sole deployment target, with **Turso** as the database, and to serve the app at
`https://weather.assurecraft.org` via Cloudflare DNS.

This ADR documents *why* the migration required the specific changes it did. It is
written to be readable by someone new to serverless deployment — most of the work was
not "porting code" but adapting to a fundamentally different runtime model. Each
problem we hit teaches a concept worth understanding.

---

## Background concepts (read this first)

### What is a "serverless function"?
On the old VM, one Node process started once and stayed running for days, holding the
database connection and the HTTP server in memory. "Serverless" flips that model: there
is **no always-on server**. Instead, the platform runs your code **on demand**, once
per request (or per burst of requests), inside a short-lived, isolated container, then
throws it away. You don't manage a machine; you hand the platform a **function**
(`handler(event) → response`) and it runs it when a request arrives.

Netlify Functions run on **AWS Lambda** under the hood. Two consequences shaped this
migration:
1. **The filesystem is read-only** (except a small `/tmp`), and nothing persists
   between invocations. A local SQLite file is impossible.
2. **"Cold starts":** the first request after idle has to spin up a fresh container and
   re-run all module-load code. Anything slow or crashy at module load hurts every cold
   start — or, if it throws, breaks the function entirely.

### What is Netlify, concretely, for this app?
Netlify gives us two things from one repo:
- A **CDN** that serves our static frontend (`frontend/dist`, the built React app).
- A **Functions** runtime that runs our backend as a serverless function.
`netlify.toml` wires them together with **redirects**: `/api/*` and `/health` go to the
function; everything else serves the SPA.

### What is Turso?
[Turso](https://turso.tech) is a hosted database built on **libSQL** (a fork of SQLite).
Crucially, it speaks **SQLite's SQL dialect** but you connect to it **over the network
(HTTP)** instead of opening a local file. That makes it usable from a serverless
function, which has no persistent disk. Because it is SQLite-compatible, our existing
schema and Drizzle ORM code barely changed — we swapped the *driver*, not the queries.

### What is ESM vs CJS?
Two ways JavaScript modules import each other:
- **CJS (CommonJS):** the old Node style — `const x = require('y')` /
  `module.exports = ...`. Synchronous.
- **ESM (ECMAScript Modules):** the modern standard — `import x from 'y'` /
  `export ...`. Files are ESM if they end in `.mjs`, or if the nearest `package.json`
  has `"type": "module"` (ours does).

This distinction caused several of our deploy failures, because our **source is ESM**
but Netlify's bundler emits **CJS**, and the two have incompatible rules (see below).

### What is "top-level await"?
`await` used directly at the top of a module, outside any function:
```js
const data = await migrate(db);   // top-level await
```
It is **only legal in ESM**, never in CJS. So any file using it forces the whole module
to be ESM. This collided with the CJS bundler.

### What is ZISI (zip-it-and-ship-it)?
`@netlify/zip-it-and-ship-it` ("ZISI") is **the tool Netlify uses to package your
function for deployment**. It takes `netlify/functions/api.ts`, runs it through
**esbuild** (a bundler) to inline/compile the code, decides whether to output CJS or
ESM, copies any declared external dependencies, and zips the result for AWS Lambda.

The key lesson: **what runs in production is ZISI's output, not your source files.**
Most of our failed deploys were caused by the *difference* between how the code behaves
when run directly (e.g. `node`, `tsx`, `npm test`) and how it behaves after ZISI bundles
it. The breakthrough in debugging was running ZISI **locally** and executing its output,
instead of testing the source.

### What is a bundler / "external" dependency?
A **bundler** (esbuild) follows every `import` and stitches the code into a small number
of files. By default it tries to inline `node_modules` too. Marking a package as
**external** tells the bundler "don't inline this — leave the `require`/`import` in place
and ship the package alongside, so Node loads it normally at runtime." This matters for
packages that can't be bundled (native binaries) or shouldn't be (CommonJS internals).

---

## Decision

1. **Wrap the existing Express app in a single Netlify Function** using
   `serverless-http`, rather than rewriting each route as its own function. This
   preserves all routing, middleware, session logic, and the existing router-level tests.
2. **Replace local SQLite with Turso (libSQL)**, swapping the Drizzle driver in
   `db.ts`. Connect to Turso in production; fall back to a local file for dev/tests.
3. **Run database migrations out-of-band** (`npm run db:migrate:remote`), never at
   module load on the request path.
4. **Remove the Google Compute Engine deployment path** entirely; Netlify is the sole
   target.

---

## Alternatives considered

### Database: Netlify DB (Neon Postgres) instead of Turso
- Pros: Netlify-native, auto-provisioned, stays inside one vendor.
- Cons: Postgres is a **different SQL dialect** from SQLite. We'd have to port the
  schema (autoincrement → serial, JSON columns, type changes) and rewrite `db.ts`.
- Rejected: Turso is SQLite-compatible, so the change was a driver swap, not a rewrite.

### Backend: rewrite each route as a separate Netlify Function
- Pros: "Idiomatic" serverless; smaller functions.
- Cons: Loses the shared Express middleware stack (helmet, rate limiting, session
  cookie) and breaks the existing test setup. Much more code.
- Rejected: `serverless-http` lets one function host the whole Express app with no logic
  changes.

### Keep SQLite, bundled read-only
- Rejected: serverless functions can't persist writes; user data would vanish on every
  cold start.

---

## Consequences — the problems we hit and what they taught us

These are listed in the order we encountered them, because each was a distinct lesson.
This sequence is the real value of this document.

### 1. Build failed: `husky: not found`
**Cause:** We set `NODE_ENV=production` in Netlify. With that set, `npm install` **skips
`devDependencies`**. Our `prepare` script runs `husky` (a dev tool for Git hooks), which
was no longer installed → exit code 127 → build aborts.
**Fix:** `"prepare": "husky || true"` (never fail if husky is absent) **and**
`NPM_FLAGS="--include=dev"` in `netlify.toml` so the build still installs the
devDependencies it needs (TypeScript, Vite) despite `NODE_ENV=production`.
**Lesson:** `NODE_ENV=production` has a side effect beyond your code — it changes what
`npm install` installs. Build tooling lives in `devDependencies`, so a production install
omits exactly the tools the build needs.

### 2. Build failed: "potentially exposed secrets — NODE_ENV"
**Cause:** Netlify scans build output for the **values** of your env vars, to catch
secrets accidentally baked into the public frontend. `NODE_ENV`'s value is `production`,
a string that legitimately appears all over a frontend bundle → false positive.
**Fix:** `SECRETS_SCAN_OMIT_KEYS = "NODE_ENV"` — exclude that one key, keep scanning the
rest (so a real leak, e.g. `TURSO_AUTH_TOKEN`, would still be caught).
**Lesson:** Secret scanning matches env-var *values* against build artifacts. It
reassured us that our real secret was **not** leaking (only `NODE_ENV` matched) —
because the Turso token is only read at function runtime, never compiled into the SPA.

### 3. Runtime 502 on every route: `Dynamic require of "http" is not supported`
**Cause:** Our function is ESM, but `express`/`serverless-http` are CJS. When esbuild
**inlines CJS into an ESM bundle**, it replaces `require(...)` with a shim that throws
for Node built-ins like `http`. The function crashed at load → every route returned a
plain-text 502 (the Express app never even ran).
**Fix:** Mark the runtime dependencies as **external** (`external_node_modules` in
`netlify.toml`) so they're not inlined — Node loads them normally, where `require` works.
**Lesson:** A 502 with a `text/plain` body and no JSON is an **infrastructure** error
(the function crashed), not your app's error. `curl -i` the endpoint to read the body —
it often contains the exact stack trace.

### 4. Runtime 502: `Cannot use import statement outside a module`
**Cause:** With deps external, ZISI emitted the function in a form loaded as **CJS**, but
the bundle still contained ESM `import` statements → syntax error at load.
This was a symptom of the deeper conflict in #5.
**Lesson:** Don't trust your own approximation of the bundler. We had been testing with a
hand-rolled esbuild command that didn't match ZISI. The next step fixed that.

### 5. The real root cause: top-level await forces ESM, but ZISI emits CJS
**How we found it:** We ran **ZISI itself locally** (it ships inside `netlify-cli`) and
let it bundle the function. It failed loudly:
```
backend/dist/db.js:46     ERROR: Top-level await is not supported with the "cjs" output format
backend/dist/server.js:172 ERROR: Top-level await is not supported with the "cjs" output format
```
Our code used top-level `await` in two places (the dev/test auto-migration in `db.ts`,
and the standalone-server startup in `server.ts`). Top-level await is ESM-only, so it
forced ESM — but ZISI was emitting CJS. Every prior 502 was a downstream symptom of this
mismatch.
**Fix:**
- `db.ts`: made the local auto-migration **lazy** — run it on first query via an
  `ensureReady()` helper instead of at module top level.
- `server.ts`: wrapped the standalone-run block in an **async IIFE**
  (`void (async () => { ... })()`) so the `await` lives inside a function.
- Guarded `import.meta.url` (it is **empty in CJS**, so
  `fileURLToPath(import.meta.url)` would throw at load).
**Lesson:** The single most useful debugging move was reproducing the **real** build
locally. Running ZISI + executing its CJS output (with a `{"type":"commonjs"}` marker so
Node treats it correctly) turned a slow push-and-pray loop into a fast local one.

### 6. Runtime 502: `ENOENT: mkdir '/var/task/backend/logs'`
**Cause:** `logger.ts` created a `backend/logs/` directory at module load to write log
files. Lambda's filesystem is **read-only** → `mkdirSync` throws → function crashes.
**Fix:** Log to **stdout only** on serverless (detected via `AWS_LAMBDA_FUNCTION_NAME`,
which Lambda always sets), wrapped in a `try/catch` that falls back to stdout if the log
directory can't be created. Netlify captures stdout into its function logs anyway.
**Lesson:** Serverless filesystems are read-only. Any module-load `mkdir`/`writeFile`
will crash the function. Write only to `/tmp`, or not at all — prefer stdout for logs.
(`db.ts`'s local-file `mkdir` was already safe because it's guarded to the non-remote
path, which never runs on Netlify.)

### Other notable consequences
- **Rate limiting needed adapting.** `express-rate-limit` keys on client IP, but behind
  the Netlify proxy there is no socket IP. We set `trust proxy` and key on Netlify's
  `x-nf-client-connection-ip` header (normalized for IPv6).
- **In-memory state resets per cold start.** The rate-limit counters and the
  forecast-area cache live in memory, so they reset whenever a new container starts.
  Acceptable for now; could move to Turso/Netlify Blobs later.
- **Node version.** We had needed Node 24 only for the `node:sqlite` API; after switching
  to `@libsql/client` we pinned Node 22, the newest version Netlify Functions support.
- **Migrations are now a deploy step.** Because migrations don't run automatically against
  Turso, `npm run db:migrate:remote` must be run after generating a new migration.

---

## How to verify locally (the workflow that actually worked)

Testing source code (`npm test`, `tsx`) was necessary but **not sufficient** — it never
reproduced the bundler/runtime failures. The faithful local test was:

1. `npm run build` (produces `backend/dist`, which the function imports).
2. Run **ZISI** (from `netlify-cli`) to bundle `netlify/functions` exactly as Netlify
   does, with the same `external_node_modules`.
3. Drop a `{"type":"commonjs"}` `package.json` next to the output so Node loads the
   `.js` as CJS (Lambda has no parent `"type":"module"`; our repo does, which would
   otherwise mislead the test).
4. Execute the bundled handler with a synthetic Lambda event, with
   `NODE_ENV=production` and `AWS_LAMBDA_FUNCTION_NAME=api` set, so the serverless code
   paths (remote DB, stdout logging, read-only FS) are exercised.

When `/health`, `/api/locations`, and `/api/locations/forecast-areas` all returned `200`
from the ZISI artifact under those env vars, the production deploy succeeded.

## See also
- `docs/netlify.md` — step-by-step deployment + custom-domain guide.
- `netlify.toml` — build config, redirects, external modules, secret-scan/omit settings.
- `backend/src/db.ts`, `backend/src/server.ts`, `backend/src/logger.ts` — the adapted
  modules, each carrying an inline comment explaining the serverless constraint.

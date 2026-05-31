# ADR-001: Security Hardening — Headers, Rate Limiting, Input Validation, and Secret Handling

## Status
Accepted

## Date
2026-06-01

## Context

A security audit of the Express + React weather application identified seven concrete vulnerabilities ranging from high to medium severity. The application is publicly accessible via Caddy reverse-proxy on a GCE VM and accepts unauthenticated API requests from any origin.

The audit surface covered:
- `backend/src/server.ts` — Express app factory and middleware stack
- `backend/src/routes/locations.ts` — All API route handlers
- `backend/src/weather.ts` — Outbound weather API client
- `frontend/src/api.ts` — Frontend fetch helpers
- `package.json` — Dependency audit via `npm audit`

### Findings

#### High severity

**H1 — No security headers.**
The Express app ships no `helmet` middleware and sets no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Strict-Transport-Security` headers. Without these, the app is vulnerable to clickjacking, MIME-type confusion attacks, and has no browser-enforced containment boundary for any future XSS.

**H2 — No rate limiting.**
`POST /api/locations` and `POST /api/locations/:id/refresh` each fan out to ten concurrent HTTP calls to `api-open.data.gov.sg`. There is no throttle on any route. An attacker can exhaust the upstream API key quota, saturate the Node.js event loop with open socket handles, and flood the 30 GB GCP disk via `POST /api/logs`.

**H3 — `drizzle-kit` bundles `esbuild` ≤0.24.2 (GHSA-67mh-4wv8-2f99).**
The dev CORS bypass allows any browser tab open during `npm run db:generate` or `npm run db:migrate` to make cross-origin requests to the esbuild dev server and read its responses, potentially exfiltrating migration SQL.

#### Medium severity

**M1 — `locationId` path parameter not guarded against `NaN` or `Infinity`.**
Routes at `locations.ts:165`, `178`, and `194` call `Number(request.params.locationId)` but never check `Number.isInteger()`. `Number('abc')` produces `NaN`, `Number('')` produces `0`, and `Number('Infinity')` produces `Infinity` — all passed directly to Drizzle bind values with unpredictable SQLite behaviour.

**M2 — `POST /api/logs` metadata field is unvalidated.**
The endpoint (server.ts:48–69) accepts an arbitrary JSON object as `metadata` and logs it via Pino. A deeply nested or very large object blocks the event loop during synchronous serialisation. The endpoint is unauthenticated and publicly accessible.

**M3 — `WeatherProviderError.message` forwarded verbatim to API clients.**
Two 502 paths in `locations.ts` (lines 157 and 212) return `error.message` in the response body. Messages include `'Weather provider rejected request (check API key)'`, which reveals whether an API key is configured and leaks upstream HTTP status detail to callers.

**M4 — No CORS configuration.**
The app serves a same-origin SPA, so the absence of CORS headers is not immediately exploitable. However, there is no defence-in-depth: if the deployment topology changes (CDN-hosted frontend, preview deployments, mobile client), the API would be open to all cross-origin reads.

## Decision

Apply all seven fixes in priority order:

1. Add `helmet` as the first Express middleware (H1).
2. Add `express-rate-limit` with a general API limiter and a stricter mutation limiter on `POST /locations`, `POST /locations/:id/refresh`, and `POST /api/logs` (H2).
3. Upgrade `drizzle-kit` to its latest patch release (H3).
4. Add `Number.isInteger(id) && id >= 1` guard on all three `locationId` routes (M1).
5. Replace `error.message` passthrough in 502 responses with a fixed string; log the original error server-side (M3).
6. Add depth and key-count limits to the `metadata` object accepted by `POST /api/logs` (M2).
7. Add explicit CORS configuration restricted to the same origin by default, configurable via `ALLOWED_ORIGINS` env var (M4).
8. Run `npm audit fix` to resolve `qs` and `ws` moderate CVEs in the Express dependency tree (Low).

## Alternatives Considered

### Defer security hardening to a later milestone
Rejected. H2 is an operational risk on metered GCP infrastructure — a single automated script can exhaust the upstream API key and generate meaningful egress cost. H1 headers take one line to add. The fixes are low-effort relative to the exposure.

### Replace `express-rate-limit` with Caddy-level rate limiting
Caddy does support `rate_limit` via a plugin, but the current `Caddyfile.example` does not use it and the Caddy plugin ecosystem requires additional VM provisioning. Application-level rate limiting is more portable, testable, and does not depend on the reverse-proxy configuration. Both layers can coexist; the application layer comes first.

### Switch from `drizzle-kit` to a different migration tool
Rejected as disproportionate. Upgrading `drizzle-kit` to the latest patch is a one-command fix and addresses the esbuild CORS issue without changing the application's data access layer.

## Consequences

- `helmet` is added as a dev dependency; it sets secure defaults and can be tuned per-directive if the CSP needs to allow Leaflet tile origins.
- `express-rate-limit` is added as a runtime dependency; the mutation limiter is deliberately conservative (10 requests/minute) because each refresh triggers 10 upstream calls.
- `drizzle-kit` upgrade may require migration file regeneration if the output format changes — verify with `npm run db:generate` after upgrading.
- The `ALLOWED_ORIGINS` environment variable is introduced; production deployments must set it explicitly or the CORS middleware will block all cross-origin requests by default (which is the safe default).
- All 502 error responses now return `'Weather data is temporarily unavailable'` regardless of upstream failure mode — original errors are logged at `warn` level with full context.

## References

- GHSA-67mh-4wv8-2f99 — esbuild dev-server CORS bypass
- OWASP A05:2021 Security Misconfiguration (missing headers)
- OWASP A07:2021 Identification and Authentication Failures (missing rate limiting)
- [`docs/exercise_notes.md`](../exercise_notes.md) — implementation log

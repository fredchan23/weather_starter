# Security Hardening Follow-up Plan

**Source:** Code review (7 findings) + CSA Cyber Health Check scan (weather.assurecraft.org, 2026-06-01, score 58%)
**Branch reviewed:** `main` (commit `5555539`)
**Status:** Pending — do NOT start until frontend bug sprint is complete

---

## Phase 1 — Bug Fixes (single PR, `backend/src/server.ts`)

### Task 1 — Fix `app.use` → `app.post` for `/api/logs` mutation limiter
**File:** `backend/src/server.ts:73`
**Change:** `app.use('/api/logs', mutationLimiter)` → `app.post('/api/logs', mutationLimiter)`
**Why:** `app.use` throttles all HTTP methods at 10 req/min, contradicting the "POST-only" comment and the pattern used for the other two mutation routes.
**Acceptance criteria:**
- [ ] `OPTIONS /api/logs` and `GET /api/logs` are no longer subject to the 10 req/min bucket
- [ ] `POST /api/logs` still triggers the mutation limiter
- [ ] `npm test` passes, `npm run build` clean

---

### Task 2 — Move `pinoHttp` before rate limiters
**File:** `backend/src/server.ts:75–77`
**Change:** Move the `if (enableRequestLogging) { app.use(pinoHttp(...)) }` block to before the rate limiter definitions (currently line 54).
**Why:** When a rate limiter sends a 429 without calling `next()`, pino-http never attaches its `res.finish` listener — rate-limited requests produce no log entry, making brute-force/DDoS invisible in logs.
**Acceptance criteria:**
- [ ] A request that hits the rate limit still produces a pino log entry
- [ ] Existing tests pass (they disable request logging, no test changes needed)
- [ ] Manual: hit rate limit with `curl`, confirm log line appears

---

### Task 3 — Resolve double rate-limiting on mutation endpoints (design decision required)
**File:** `backend/src/server.ts:55–73`
**Issue:** Every request to `/api/*` decrements both `apiLimiter` (120/min) AND `mutationLimiter` (10/min). The `RateLimit-*` headers only reflect the last limiter, hiding `apiLimiter` consumption.

**Pick one option before implementing:**
- **Option A (accept + document):** Add a comment noting both limits apply simultaneously. Zero code change.
- **Option B (separate budgets):** Add a `skip` predicate to `apiLimiter` to exclude mutation paths — reads get 120/min, mutations get only 10/min with no double-counting.

**Acceptance criteria (if Option B chosen):**
- [ ] `GET /api/locations` only decrements `apiLimiter`
- [ ] `POST /api/locations` only decrements `mutationLimiter`
- [ ] `RateLimit-Limit` header on each route reflects only its own limiter

---

## Phase 2 — Cleanup (follow-up PR, lower urgency)

### Task 4 — Move `locationId` inside `try` in refresh route
**File:** `backend/src/routes/locations.ts:202`
**Change:** Move `const locationId = Number(request.params.locationId)` inside the `try` block to match GET/DELETE handlers. Use `let locationId: number` before `try` if the catch block needs it for logging.
**Why:** Logic added before `try` in the future would bypass Express's error handler.

---

### Task 5 — Extract shared `parseLocationId` helper
**File:** `backend/src/routes/locations.ts:164, 182, 202`
**Change:** Extract `function parseLocationId(raw: string): number | null` returning the parsed id or null; replace the three identical validation blocks with calls to this helper.
**Why:** The same three-liner appears verbatim three times; already structurally diverged (refresh hoists `locationId` outside `try`).

---

### Task 6 — Remove redundant metadata type guard
**File:** `backend/src/server.ts:112–115`
**Change:** Simplify the ternary to `const metadata = rawMetadata ? Object.fromEntries(Object.entries(rawMetadata as Record<string, unknown>).slice(0, 10)) : undefined;`
**Why:** The block above already returns 422 for non-plain-objects; the full triple-guard re-check on line 113 is dead code.

---

### Task 7 — Deduplicate rate limiter config
**File:** `backend/src/server.ts:55–67`
**Change:** Extract `const limiterBase = { windowMs: 60_000, standardHeaders: 'draft-6', legacyHeaders: false }` and spread into both limiter definitions.
**Why:** Three identical fields must be kept in sync across two definitions.

---

## Phase 3 — Infrastructure (Cloudflare + Registrar, no code changes)

| Finding | Where | Action |
|---|---|---|
| TLS 1.0/1.1 accepted | Cloudflare SSL/TLS settings | Set minimum TLS version to 1.2 |
| Weak CBC cipher suites | Cloudflare SSL/TLS → Cipher Suites | Enable "Modern" cipher suite profile |
| HTTP Compression enabled (BREACH) | Cloudflare Speed → Compression | Disable, or add CSRF tokens on sensitive forms |
| DNSSEC not configured | Domain registrar (assurecraft.org) | Enable DNSSEC signing; publish DS record at registrar |
| Session resumption enabled | Cloudflare SSL/TLS (managed) | Enable session ticket key rotation; reduce ticket lifetime |
| No EV certificate | Certificate authority | Optional — procure EV cert if identity assurance is a requirement |

---

## Suggested Order

```
[NEXT SPRINT] Frontend bug fixes (priority)
     ↓
Phase 1 Tasks 1–3  →  single PR, npm test + npm run build
     ↓
Phase 2 Tasks 4–7  →  follow-up PR
     ↓
Phase 3            →  Cloudflare dashboard + registrar (no code review needed)
```

**Decision needed before Task 3:** Option A vs Option B for double rate-limiting.

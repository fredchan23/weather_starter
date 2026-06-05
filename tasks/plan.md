# Implementation Plan: Location Picker & Per-Browser Sessions

## Overview

Two independent features delivered in sequence. First: add per-browser session isolation to the backend (schema change, DB scoping, cookie middleware). Second: replace the raw lat/lon coordinate form with a friendly Region → Area two-tap picker. The backend lands first because it is a schema change — always migrate before building UI on top.

## Architecture Decisions

1. **Sessions before picker.** Schema changes are irreversible and cascade into tests. Land the backend first so the picker is built against the final data model.

2. **Anonymous UUID cookie — no new dependency.** Express `res.cookie()` sets cookies natively. Reading one named cookie (`wsid`) is a three-line regex on `req.headers.cookie`. `crypto.randomUUID()` is built into Node 15+. No `cookie-parser` package needed.

3. **Unique index changes from `(lat, lon)` to `(session_id, lat, lon)`.** Two users can now both save "Tampines" — that is correct. The `createLocation` duplicate check in `db.ts` must also be scoped to `session_id`.

4. **`REGION_MAP` as a static module.** NEA forecast area names are stable (changed rarely if ever). A hardcoded `frontend/src/regionMap.ts` is zero runtime cost and requires no external API.

5. **Area picker skips the snap.** When a user taps an area chip we already have a `ForecastArea` with known coords — call `create()` directly. `selectNearestForecastArea` is preserved for the geolocation path only (GPS coords still need snapping).

6. **Test session injection via `locals` on mock response.** The test suite uses a hand-rolled `MockResponse`. Adding `locals: Record<string, unknown>` to it matches Express semantics exactly and avoids any router-level workaround.

---

## Phase 1: Backend — Per-Browser Sessions

### Task 1: Add `session_id` to schema and update unique index

**Description:** Edit `backend/src/schema.ts` to add `session_id` to the Drizzle table and change the unique index. Then generate and apply the migration.

**Acceptance criteria:**
- [ ] `sessionId: text('session_id').notNull().default('legacy')` added to the `locations` table
- [ ] Unique index updated from `(latitude, longitude)` to `(session_id, latitude, longitude)`
- [ ] `npm run db:generate` produces a new `.sql` file in `backend/drizzle/`
- [ ] `npm run db:migrate` applies without error

**Verification:**
- [ ] `npm run db:generate` exits 0
- [ ] `npm run db:migrate` exits 0
- [ ] `npm run build` exits 0

**Dependencies:** None

**Files touched:**
- `backend/src/schema.ts`
- `backend/drizzle/<generated>.sql`

**Estimated scope:** XS

**Notes:**
- `WeatherSnapshot` interface in the same file is NOT affected — only the Drizzle table definition.
- If the local `backend/weather.db` exists and was created before this task, run `npm run reset` first to avoid migration conflicts on the unique index change.

---

### Task 2: Scope all DB helpers to `session_id`

**Description:** Update every function in `backend/src/db.ts` that reads or writes `locations` to accept `sessionId: string` and scope its query accordingly. `resetStore` is test-only infrastructure and does not need scoping.

**Acceptance criteria:**
- [ ] `listLocations(sessionId)` returns only rows where `session_id = sessionId`
- [ ] `createLocation(lat, lon, sessionId)` inserts the row with `session_id = sessionId`
- [ ] `getLocation(id, sessionId)` returns `null` for IDs owned by a different session
- [ ] `deleteLocation(id, sessionId)` only deletes rows owned by that session
- [ ] `updateWeather(id, sessionId, weather)` only updates rows owned by that session
- [ ] The duplicate-check query inside `createLocation` is scoped to `session_id`

**Verification:**
- [ ] `npm run build` exits 0 (TypeScript compiles with updated signatures)

**Dependencies:** Task 1

**Files touched:**
- `backend/src/db.ts`

**Estimated scope:** S

---

### Task 3: Cookie middleware + wire session through routes

**Description:** Two changes in one vertical slice — they must land together because the middleware produces the value the routes consume.

In `server.ts`: add `app.use('/api', sessionMiddleware)` before the locations router. The middleware reads `wsid` from `req.headers.cookie`, calls `crypto.randomUUID()` if absent, calls `res.cookie('wsid', id, { httpOnly: true, maxAge: 31_536_000, sameSite: 'lax' })`, and sets `res.locals.sessionId = id`.

In `routes/locations.ts`: replace every `db.*` call signature to pass `(res.locals.sessionId as string)` as the `sessionId` argument.

**Acceptance criteria:**
- [ ] A first-time browser receives `Set-Cookie: wsid=<uuid>` with `HttpOnly` and 1-year `Max-Age`
- [ ] A returning browser with a valid `wsid` cookie is not issued a new one
- [ ] All five route handlers (`GET /locations`, `POST /locations`, `GET /locations/:id`, `DELETE /locations/:id`, `POST /locations/:id/refresh`) pass `sessionId` to their DB calls
- [ ] `GET /health` is unaffected (no session logic in health check)

**Verification:**
- [ ] `npm run build` exits 0
- [ ] `npm run doctor` returns healthy

**Dependencies:** Task 2

**Files touched:**
- `backend/src/server.ts`
- `backend/src/routes/locations.ts`

**Estimated scope:** S

**Notes:**
- Extend Express `Locals` with `sessionId: string` in a `backend/src/types/express.d.ts` if TypeScript complains about `res.locals.sessionId`.
- `GET /locations/forecast-areas` does not touch the `locations` table and does not need a session.

---

### Task 4: Update tests for session isolation

**Description:** The test `callRoute` helper passes a mock request with only `body` and `params`. After Task 3, routes read `res.locals.sessionId`. Update `createMockResponse()` to accept a `locals` argument and update `callRoute()` to accept `options.locals`. Patch every existing `callRoute` call to include `{ locals: { sessionId: 'test-session' } }`. Add two new isolation tests.

**Acceptance criteria:**
- [ ] All existing tests still pass unchanged in behaviour
- [ ] New test: same `(lat, lon)` added from `session-a` and `session-b` both return 201 (no 409)
- [ ] New test: location deleted from `session-a` is still returned by `GET /locations` from `session-b`
- [ ] `npm test` exits 0

**Verification:**
- [ ] `npm test` exits 0

**Dependencies:** Task 3

**Files touched:**
- `backend/src/routes/locations.test.ts`

**Estimated scope:** S

---

### Checkpoint 1 — Backend Complete

Before starting Phase 2:

- [ ] `npm test` — all tests pass
- [ ] `npm run build` — compiles without errors
- [ ] `npm run doctor` — `/health` and `/api/locations` healthy
- [ ] Manual: open the app in two different browsers (or a normal + incognito window), add a location in each, confirm each browser sees only its own list

---

## Phase 2: Frontend — Region → Area Picker

### Task 5: Create static `REGION_MAP`

**Description:** Create `frontend/src/regionMap.ts` with two exports: `REGION_ORDER` (the five region names in display order) and `REGION_MAP` (a `Record<string, string[]>` mapping each region to its array of NEA forecast area name strings).

**Acceptance criteria:**
- [ ] All 5 regions present: `'Central'`, `'North'`, `'North-East'`, `'East'`, `'West'`
- [ ] Total area names across all regions matches the count returned by `GET /api/locations/forecast-areas`
- [ ] Each area name string exactly matches what the API returns (case-sensitive)
- [ ] `npm run build` exits 0

**Verification:**
- [ ] `npm run build` exits 0
- [ ] Cross-check: `curl http://weather-starter.localhost:1355/api/locations/forecast-areas | jq '[.areas[].name] | sort'` — every name appears in `REGION_MAP`

**Dependencies:** None (can be worked on in parallel with Phase 1 if desired)

**Files touched:**
- `frontend/src/regionMap.ts` (new file)

**Estimated scope:** XS

**Notes:**
- If any area name from the API is missing from `REGION_MAP`, it will be silently skipped in the picker. Log a console warning in dev if `fetchForecastAreas()` returns names not found in any region bucket.

---

### Task 6: Rewrite `AddLocationForm.tsx` with Region → Area picker

**Description:** Replace the lat/lon form state and inputs with a two-step picker. Keep all geolocation logic intact.

**State changes:**
- Remove: `latitude`, `longitude` state; `onSubmit` handler
- Add: `selectedRegion: string | null`; `forecastAreas: ForecastArea[] | null`; fetch-on-open loading state

**UI flow:**
- **Default view** (`!isAdding`): "Use my location" button + "Add a location" button (label change from "Add coordinates manually")
- **Picker view** (`isAdding`): Fetch `fetchForecastAreas()` on mount if not already cached. Show 5 region buttons. When `selectedRegion` is set, show area chips for that region below. A back-arrow or "← Regions" link resets `selectedRegion`. Cancel button calls `cancelManual()` and resets both picker states.
- **On area chip tap:** `normalizeCoordinatePair(area)` → `findDuplicateLocation` check → if duplicate, `select()` + info status; else `create(coords)` + success status
- **Loading state:** Show a spinner or "Loading areas…" while `fetchForecastAreas()` is in-flight
- **Error state:** If `fetchForecastAreas()` fails, show an error status and a retry button

**What to remove entirely:**
- `latitude` / `longitude` `useState` hooks
- `<input type="number">` fields for lat and lon
- `onSubmit` form handler
- `busyAction: 'manual'` branch (geolocation busy state remains)

**What to keep unchanged:**
- `handleUseMyLocation` and entire geolocation flow
- `StatusBanner` component
- `busyAction: 'geolocation'` state
- `resolveAndCreate` (used by geolocation only after this change)

**Acceptance criteria:**
- [ ] No `<input type="number">` for lat/lon anywhere in the rendered output
- [ ] "Add a location" button opens the picker with 5 region buttons
- [ ] Tapping a region shows chips for only that region
- [ ] Tapping a chip adds the location and shows success status, then resets picker
- [ ] Tapping a chip for an already-saved area shows info status and selects the existing location
- [ ] "Use my location" still resolves via GPS, snaps to nearest area, and adds successfully
- [ ] Cancel from either picker step returns to the default (not-adding) view
- [ ] Loading state shown while `fetchForecastAreas()` is pending

**Verification:**
- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] Manual golden path: open app → "Add a location" → tap "East" → tap "Tampines" → location appears in sidebar
- [ ] Manual duplicate: tap "East" → tap "Tampines" again → shows "Already saved" info
- [ ] Manual geolocation: tap "Use my location" → confirm GPS-based location adds correctly
- [ ] Manual cancel: open picker, tap region, tap Cancel → returns to default view cleanly

**Dependencies:** Task 5

**Files touched:**
- `frontend/src/components/AddLocationForm.tsx`

**Estimated scope:** M

---

### Checkpoint 2 — Feature Complete

- [ ] `npm test` — all tests pass
- [ ] `npm run build` — compiles without errors
- [ ] `npm run lint` — no lint errors
- [ ] End-to-end: two browsers each build their own location list via the region picker with no cross-contamination
- [ ] Geolocation path still works in both browsers
- [ ] Ready for human review and commit

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Area names in `REGION_MAP` don't exactly match the API strings | High — area chips won't populate correctly | Verify with `curl` against live API before Task 6 (Task 5 acceptance criteria requires this) |
| Migration fails on existing non-empty `weather.db` due to unique index conflict | Medium | Run `npm run reset` before `npm run db:migrate` in dev; production column default `'legacy'` is safe |
| TypeScript complains about `res.locals.sessionId` type | Low | Extend Express `Locals` interface in `backend/src/types/express.d.ts` |
| `crypto.randomUUID()` unavailable in test environment | Low | Node ≥15 guarantees it; check `node --version` if needed |
| Areas returned by a live API call don't match REGION_MAP (API updated) | Low | Add dev-mode console warning when an API area name has no matching region bucket |

## Open Questions

1. What should the picker do with area names returned by the API that aren't in `REGION_MAP`? Options: silently skip, or add an "Other" bucket.
2. Cookie `SameSite=Lax` — confirm whether any cross-origin access (reverse proxy, CDN) requires `SameSite=None; Secure` instead.
3. Should `REGION_MAP` move to a JSON file later? For now, a `.ts` constant is fine.

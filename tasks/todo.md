# Todo: Location Picker & Per-Browser Sessions

## Phase 1 — Backend: Per-Browser Sessions

- [ ] **Task 1** — Add `session_id` to schema + update unique index
  - Edit `backend/src/schema.ts`: add `sessionId` column with `DEFAULT 'legacy'`
  - Change unique index to `(session_id, latitude, longitude)`
  - Run `npm run db:generate` → commit generated migration file
  - Run `npm run db:migrate`
  - Verify: `npm run build` exits 0

- [ ] **Task 2** — Scope all DB helpers to `session_id`
  - Update `listLocations`, `createLocation`, `getLocation`, `deleteLocation`, `updateWeather` in `backend/src/db.ts`
  - Scope duplicate-check query in `createLocation` to `session_id`
  - Verify: `npm run build` exits 0

- [ ] **Task 3** — Cookie middleware + wire session through routes
  - Add `sessionMiddleware` in `backend/src/server.ts` (read `wsid` cookie, generate UUID, set `res.locals.sessionId`)
  - Update all DB calls in `backend/src/routes/locations.ts` to pass `res.locals.sessionId`
  - Verify: `npm run build` exits 0, `npm run doctor` healthy

- [ ] **Task 4** — Update tests for session isolation
  - Add `locals` support to `createMockResponse()` and `callRoute()` in `locations.test.ts`
  - Patch all existing `callRoute` calls to include `{ locals: { sessionId: 'test-session' } }`
  - Add test: same coords from two sessions both return 201
  - Add test: delete in session A does not affect session B
  - Verify: `npm test` exits 0

### Checkpoint 1
- [ ] `npm test` passes
- [ ] `npm run build` clean
- [ ] `npm run doctor` healthy
- [ ] Manual: two browsers see independent location lists

---

## Phase 2 — Frontend: Region → Area Picker

- [ ] **Task 5** — Create static `REGION_MAP`
  - Create `frontend/src/regionMap.ts` with `REGION_ORDER` and `REGION_MAP`
  - Cross-check all area names against live API: `curl .../api/locations/forecast-areas | jq '[.areas[].name] | sort'`
  - Verify: `npm run build` exits 0

- [ ] **Task 6** — Rewrite `AddLocationForm.tsx` with region → area picker
  - Remove lat/lon inputs and `onSubmit` handler
  - Add `selectedRegion` state + region buttons + area chips
  - Add loading/error states for `fetchForecastAreas()`
  - Keep "Use my location" geolocation path unchanged
  - Verify: `npm run build` + `npm run lint` exit 0
  - Manual: golden path, duplicate handling, cancel, geolocation

### Checkpoint 2
- [ ] `npm test` passes
- [ ] `npm run build` clean
- [ ] `npm run lint` clean
- [ ] End-to-end: two browsers, independent lists, picker + geolocation both work

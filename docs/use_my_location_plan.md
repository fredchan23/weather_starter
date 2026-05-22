# Plan: Use My Location + Nearest Singapore Forecast Area

**Date**: 2026-05-22  
**Status**: Approved - ready for implementation

---

## Overview

Implement a default-on "Use my location" add flow that:

- Works on localhost without HTTPS for modern secure-context localhost behavior.
- Detects browser position and maps to nearest Singapore forecast area.
- Uses one shared coordinate pipeline for both geolocation and manual add.
- Prevents duplicates by pre-checking normalized coordinates.
- Preserves resilience through metadata caching, retry, and fallback paths.
- Provides accessible, transparent inline status messages and structured telemetry.

---

## Confirmed Decisions Snapshot

- Duplicate outcome: auto-select existing location and show info copy.
- Geolocation failure: inline actionable error with manual fallback available.
- Geolocation options: `enableHighAccuracy=false`, `timeout=8000`, `maximumAge=300000`.
- Entry UX: primary "Use my location" in collapsed state.
- Outside Singapore: snap to nearest Singapore forecast area.
- Persisted coordinates: always store snapped forecast-area coordinates.
- Area data source: backend endpoint under locations router.
- Endpoint behavior: in-memory TTL cache + stale return on upstream failure.
- Frontend nearest matching: Euclidean squared distance.
- Frontend area cache: in-memory only, TTL-aware refresh.
- Coordinate precision: normalize to 4 decimals.
- Shared logic: one normalization/snap helper for geolocation + manual.
- Copy and analytics: centralized reason enums, location-prefixed event names.
- Accessibility: proper busy/description semantics and announced status states.

---

## Scope

| Type | Area |
| ---- | ---- |
| Modified | Backend locations router (new forecast-areas endpoint) |
| Modified | Backend weather client (area metadata normalization helper reuse) |
| Modified | Backend route tests (forecast-areas contract and cache behavior) |
| Modified | Frontend API client (fetch forecast areas) |
| Modified | Frontend add-location component (new button, statuses, fallback flow) |
| Modified | Frontend store state/actions if needed for duplicate select and telemetry |
| Modified | Frontend types/util helpers (area metadata, reason enums, copy mapping, coordinate normalization/snap) |
| Modified | Docs: README and exercise notes changelog entry |

No schema migration is expected.

---

## Phase Plan

## Phase 1 - Backend Contract First

1. Add `GET /api/locations/forecast-areas` under existing locations router.
2. Return normalized payload shape: `{ areas, fetched_at, stale }`.
3. Normalize each area to `{ name, latitude, longitude }` with numeric coordinates only.
4. Add in-memory cache with TTL (10 minutes).
5. On upstream failure, return stale cache if present (`stale: true`).
6. If upstream failure and no cache, return `502` with clear `detail`.

### Phase 1 Acceptance Criteria

- Endpoint is reachable under locations API namespace.
- Returned areas are valid numeric coordinates only.
- Cache is reused within TTL and refreshed after TTL expiration.
- Stale cache is returned when upstream fails and cache exists.
- No changes to existing create/list/delete/refresh behavior.

## Phase 2 - Backend Tests

1. Add router-level tests (direct handler invocation pattern used in repo).
2. Cover contract success shape and normalization behavior.
3. Cover cache hit behavior (no re-fetch within TTL).
4. Cover stale-on-upstream-failure with existing cache.
5. Cover no-cache upstream failure returning error.

### Phase 2 Acceptance Criteria

- New tests are deterministic and avoid real network calls.
- Existing backend test suite remains green.

## Phase 3 - Frontend Data + Shared Domain Helpers

1. Add API function to fetch forecast areas.
2. Add types for area metadata payload.
3. Add shared helper module for:
   - 4-decimal normalization,
   - nearest-area selection via Euclidean squared distance,
   - coordinate canonicalization for duplicate pre-check.
4. Add reason enum and centralized copy mapping helper.
5. Add lightweight in-memory frontend area cache with TTL and one retry policy.

### Phase 3 Acceptance Criteria

- Helper functions are pure and testable in isolation.
- Same helper path is usable by manual and geolocation flows.
- Retry policy executes once before fallback.

## Phase 4 - AddLocation UX + Flow Wiring

1. Add primary "Use my location" button in collapsed state.
2. Keep existing manual add flow available.
3. Add geolocation flow with single-flight protection.
4. Apply shared normalize/snap pipeline to geolocation and manual paths.
5. Add duplicate pre-check against current store locations before create.
6. If duplicate found, select existing and show info status.
7. If metadata unavailable:
   - in-bounds input: fallback to direct create,
   - out-of-bounds manual input: block with explicit message.
8. Add transparent success copy indicating snapped/fallback path.
9. Add inline status auto-dismiss (4-6 seconds) and replacement on new actions.
10. Add accessibility attributes for busy state and status/error descriptions.

### Phase 4 Acceptance Criteria

- Repeated clicks do not start parallel requests.
- Duplicate path never creates a second location.
- Status copy reflects actual path taken.
- Unsupported geolocation state is visible and explained.

## Phase 5 - Telemetry + Analytics Semantics

1. Add location-prefixed events for clicked, resolved, failed, duplicate-selected.
2. Emit fixed `reason` enum for failures.
3. Emit path booleans: `usedStaleAreas`, `usedRawFallback`, `duplicatePrechecked`.
4. Avoid logging raw detected coordinates.

### Phase 5 Acceptance Criteria

- Events follow existing naming conventions.
- Failure analytics are machine-queryable by enum.
- Sensitive location data is not sent in logs.

## Phase 6 - Frontend Tests

1. Add tests for geolocation success to create flow.
2. Add tests for permission denied, timeout, unsupported, and unknown failures.
3. Add tests for duplicate pre-check selecting existing location.
4. Add tests for area fetch retry and fallback behavior.
5. Add tests for empty area list soft fallback behavior.
6. Add tests for out-of-bounds manual block when metadata unavailable.
7. Add tests for single-flight disable behavior and auto-dismiss statuses.
8. Add tests for accessibility-linked status/error announcements.

### Phase 6 Acceptance Criteria

- Tests assert external behavior and UI outcomes only.
- Existing frontend flows remain green.

## Phase 7 - Docs + Release Hygiene

1. Update README to document new button behavior and localhost expectations.
2. Add changelog entry to `docs/exercise_notes.md` using repository template.
3. Include verification commands and outcomes in changelog entry.

### Phase 7 Acceptance Criteria

- Docs reflect implemented behavior and fallback paths.
- Exercise notes include scope, risks, and verification commands.

---

## Verification Gate

Run and pass:

- `npm test`
- `npm run build`

If either fails, resolve regressions before merge.

---

## Delivery Checklist

- Backend endpoint and tests complete.
- Frontend helpers and caching complete.
- Add-location geolocation + manual shared pipeline complete.
- Telemetry contract complete.
- Accessibility semantics complete.
- Docs and changelog updated.
- Full test/build verification complete.

---

## Risks and Mitigations

- Risk: stale metadata may snap to slightly outdated coordinates.  
  Mitigation: backend `stale` flag, TTL refresh, and one-retry fetch before fallback.

- Risk: duplicate logic drifts between flows.  
  Mitigation: one shared coordinate canonicalization helper.

- Risk: geolocation context inconsistencies across browsers.  
  Mitigation: explicit unsupported messaging and manual fallback path.

- Risk: status messaging noise in repeated interactions.  
  Mitigation: short auto-dismiss and message replacement on new action.

---

## Out of Scope

- Searchable area autocomplete replacing manual coordinates.
- Map-based picking for new locations.
- Persisting area metadata in database.
- Feature-flag rollout mechanics.
- Analytics pipeline changes beyond event naming and metadata fields required here.

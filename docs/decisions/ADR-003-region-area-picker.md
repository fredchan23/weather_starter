# ADR-003: Replace lat/lon form with static region→area picker

## Status
Accepted

## Date
2026-06-05

## Context

The previous "Add location" form asked users to enter decimal latitude and longitude coordinates manually. This works for developers but fails the intended audience: newcomers to Singapore, tourists, and locals who know area names but not their GPS coordinates. The NEA data.gov.sg API already returns ~47 named forecast areas via `/api/locations/forecast-areas` — these areas are fetched on every location add to snap coordinates; they just weren't exposed to the user as a selection.

A usability gap existed: the data to make a friendly picker was already in the system. The only question was how to expose it.

## Decision

Replace the lat/lon form entirely with a two-level static picker:

1. **Region row** — six pill buttons: North, North-East, East, Central, West, South.
2. **Area chips** — when a region is selected, show chips for every forecast area in that region.

Clicking a chip calls `create({ latitude, longitude })` directly with the area's known coordinates from the loaded `ForecastArea[]` response. The nearest-area snap step is skipped for picker selections (the user already chose a named area). A static `REGION_MAP` in `frontend/src/regionMap.ts` groups all 47 API areas by region.

The "Use my location" geolocation path is preserved unchanged in both the collapsed and expanded states.

Forecast areas are loaded when the picker opens (user clicks "Add location"), not on page load. The existing `fetchForecastAreas()` in `api.ts` handles caching (10-minute TTL) and stale-on-error fallback.

## Alternatives Considered

### Keep lat/lon form, add area name autocomplete

- **Pros:** Power users keep coordinates; newcomers get autocomplete.
- **Cons:** Autocomplete requires knowing official NEA area names (e.g., "Ang Mo Kio" not "AMK" or "Bishan-Toa Payoh"). Partial match for 47 areas adds complexity; the set is small enough to browse.
- **Rejected:** Browsing a small set of named chips is simpler than typing and matching against an unfamiliar vocabulary.

### Map-click UI

- **Pros:** Visually intuitive; doesn't require knowing area names.
- **Cons:** Requires a map library (Leaflet or Mapbox), ~100 kB additional bundle, tile server dependency. Adds significant complexity. Coordinate selection from a map still needs to snap to the nearest named area.
- **Rejected:** Disproportionate for 47 selectable options. May be revisited if the app expands beyond Singapore.

### Search-first UI

- **Pros:** Quick for users who know the name.
- **Cons:** Fails users unfamiliar with the 47 official NEA area names. "Orchard" isn't an area name; it falls in "Novena" or "Tanglin".
- **Rejected:** Assumes knowledge the target user (newcomer) doesn't have.

### Dynamic region grouping from the API

- **Pros:** Automatically adapts if NEA adds or removes areas.
- **Cons:** NEA forecast areas have been stable for years. A dynamic grouping API doesn't exist — it would require us to maintain a service or algorithm. The static map is ~60 lines and is verified by a test against the live API area list.
- **Rejected:** Static is simpler; the test catches drift if NEA's area list ever changes.

### Keep the form as-is

- **Rejected:** The existing form is a direct barrier for the intended audience.

## Consequences

- **`frontend/src/regionMap.ts`** is the source of truth for region grouping. A test (`regionMap.test.ts`) asserts that every area name in `REGION_MAP` matches the live API response — if NEA ever adds or removes areas, the test will fail and prompt a `REGION_MAP` update.
- **`AddLocationForm.tsx`** is substantially shorter and simpler: the lat/lon form, the `onSubmit` handler, and the coordinate validation path are all removed.
- **The nearest-area snap is still used for geolocation.** When the user clicks "Use my location", their GPS coordinates are snapped to the nearest `ForecastArea` — this path is unchanged. The snap is only skipped for picker selections where the area is already known.
- **No coordinate input remains.** Power users who know exact coordinates can no longer enter them. This is an intentional trade-off — the geolocation path covers the "I'm standing here" use case.
- **Vitest coverage gap:** The vitest environment is `node` with no jsdom. Component-level behaviour (region selection, chip rendering, loading state transitions) can only be verified manually via the dev server. The `regionMap.test.ts` unit tests cover the data layer; TypeScript + ESLint cover the component's type correctness.

## References

- [`docs/ideas/location-picker-and-sessions.md`](../ideas/location-picker-and-sessions.md) — original design doc
- [`docs/exercise_notes.md`](../exercise_notes.md) — implementation log (2026-06-05 Checkpoint 2 entry)
- `frontend/src/regionMap.ts` — REGION_ORDER and REGION_MAP
- `frontend/src/regionMap.test.ts` — coverage/drift test
- `frontend/src/components/AddLocationForm.tsx` — picker implementation

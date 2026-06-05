# Location Picker & Per-Browser Sessions

## Problem Statement

How might we let anyone (locals, tourists, newcomers) add Singapore weather locations by choosing a familiar place name, while ensuring each browser sees only its own saved locations?

## Recommended Direction

**Feature 1 — Region → Area picker** replaces the raw coordinate form with a two-tap UI: pick a region (Central / North / North-East / East / West), then pick an area chip. The ~50 `ForecastArea` names returned by `/api/locations/forecast-areas` are already fetched on every add — they just aren't exposed as a selection. A hardcoded `REGION_MAP` (~60 lines) groups them by region. On area selection, `create({ latitude, longitude })` is called directly with the area's known coords, skipping the nearest-area snap (it's already a named area). Pure frontend change in `AddLocationForm.tsx`.

**Feature 2 — Anonymous session cookie** gives each browser its own isolated location list. A UUID cookie (`wsid`, `HttpOnly`, 1-year expiry) is generated on first visit. A `session_id` column is added to the `locations` table and all DB queries are scoped to it. No frontend changes needed — cookies are automatic. The snapshot pattern, refresh flow, and delete all work unchanged.

These two features compose cleanly: the picker adds to the user's session-scoped list, and the session ensures what they add only shows up in their browser.

## Key Assumptions to Validate

- [ ] The ~50 NEA forecast area names cover the places newcomers and tourists actually look for — test by checking if major landmarks (Orchard, Changi, Jurong, Marina) appear in the `ForecastArea[]` response
- [ ] Clearing cookies is an acceptable way to "reset" your saved locations — no recovery needed for a personal dashboard
- [ ] A static `REGION_MAP` is maintainable — NEA forecast areas don't change frequently enough to need a dynamic grouping API

## MVP Scope

**In:**
- 5 region buttons → area chip grid in `AddLocationForm.tsx`
- Static `REGION_MAP` constant grouping all `ForecastArea` names by region (frontend only)
- Remove raw lat/lon coordinate inputs entirely
- Keep "Use my location" geolocation path unchanged
- `session_id TEXT NOT NULL DEFAULT 'legacy'` column + Drizzle migration
- Cookie middleware: read `wsid`, generate UUID if absent, attach to `res.locals`
- Scope `listLocations`, `createLocation`, `deleteLocation`, `getLocation`, `updateWeather` to `session_id`

**Out:**
- Cross-device sync (not the use case)
- Full user auth (anonymous sessions are sufficient)
- Live weather preview in the area picker (requires a new bulk endpoint)
- Map-click UI (adds a map library dependency)
- Search-first UI (fails newcomers unfamiliar with official NEA area names)

## Not Doing (and Why)

- **OAuth / email auth** — login friction is not worth it for a personal weather bookmark
- **localStorage-only approach** — sounds simpler but invalidates the snapshot model, the store, the refresh flow, and the test suite
- **Bulk weather pre-fetch in picker** — picker's value is navigation, not preview; adds complexity before the core UX is validated
- **Dynamic region grouping from API** — NEA areas are stable; a static map is simpler and has no runtime cost

## Open Questions

- What happens to existing rows in the DB when sessions land? Likely: existing rows get `session_id = 'legacy'` via the column default — effectively invisible to new sessions, safely ignorable.
- Should the `REGION_MAP` be a separate constants file or inlined in the component?
- Session cookie duration: 1 year feels right for a personal dashboard — confirm before implementing.

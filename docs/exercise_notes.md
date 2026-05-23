# Exercise Notes

Use this as a changelog. Add one entry per branch or commit, and keep the same order inside every entry.

Related research: [Weather Dashboard API Mapping](./dashboard_api_mapping.md)

## 2026-05-23 | branch `main` | commit `pending` | document duplicate precheck logging behavior

- status: implemented
- implementation request: Document why adding a duplicate location can show an in-app duplicate message without producing a backend level 40 warning log.
- implementation challenges:
  - Frontend interaction logs (`/api/logs`) and backend warning logs (`logger.warn`) are emitted by different code paths, which can look similar in `app.log` unless the route and message are checked.
  - Duplicate behavior depends on whether the request is preempted in the client or reaches `POST /api/locations` and triggers a database uniqueness error.
- scope: `frontend/src/components/AddLocationForm.tsx`, `backend/src/routes/locations.ts`, `backend/logs/app.log`, `docs/exercise_notes.md`.
- decisions: Keep the current frontend-first duplicate handling; when a duplicate is detected in the client, select the existing location, show "Already saved. Showing ...", and skip the create API call.
- risks: The backend duplicate warning path may be under-observed in manual testing because normal UI usage short-circuits duplicate submissions before they hit the server.
- verification: `cat backend/logs/app.log | jq 'select(.level == 40)'`, `grep -n '"level": 40' backend/logs/app.log`.
- follow-up: If duplicate diagnostics are needed in production telemetry, add a dedicated frontend event for duplicate-prevented creates and dashboard it separately from backend warnings.

## 2026-05-23 | branch `main` | commit `pending` | add backend app API tests

- status: implemented
- implementation request: Add Vitest coverage for backend API endpoints using existing route test patterns, then run lint and tests.
- implementation challenges:
  - Existing route tests validate router handlers directly, so app-level API verification needed separate HTTP-style assertions without introducing flaky server lifecycle behavior.
  - The new app tests required isolated SQLite state to avoid cross-test interference with the existing backend suite.
- scope: `backend/src/server.test.ts`, `backend/src/routes/locations.ts`.
- decisions: Added a new `createApp` test suite with `supertest` covering `/health`, `/api/logs`, and mounted `/api/locations`; fixed an unused route middleware arg to satisfy ESLint.
- risks: App-level tests intentionally avoid Vite/frontend middleware paths (`serveFrontend: false`), so frontend serving behavior remains covered by runtime smoke checks rather than unit tests.
- verification: `npm run lint`, `npm test`.
- follow-up: Optionally add focused tests for the shared error handler and non-2xx weather provider paths through the full app layer.

## 2026-05-23 | branch `main` | commit `pending` | fix manual coordinate input overlap

- status: implemented
- implementation request: Fix overlapping latitude and longitude inputs in the manual add-location form.
- implementation challenges:
  - The overlap appeared at narrower widths where the two fixed columns and intrinsic input sizing could force fields into each other.
  - The fix needed to preserve the existing side-by-side layout on larger screens without changing validation or submit behavior.
- scope: `frontend/src/components/AddLocationForm.tsx`.
- decisions: Switched the coordinate grid to one column by default and two columns from the small breakpoint, and added `w-full min-w-0` constraints on both labels and number inputs so each field stays inside its grid track.
- risks: Very narrow screens now stack coordinates vertically, which is intentional but slightly changes visual density in the sidebar.
- verification: `npm test`, `npm run build`.
- follow-up: None.

## 2026-05-22 | branch `main` | commit `pending` | use my location and forecast areas

- status: implemented
- implementation request: Add a default-on "Use my location" flow that resolves the browser position to the nearest Singapore forecast area, deduplicates against saved locations, and keeps manual coordinate entry available with the same snapping pipeline.
- implementation challenges:
  - The backend already knew how to match a coordinate to a forecast area inside the weather client, but the locations router still needed its own cached forecast-areas endpoint for the frontend to reuse.
  - Duplicate prevention had to move onto normalized 4-decimal coordinates so the manual and geolocation paths would agree on what counts as the same location.
  - The new add flow needed to stay accessible and transparent, so the component had to juggle busy states, inline status messaging, and fallback explanations without turning into a modal workflow.
- scope: `backend/src/weather.ts`, `backend/src/routes/locations.ts`, `backend/src/routes/locations.test.ts`, `frontend/src/api.ts`, `frontend/src/locationHelpers.ts`, `frontend/src/components/AddLocationForm.tsx`, `frontend/src/state/store.tsx`, `frontend/src/types.ts`, `README.md`.
- decisions: Added `GET /api/locations/forecast-areas` with TTL caching and stale fallback, normalized create coordinates to 4 decimals before persistence, introduced shared frontend helpers for snapping and duplicate checks, and made the add form geolocation-first with a manual fallback path.
- risks: The frontend still falls back to a direct create when forecast metadata is unavailable and the coordinate is within Singapore bounds, so stale or missing area metadata can slightly change the wording of the success state.
- verification: `npm test -- --run backend/src/routes/locations.test.ts`, `npm run build`, `npm test`.
- follow-up: If the product should surface richer analytics, thread the source and fallback flags from the new flow into the existing logging pipeline.

## 2026-05-21 | branch `main` | commit `pending` | add workspace ESLint setup

- status: implemented
- implementation request: Install and configure ESLint for the monorepo so it lints both the React frontend and TypeScript backend, and expose a root `lint` script.
- implementation challenges:
  - The repo already had ESLint 9 and plugin dependencies but no active config file or lint script, so a flat config had to be added at the workspace root.
  - Installing `@eslint/js` without a version pin tried to pull v10, which conflicts with ESLint 9. The package had to be aligned to the v9 line.
  - Enabling lint surfaced two pre-existing unused-symbol errors, requiring a small frontend cleanup and an underscore-ignore convention for intentionally unused middleware args.
- scope: `eslint.config.js` (new), `package.json`, `frontend/src/components/Hero.tsx`.
- decisions: Use a single root flat config covering `backend/**/*.ts` and `frontend/**/*.{ts,tsx}`, include React and React Hooks rules for frontend files, and add underscore-based ignore patterns for `@typescript-eslint/no-unused-vars`.
- risks: The underscore-ignore convention can hide accidental unused variables if they are intentionally prefixed; this trade-off is accepted for Express-style handler signatures.
- verification: `npm run lint`, `npm test`, `npm run build`.
- follow-up: Optionally add stricter type-aware linting (`typescript-eslint` type-checked configs) once per-package `tsconfig` project references are standardized for ESLint.

## 2026-05-18 | branch `main` | commit `pending` | add Apple Weather-style MapCard

- status: implemented
- implementation request: Add a `MapCard` component using `react-leaflet` that renders a dark-themed Leaflet map inside a glassmorphism tile, shows all saved locations as custom pill-shaped pins, supports fullscreen expand/shrink, and integrates into the Hero for both the selected and no-selection states.
- implementation challenges:
  - Leaflet requires its CSS to be imported before the app CSS, otherwise tiles render as overlapping squares. The import was added to `main.tsx` ahead of `index.css`.
  - Two simultaneous `MapContainer` instances cause duplicate resource allocation, so the card's `MapInner` is replaced with a placeholder `<div>` while the fullscreen modal is open.
  - Leaflet's default `iconAnchor` must be zeroed out for `DivIcon` to avoid the pin bubble sitting underground.
- scope: `frontend/src/components/MapCard.tsx` (new), `frontend/src/components/icons.tsx`, `frontend/src/components/Hero.tsx`, `frontend/src/main.tsx`, `frontend/package.json`.
- decisions: CartoDB DarkMatter tile layer (free, no key, matches dark theme). Card zoom 11, fullscreen zoom 12. Pin click calls `select(loc.id)`. Condition truncated at 16 chars. Temperature omitted from pill when value is `"--°"`.
- verification: `npm test` — 9/9 pass. `npm run build` — compiles cleanly.
- follow-up: Could add a "fit bounds" action so the map always frames all pins. Zoom controls are intentionally hidden but scroll-zoom still works.

## 2026-05-18 | branch `main` | commit `a54863e` | preserve dashboard values across partial refreshes

- status: implemented
- implementation request: Stop the dashboard from losing previously shown weather values on successive refreshes when the upstream provider returns only a partial snapshot for a location.
- implementation challenges:
  - The refresh route replaced the entire stored weather snapshot, so any temporarily missing upstream reading immediately blanked out cards that had valid values from the previous refresh.
  - The fix needed to preserve older values only for fields omitted by the latest refresh, without blocking legitimate new readings or breaking the backend snapshot contract.
  - The merge helper initially used the runtime weather snapshot type for both inputs, but the stored database snapshot is nullable in a few places, which caused a backend TypeScript build error that had to be resolved before the change could ship.
- scope: `backend/src/routes/locations.ts`, `backend/src/routes/locations.test.ts`.
- decisions: Merge refresh results with the persisted snapshot before saving, keep prior readings and forecast arrays when the latest refresh omits them, and add a route-level regression test that simulates a partial follow-up refresh.
- risks: Holding on to the last good reading can mask a genuinely unavailable upstream metric for one refresh cycle, so any future UX that needs to distinguish "stale" from "missing" will need explicit metadata instead of relying on nulls alone.
- verification: `npm test -- backend/src/routes/locations.test.ts`, `npm run build`.
- follow-up: If the product should surface freshness per tile, extend the snapshot model to track per-reading timestamps or stale-state flags instead of only merged values.

## 2026-05-17 | branch `main` | commit `aba619a` | air quality feature completion

- status: implemented
- implementation request: Complete the air quality feature end to end by wiring the backend weather client to retrieve PSI and PM2.5 data from the realtime data.gov.sg APIs and expose those values through the existing weather snapshot flow.
- implementation challenges:
  - The weather client already had a dedicated air-quality helper, but `getCurrentWeather` was not including it in the composed snapshot, so the fetch path existed without reaching the UI or persistence layers.
  - The latest timestamp logic needed to account for the air-quality response so the snapshot reflected the freshest available reading across all sources.
  - Test coverage had to be updated to cover both the new requests and the merged PSI/PM2.5 output while keeping the existing two-hour forecast behavior intact.
- scope: `backend/src/weather.ts`, `backend/src/weather.test.ts`.
- decisions: Fold the air-quality fetch into the same `Promise.all` composition used for the other realtime readings, surface PSI/PM2.5/region on the returned `WeatherSnapshot`, and update the backend tests to lock the new behavior in.
- risks: Any consumer that assumes `observed_at` comes only from the forecast or non-air-quality readings may see a later timestamp once PSI or PM2.5 updates arrive.
- verification: `npm test -- --run backend/src/weather.test.ts`, `npx tsc -p backend/tsconfig.json --noEmit`.
- follow-up: If any UI copy or dashboard summary should highlight the new air-quality values more prominently, update the frontend presentation separately.

## 2026-05-17 | branch `main` | commit `c28c5ea` | weather metrics expansion

- status: implemented
- implementation request: Add weather metric support so the app can read and expose wind, UV, temperature, rainfall, and humidity data.
- implementation challenges:
  - The weather payload needed to be normalized into consistent metric readings so downstream code could consume the new fields without special cases.
  - Test coverage had to be updated alongside the data model changes so the metric extraction behavior stayed predictable.
- scope: `backend/src/weather.ts`, `backend/src/weather.test.ts`.
- decisions: Extend the weather transformation layer to include the new metric readings and lock the expected shape in tests.
- risks: Any UI or API consumer that still assumes the older weather shape may need a follow-up update to use the added metrics.
- verification: `npm test`, `npm run build`.
- follow-up: Wire the new metrics through any frontend views or API mappings that should display them.

## 2026-05-17 | branch `main` | commit `74e0e5c` | two-hour forecast-first dashboard

- status: implemented
- implementation request: Complete the condition card flow using the existing `two-hr-forecast` backend integration, make the dashboard display forecast data correctly even when realtime sensor readings are absent, and stabilize local dev startup after the Vite HMR websocket port conflict.
- implementation challenges:
  - The original UI assumed temperature was the primary hero value, but the `two-hr-forecast` endpoint does not provide temperature. That produced a technically correct but misleading `--°` state.
  - The backend saved `condition` and `valid_period_text`, but the forecast strip rendered from `forecast_periods`, so the dashboard still showed "unavailable" even when two-hour forecast data existed.
  - Older saved snapshots in SQLite would not immediately have the new `forecast_periods` shape, so the frontend needed a safe fallback derived from existing fields.
  - The dev server used Vite middleware mode without attaching HMR to the parent HTTP server, which caused a separate websocket bind on port `24678` and local startup failures.
  - The broader dashboard includes many secondary tiles that remain empty until other data sources are integrated, so the UI had to hide or downplay unavailable sections instead of making the page look broken.
- scope: `backend/src/server.ts`, `backend/src/weather.ts`, `backend/src/weather.test.ts`, `frontend/src/components/Hero.tsx`, `frontend/src/components/HourlyStrip.tsx`, `frontend/src/components/SidebarCard.tsx`.
- decisions: Populate `forecast_periods` from the two-hour payload, keep current-condition sensor reads as optional enrichment, switch the hero and sidebar to a forecast-first presentation when temperature is unavailable, and attach Vite middleware HMR to the shared Node HTTP server.
- risks: Existing stored rows may still need a manual refresh to hydrate newly added snapshot fields. The UI now conditionally hides empty sections, so later data-source additions need to preserve these fallback paths.
- verification: `npm test`, `npm run build`.
- follow-up: If the app should show temperature, humidity, rainfall, UV, wind, or air quality by default, the backend still needs to compose and persist those sources consistently for every refresh path.

## 2026-05-17 | branch `main` | commit `cd53906` | delete location

- status: implemented
- implementation request: Add end-to-end delete support for saved locations so a user can remove a location from the sidebar and keep the frontend, backend, and database state in sync.
- implementation challenges:
  - No single-location delete path existed in the backend. The route needed a DB helper so it could return `404` for a missing id and `204` for a successful delete.
  - The location card is already clickable for selection, so the delete control had to stop event propagation to avoid accidental selection on delete clicks.
  - The delete affordance needed to be visible without overpowering the card, so it was placed as a compact top-right cross button with absolute positioning.
  - Deleting the selected location required store-level recovery logic. After reload, selection must move to the next available location or clear entirely when the list becomes empty.
  - The existing backend tests used HTTP-style integration helpers that tried to bind a socket in this sandbox, so the tests had to be rewritten to exercise the router directly.
  - The README still described delete as a future task, so the docs had to be updated to match the implemented behavior.
- scope: `backend/src/db.ts`, `backend/src/routes/locations.ts`, `backend/src/routes/locations.test.ts`, `frontend/src/api.ts`, `frontend/src/state/store.tsx`, `frontend/src/components/SidebarCard.tsx`, `frontend/src/types.ts`, `README.md`.
- decisions: Added a dedicated delete helper, exposed `DELETE /api/locations/:locationId`, wired a store action to reload and reselect after delete, and used a top-right cross button inside the card.
- risks: The selected item can become stale after deletion unless the store re-evaluates selection. The delete button must stop propagation inside a clickable card.
- verification: `npm test`, `npm run build`.
- follow-up: None.

## Entry Template

## YYYY-MM-DD | branch `...` | commit `...` | summary

- status: `implemented`, `in progress`, `reviewed`, or `blocked`
- implementation request: What is being built?
- implementation challenges:
  - What made the work harder than expected?
  - What needed careful coordination across layers?
- scope: Which files or layers change?
- decisions: What approach was chosen?
- risks: What could regress?
- verification: What was run to validate the change?
- follow-up: What remains open?

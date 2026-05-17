# Exercise Notes

Use this as a changelog. Add one entry per branch or commit, and keep the same order inside every entry.

Related research: [Weather Dashboard API Mapping](./dashboard_api_mapping.md)

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

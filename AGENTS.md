# Weather Starter — Agent Guidelines

See [README.md](./README.md) for full architecture, API reference, and feature task list.
See [docs/dashboard_api_mapping.md](./docs/dashboard_api_mapping.md) for which data.gov.sg endpoints feed each UI card.
See [docs/exercise_notes.md](./docs/exercise_notes.md) for the per-commit changelog; add an entry for every implementation.

## Build & Test

```bash
npm install          # install all workspace dependencies
npm run dev          # Express + Vite dev server via Portless → http://weather-starter.localhost:1355
npm test             # run backend tests (vitest)
npm run build        # compile backend TS + build frontend
npm run db:generate  # generate Drizzle migration after schema changes
npm run db:migrate   # apply migrations to backend/weather.db
npm run reset        # delete backend/weather.db (drops all data)
npm run doctor       # smoke-test /health and /api/locations
```

Always run `npm test` and `npm run build` to verify changes.

## Architecture

- **Single process**: Express + Vite middleware run in one Node process. No separate ports to configure; the frontend uses relative `/api` requests.
- **Snapshot pattern**: Weather data is fetched from data.gov.sg on demand (create or refresh), written to SQLite, and read back — the API never fetches live on every page load.
- **Snapshot merging**: On refresh, merge the new snapshot over the stored one so previously valid readings are preserved when the upstream API returns partial data. See `backend/src/routes/locations.ts`.

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/schema.ts` | `WeatherSnapshot` interface + Drizzle table definition (source of truth for data shape) |
| `backend/src/db.ts` | SQLite helpers (`createLocation`, `updateWeather`, `deleteLocation`, …) |
| `backend/src/weather.ts` | `SingaporeWeatherClient` — fetches and composes data.gov.sg readings into `WeatherSnapshot` |
| `backend/src/routes/locations.ts` | Express routes; accepts an injectable `WeatherClient` for tests |
| `frontend/src/state/store.tsx` | React Context store (locations, selectedId, loading/error state) |
| `frontend/src/api.ts` | Frontend fetch helpers for `/api/*` |
| `frontend/src/types.ts` | Shared frontend types (`Location`, `WeatherSnapshot`, …) |

## Conventions

**Schema changes** require both a migration and a snapshot type update:
1. Edit `backend/src/schema.ts` (update the Drizzle table and `WeatherSnapshot` interface).
2. Run `npm run db:generate` then `npm run db:migrate`.
3. Update `backend/src/weather.ts` to populate the new field(s).
4. Update `frontend/src/types.ts` if the frontend consumes the new field.

**Tests use the router directly** — do not bind a real HTTP server in tests. Pass a mock `weatherClient` via `createLocationsRouter({ weatherClient })`.

**Coordinate validation**: Locations must be within Singapore (lat 1.1–1.5, lon 103.6–104.1). The backend enforces this with a 422 response.

**External API key** (optional): Set `WEATHER_API_KEY` env var before `npm run dev` to avoid rate limits.

**Changelog**: After every implementation, add a dated entry to [docs/exercise_notes.md](./docs/exercise_notes.md) following the existing format (branch, commit, status, scope, decisions, verification, follow-up).

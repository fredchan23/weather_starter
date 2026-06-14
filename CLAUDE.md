# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Express + Vite dev server → http://weather-starter.localhost:1355
npm test             # Run backend tests (vitest, no HTTP server bound)
npm run test:watch   # Tests in watch mode
npm run build        # Compile backend TS + build frontend (verify before committing)
npm run lint         # ESLint for backend and frontend TS/TSX
npm run db:generate  # Generate Drizzle migration after schema changes
npm run db:migrate   # Apply migrations to the local SQLite database
npm run db:migrate:remote  # Apply migrations to the remote Turso (libSQL) database
npm run reset        # Delete backend/weather.db (start fresh)
npm run doctor       # Smoke-test /health and /api/locations
```

Run `npm test` and `npm run build` to verify every change.

## Architecture

In local dev this is a single Node process: Express handles `/api/*` and a `/health` route; Vite middleware serves the React SPA. The frontend uses relative `/api` requests — no port config needed.

In production the app deploys to **Netlify**: the SPA is served from the CDN and the whole Express app runs as one Netlify Function (`netlify/functions/api.ts`, wrapped with `serverless-http`), backed by a **Turso (libSQL)** database. `db.ts` connects to Turso when `TURSO_DATABASE_URL` is set and `NODE_ENV !== 'test'`, falling back to a local SQLite file otherwise. See [docs/netlify.md](docs/netlify.md).

**Snapshot pattern:** Weather data is fetched from `https://api-open.data.gov.sg` only on create or manual refresh — never on page load. A new reading is merged over the stored one so previously valid fields survive partial upstream responses. See [backend/src/routes/locations.ts](backend/src/routes/locations.ts).

## Key Files

| File | Purpose |
|---|---|
| `backend/src/schema.ts` | `WeatherSnapshot` interface + Drizzle table — source of truth for data shape |
| `backend/src/db.ts` | Drizzle/libSQL helpers (`createLocation`, `updateWeather`, `deleteLocation`, …) — all scoped to `sessionId`; uses Turso in prod, local file in dev/tests |
| `netlify/functions/api.ts` | Netlify Function wrapping the Express app via `serverless-http` |
| `netlify.toml` | Netlify build config + `/api/*` and `/health` redirects to the function |
| `backend/src/server.ts` | Express app factory; `sessionMiddleware` reads/generates `wsid` cookie → `res.locals.sessionId` |
| `backend/src/weather.ts` | `SingaporeWeatherClient` — fetches and composes data.gov.sg readings into `WeatherSnapshot` |
| `backend/src/routes/locations.ts` | Express routes; accepts injectable `WeatherClient` for testing |
| `frontend/src/regionMap.ts` | `REGION_ORDER` + `REGION_MAP` — groups all 47 forecast areas into 6 Singapore regions |
| `frontend/src/state/store.tsx` | React Context store (locations, selectedId, loading/error state) |
| `frontend/src/api.ts` | Frontend fetch helpers for `/api/*` |
| `frontend/src/types.ts` | Shared frontend types (`Location`, `WeatherSnapshot`, …) |

## Testing

Tests are router-level (vitest). Pass a mock `weatherClient` via `createLocationsRouter({ weatherClient })` — do not bind a real HTTP server. Test files live alongside source at `backend/src/**/*.test.ts`.

## Schema Changes

Follow this order when adding or modifying a field:

1. Edit `backend/src/schema.ts` — update the Drizzle table **and** the `WeatherSnapshot` interface.
2. `npm run db:generate` then `npm run db:migrate` (local). Run `npm run db:migrate:remote` to apply to Turso before/at deploy.
3. Update `backend/src/weather.ts` to populate the new field(s).
4. Update `frontend/src/types.ts` if the frontend consumes the field.

## Domain Constraints

- Locations must be within Singapore bounds: lat 1.1–1.5, lon 103.6–104.1. The backend returns 422 otherwise.
- Set `WEATHER_API_KEY` to avoid rate limits (optional; the API works without a key).

## Changelog

After every implementation, add a dated entry to [docs/exercise_notes.md](docs/exercise_notes.md):

```
## YYYY-MM-DD | branch `name` | commit `hash` | short description

- status: implemented
- implementation request: …
- implementation challenges: …
- scope: <files changed>
- decisions: …
- verification: <commands run>
- follow-up: …
```

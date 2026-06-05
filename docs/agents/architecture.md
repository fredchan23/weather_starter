# Architecture & Key Files

## Process Topology

Single process: Express + Vite middleware run together in one Node process. The frontend uses relative `/api` requests — no port configuration is needed.

## Snapshot Pattern

Weather data is fetched from data.gov.sg on demand (create or refresh), written to SQLite, and read back. The API never calls data.gov.sg on every page load.

On refresh, the new snapshot is **merged over** the stored one so previously valid readings are preserved when the upstream API returns partial data. See `backend/src/routes/locations.ts`.

## Sessions

Each browser gets a UUID `wsid` `HttpOnly` cookie on first visit. `sessionMiddleware` in `backend/src/server.ts` reads or generates the cookie and writes it to `res.locals.sessionId`. All DB helpers accept a `sessionId` parameter and scope every query to it, so each browser sees only its own location list. See [ADR-002](../decisions/ADR-002-anonymous-session-isolation.md).

## Key Files

| File                              | Purpose                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `backend/src/schema.ts`           | `WeatherSnapshot` interface + Drizzle table (source of truth for data shape)                |
| `backend/src/db.ts`               | SQLite helpers: `createLocation`, `updateWeather`, `deleteLocation`, … — all scoped to `sessionId` |
| `backend/src/server.ts`           | Express app factory; `sessionMiddleware` sets `res.locals.sessionId` from `wsid` cookie     |
| `backend/src/weather.ts`          | `SingaporeWeatherClient` — fetches and composes data.gov.sg readings into `WeatherSnapshot` |
| `backend/src/routes/locations.ts` | Express routes; accepts injectable `WeatherClient` for tests                                |
| `frontend/src/state/store.tsx`    | React Context store (locations, selectedId, loading/error state)                            |
| `frontend/src/api.ts`             | Frontend fetch helpers for `/api/*`; `fetchForecastAreas()` with 10-min TTL cache           |
| `frontend/src/types.ts`           | Shared frontend types (`Location`, `WeatherSnapshot`, …)                                    |
| `frontend/src/regionMap.ts`       | `REGION_ORDER` and `REGION_MAP` — groups all 47 forecast areas into 6 Singapore regions     |

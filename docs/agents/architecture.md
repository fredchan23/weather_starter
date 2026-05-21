# Architecture & Key Files

## Process Topology

Single process: Express + Vite middleware run together in one Node process. The frontend uses relative `/api` requests — no port configuration is needed.

## Snapshot Pattern

Weather data is fetched from data.gov.sg on demand (create or refresh), written to SQLite, and read back. The API never calls data.gov.sg on every page load.

On refresh, the new snapshot is **merged over** the stored one so previously valid readings are preserved when the upstream API returns partial data. See `backend/src/routes/locations.ts`.

## Key Files

| File                              | Purpose                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `backend/src/schema.ts`           | `WeatherSnapshot` interface + Drizzle table (source of truth for data shape)                |
| `backend/src/db.ts`               | SQLite helpers: `createLocation`, `updateWeather`, `deleteLocation`, …                      |
| `backend/src/weather.ts`          | `SingaporeWeatherClient` — fetches and composes data.gov.sg readings into `WeatherSnapshot` |
| `backend/src/routes/locations.ts` | Express routes; accepts injectable `WeatherClient` for tests                                |
| `frontend/src/state/store.tsx`    | React Context store (locations, selectedId, loading/error state)                            |
| `frontend/src/api.ts`             | Frontend fetch helpers for `/api/*`                                                         |
| `frontend/src/types.ts`           | Shared frontend types (`Location`, `WeatherSnapshot`, …)                                    |

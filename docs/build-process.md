# Build Process

Extracted from the pre-commit hook, exercise notes, and CLAUDE.md.

## TL;DR — what to run after every change

```bash
npm test          # must pass
npm run build     # must be clean
npm run lint      # must be 0 errors
```

## When each command is required

| Command | When |
|---|---|
| `npm run lint` | Before every commit (pre-commit hook runs it automatically) |
| `npm test` | Before every commit (pre-commit hook runs it automatically) |
| `npm run build` | Before committing any TypeScript change; also run by CI |
| `npm run db:generate` | After editing `backend/src/schema.ts` (Drizzle table or interface) |
| `npm run db:migrate` | After `db:generate` — applies migration to local SQLite |
| `npm run db:migrate:remote` | Before/at deploy — applies migration to Turso (production) |
| `npm run doctor` | After starting the server — smoke-tests `/health` and `/api/locations` |
| `npm run reset` | To wipe the local DB and start fresh (`backend/weather.db` deleted) |

## Pre-commit hook

`.husky/pre-commit` runs **in this order**:

```
npm run lint
npm test
```

If either fails the commit is blocked. Fix before committing — do NOT use `--no-verify`.

## Verification checklist (from exercise notes pattern)

Every implementation entry in `docs/exercise_notes.md` closes with the same verification block:

```
npm test       — N tests, all pass
npm run build  — clean (frontend Vite + backend tsc)
npm run lint   — 0 errors
```

Security or schema tasks additionally run:

```
npm run db:generate   — confirm no unexpected migration generated
```

## Schema change order

1. Edit `backend/src/schema.ts` — Drizzle table **and** `WeatherSnapshot` interface.
2. `npm run db:generate` — creates a migration file under `backend/drizzle/`.
3. `npm run db:migrate` — applies to local SQLite.
4. Update `backend/src/weather.ts` to populate the new field.
5. Update `frontend/src/types.ts` if the frontend consumes it.
6. `npm run db:migrate:remote` — apply to Turso before or at deploy.

## Dev server

```bash
npm run dev     # Express + Vite → http://weather-starter.localhost:1355
```

Frontend uses relative `/api` paths — no port config needed. CSP is disabled in dev (`NODE_ENV !== 'production'`), so Vite HMR works without Content Security Policy errors.

## Test setup

Tests are router-level (vitest, no HTTP server). Pass `createLocationsRouter({ weatherClient })` with a mock client. Test files live at `backend/src/**/*.test.ts`. No jsdom / React Testing Library — component tests use TypeScript + linter as the RED/GREEN gate.

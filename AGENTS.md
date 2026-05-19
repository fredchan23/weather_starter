# Weather Starter — Agent Guidelines

Singapore weather tracker: Node/Express backend, React/Vite frontend, SQLite via Drizzle ORM.

## Commands

```bash
npm run dev          # Express + Vite dev server → http://weather-starter.localhost:1355
npm test             # run backend tests (vitest)
npm run build        # compile backend TS + build frontend
npm run db:generate  # generate Drizzle migration after schema changes
npm run db:migrate   # apply migrations to backend/weather.db
npm run reset        # delete backend/weather.db
npm run doctor       # smoke-test /health and /api/locations
```

Always run `npm test` and `npm run build` to verify changes.

## Guides

- [Architecture & Key Files](./docs/agents/architecture.md) — snapshot pattern, process topology, file map
- [Schema & Database](./docs/agents/schema.md) — Drizzle migration workflow, adding fields
- [Testing Patterns](./docs/agents/testing.md) — router-level tests, mock weatherClient
- [Conventions](./docs/agents/conventions.md) — domain constraints, changelog format, API key

## Reference Docs

- [README.md](./README.md) — full feature list and API reference
- [docs/dashboard_api_mapping.md](./docs/dashboard_api_mapping.md) — data.gov.sg endpoint mapping per UI card
- [docs/exercise_notes.md](./docs/exercise_notes.md) — per-commit changelog (add an entry for every implementation)

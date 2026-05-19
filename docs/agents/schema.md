# Schema & Database

## Adding or Changing a Field

Schema changes require both a migration and a snapshot type update. Follow these steps in order:

1. Edit `backend/src/schema.ts` — update the Drizzle table **and** the `WeatherSnapshot` interface.
2. Run `npm run db:generate` then `npm run db:migrate`.
3. Update `backend/src/weather.ts` to populate the new field(s).
4. Update `frontend/src/types.ts` if the frontend consumes the new field.

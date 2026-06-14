import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { and, desc, eq } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { locations, type WeatherSnapshot } from './schema.js';

export const CONDITION_NOT_REFRESHED = 'Not refreshed';

export interface LocationRecord {
  id: number;
  latitude: number;
  longitude: number;
  created_at: string;
  weather: WeatherSnapshot;
}

type LocationRow = typeof locations.$inferSelect;

const defaultWeather: WeatherSnapshot = {
  condition: CONDITION_NOT_REFRESHED,
  observed_at: null,
  source: 'not-refreshed',
  area: null,
  valid_period_text: null,
  temperature_c: null,
  humidity_percent: null,
  rainfall_mm: null,
  wind_speed_knots: null,
  wind_direction_degrees: null,
  forecast_low_c: null,
  forecast_high_c: null,
  uv_index: null,
  psi_twenty_four_hourly: null,
  pm25_one_hourly: null,
  air_quality_region: null,
  forecast_periods: [],
  daily_forecast: [],
};

// Use the remote Turso (libSQL) database when configured, except under test where
// we always fall back to a local file so the suite stays isolated and offline.
const isTest = process.env.NODE_ENV === 'test';
const remoteUrl = process.env.TURSO_DATABASE_URL;
const useRemote = Boolean(remoteUrl) && !isTest;

const localPath =
  process.env.DATABASE_PATH ?? join(process.cwd(), 'backend', 'weather.db');
if (!useRemote) {
  mkdirSync(dirname(localPath), { recursive: true });
}

const client = createClient(
  useRemote
    ? { url: remoteUrl as string, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${localPath}` },
);
const db = drizzle(client, { schema: { locations } });

// Auto-apply migrations only for the local file database (dev/tests), lazily on
// first access. Kept out of module top-level so the bundle has no top-level await
// (the Netlify Functions bundler emits CommonJS, which forbids it). The remote
// Turso database is migrated out-of-band via `npm run db:migrate:remote`, so a
// cold-started serverless function never runs migrations on the request path.
let readyPromise: Promise<unknown> | null = null;
function ensureReady(): Promise<unknown> {
  if (useRemote) return Promise.resolve();
  if (!readyPromise) {
    readyPromise = migrate(db, {
      migrationsFolder: join(process.cwd(), 'backend', 'drizzle'),
    });
  }
  return readyPromise;
}

export async function listLocations(sessionId: string): Promise<LocationRecord[]> {
  await ensureReady();
  return (
    await db
      .select()
      .from(locations)
      .where(eq(locations.sessionId, sessionId))
      .orderBy(desc(locations.createdAt), desc(locations.id))
      .all()
  ).map(rowToRecord);
}

export async function createLocation(
  sessionId: string,
  latitude: number,
  longitude: number,
): Promise<LocationRecord> {
  await ensureReady();
  const duplicate = await db
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.sessionId, sessionId),
        eq(locations.latitude, latitude),
        eq(locations.longitude, longitude),
      ),
    )
    .get();

  if (duplicate) {
    const error = new Error('Location already exists');
    error.name = 'DuplicateLocationError';
    throw error;
  }

  const createdAt = new Date().toISOString().slice(0, 19);
  const weather = weatherToColumns(defaultWeather);
  const row = await db
    .insert(locations)
    .values({
      sessionId,
      latitude,
      longitude,
      createdAt,
      ...weather,
    })
    .returning()
    .get();

  return rowToRecord(row);
}

export async function getLocation(
  id: number,
  sessionId: string,
): Promise<LocationRecord | null> {
  await ensureReady();
  const row = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.sessionId, sessionId)))
    .get();
  return row ? rowToRecord(row) : null;
}

export async function deleteLocation(
  id: number,
  sessionId: string,
): Promise<LocationRecord | null> {
  await ensureReady();
  const row = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.sessionId, sessionId)))
    .get();
  if (!row) return null;

  await db
    .delete(locations)
    .where(and(eq(locations.id, id), eq(locations.sessionId, sessionId)))
    .run();
  return rowToRecord(row);
}

export async function updateWeather(
  id: number,
  sessionId: string,
  weather: WeatherSnapshot,
): Promise<LocationRecord | null> {
  await ensureReady();
  const columns = weatherToColumns(weather);
  const row = await db
    .update(locations)
    .set(columns)
    .where(and(eq(locations.id, id), eq(locations.sessionId, sessionId)))
    .returning()
    .get();

  return row ? rowToRecord(row) : null;
}

export async function resetStore(): Promise<void> {
  await ensureReady();
  await db.delete(locations).run();
  await client.execute("DELETE FROM sqlite_sequence WHERE name = 'locations'");
}

function weatherToColumns(weather: WeatherSnapshot) {
  return {
    condition: weather.condition,
    observedAt: weather.observed_at,
    source: weather.source,
    area: weather.area,
    validPeriodText: weather.valid_period_text,
    temperatureC: weather.temperature_c,
    humidityPercent: weather.humidity_percent,
    rainfallMm: weather.rainfall_mm,
    windSpeedKnots: weather.wind_speed_knots,
    windDirectionDegrees: weather.wind_direction_degrees,
    forecastLowC: weather.forecast_low_c,
    forecastHighC: weather.forecast_high_c,
    uvIndex: weather.uv_index,
    psiTwentyFourHourly: weather.psi_twenty_four_hourly,
    pm25OneHourly: weather.pm25_one_hourly,
    airQualityRegion: weather.air_quality_region,
    forecastPeriods: weather.forecast_periods,
    dailyForecast: weather.daily_forecast,
  };
}

function rowToRecord(row: LocationRow): LocationRecord {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    created_at: row.createdAt,
    weather: {
      condition: row.condition,
      observed_at: row.observedAt,
      source: row.source,
      area: row.area,
      valid_period_text: row.validPeriodText,
      temperature_c: row.temperatureC,
      humidity_percent: row.humidityPercent,
      rainfall_mm: row.rainfallMm,
      wind_speed_knots: row.windSpeedKnots,
      wind_direction_degrees: row.windDirectionDegrees,
      forecast_low_c: row.forecastLowC,
      forecast_high_c: row.forecastHighC,
      uv_index: row.uvIndex,
      psi_twenty_four_hourly: row.psiTwentyFourHourly,
      pm25_one_hourly: row.pm25OneHourly,
      air_quality_region: row.airQualityRegion,
      forecast_periods: row.forecastPeriods,
      daily_forecast: row.dailyForecast,
    },
  };
}

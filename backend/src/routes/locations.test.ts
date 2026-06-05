import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Router } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CONDITION_UNAVAILABLE, type WeatherSnapshot } from '../weather.js';
import { parseLocationId } from './locations.js';

const weather: WeatherSnapshot = {
  condition: 'Cloudy',
  observed_at: '2026-05-04T00:00:00Z',
  source: 'test',
  area: 'Bishan',
  valid_period_text: 'Now',
  temperature_c: 29,
  humidity_percent: 80,
  rainfall_mm: 0,
  wind_speed_knots: 4,
  wind_direction_degrees: 180,
  forecast_low_c: 25,
  forecast_high_c: 32,
  uv_index: 7,
  psi_twenty_four_hourly: 42,
  pm25_one_hourly: 9,
  air_quality_region: 'central',
  forecast_periods: [{ label: 'Now', forecast: 'Cloudy' }],
  daily_forecast: [
    {
      date: '2026-05-04',
      forecast: 'Cloudy',
      temperature_low_c: 25,
      temperature_high_c: 32,
    },
  ],
};

type RouteMethod = 'get' | 'post' | 'delete';

interface MockResponse {
  statusCode: number;
  body: unknown;
  ended: boolean;
  locals: Record<string, unknown>;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
  end: () => MockResponse;
}

function createMockResponse(
  locals: Record<string, unknown> = {},
): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    body: undefined,
    ended: false,
    locals,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
    end() {
      response.ended = true;
      return response;
    },
  };

  return response;
}

function getRouteHandler(router: Router, method: RouteMethod, path: string) {
  const stack = router as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods?: Partial<Record<RouteMethod, boolean>>;
        stack: Array<{ handle: unknown }>;
      };
    }>;
  };
  const layer = stack.stack.find(
    (candidate) =>
      candidate.route?.path === path && candidate.route.methods?.[method],
  );
  if (!layer?.route?.stack[0]) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }

  return layer.route.stack[0].handle as unknown as (
    request: { body?: unknown; params?: Record<string, string> },
    response: MockResponse,
    next: (error?: unknown) => void,
  ) => Promise<void> | void;
}

async function callRoute(
  router: Router,
  method: RouteMethod,
  path: string,
  options: {
    body?: unknown;
    params?: Record<string, string>;
    locals?: Record<string, unknown>;
  } = {},
) {
  const handler = getRouteHandler(router, method, path);
  const response = createMockResponse(options.locals ?? { sessionId: 'test-session' });
  const next = (error?: unknown) => {
    if (error) throw error;
  };

  await handler(
    {
      body: options.body,
      params: options.params ?? {},
    },
    response,
    next,
  );

  return response;
}

describe('locations API', () => {
  let tempDir: string;
  let router: Router;
  let resetStore: () => Promise<void> = async () => {};
  let currentWeather: WeatherSnapshot = weather;
  let forecastAreaFetchCount = 0;
  let forecastAreaFailure: Error | null = null;

  const forecastAreas = [
    { name: 'Bishan', latitude: 1.351, longitude: 103.839 },
    { name: 'Woodlands', latitude: 1.435, longitude: 103.786 },
  ];

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'weather-starter-test-'));
    process.env.DATABASE_PATH = join(tempDir, 'weather.db');
    process.env.LOG_LEVEL = 'silent';

    const db = await import('../db.js');
    resetStore = db.resetStore;
  });

  beforeEach(async () => {
    await resetStore();
    currentWeather = weather;
    forecastAreaFetchCount = 0;
    forecastAreaFailure = null;
    const { createLocationsRouter } = await import('./locations.js');
    router = createLocationsRouter({
      weatherClient: {
        async getCurrentWeather() {
          return currentWeather;
        },
        async getForecastAreas() {
          forecastAreaFetchCount += 1;
          if (forecastAreaFailure) throw forecastAreaFailure;
          return forecastAreas;
        },
      },
    });
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('refreshes weather when a location is created', async () => {
    const response = await callRoute(router, 'post', '/locations', {
      body: { latitude: 1.35, longitude: 103.85 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({
      id: 1,
      latitude: 1.35,
      longitude: 103.85,
      weather: {
        condition: 'Cloudy',
        area: 'Bishan',
        temperature_c: 29,
      },
    });

    const listResponse = await callRoute(router, 'get', '/locations');
    expect(listResponse.statusCode).toBe(200);
    expect(
      (listResponse.body as { locations: unknown[] }).locations,
    ).toHaveLength(1);
  });

  it('deletes a location', async () => {
    const createResponse = await callRoute(router, 'post', '/locations', {
      body: { latitude: 1.36, longitude: 103.86 },
    });
    const created = createResponse.body as { id: number };

    const deleteResponse = await callRoute(
      router,
      'delete',
      '/locations/:locationId',
      {
        params: { locationId: String(created.id) },
      },
    );

    expect(deleteResponse.statusCode).toBe(204);
    expect(deleteResponse.ended).toBe(true);

    const listResponse = await callRoute(router, 'get', '/locations');
    expect(
      (listResponse.body as { locations: unknown[] }).locations,
    ).toHaveLength(0);

    const getResponse = await callRoute(
      router,
      'get',
      '/locations/:locationId',
      {
        params: { locationId: String(created.id) },
      },
    );

    expect(getResponse.statusCode).toBe(404);
  });

  it('keeps the previous readings when refresh returns a partial snapshot', async () => {
    const createResponse = await callRoute(router, 'post', '/locations', {
      body: { latitude: 1.35, longitude: 103.85 },
    });
    const created = createResponse.body as { id: number };

    currentWeather = {
      ...weather,
      condition: CONDITION_UNAVAILABLE,
      observed_at: '',
      valid_period_text: null,
      humidity_percent: null,
      rainfall_mm: null,
      uv_index: null,
      psi_twenty_four_hourly: null,
      pm25_one_hourly: null,
      air_quality_region: null,
      forecast_periods: [],
      daily_forecast: [],
    };

    const refreshResponse = await callRoute(
      router,
      'post',
      '/locations/:locationId/refresh',
      {
        params: { locationId: String(created.id) },
      },
    );

    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshResponse.body).toMatchObject({
      id: created.id,
      weather: {
        condition: 'Cloudy',
        observed_at: '2026-05-04T00:00:00Z',
        humidity_percent: 80,
        rainfall_mm: 0,
        uv_index: 7,
        psi_twenty_four_hourly: 42,
        pm25_one_hourly: 9,
        air_quality_region: 'central',
        forecast_periods: [{ label: 'Now', forecast: 'Cloudy' }],
        daily_forecast: [
          {
            date: '2026-05-04',
            forecast: 'Cloudy',
            temperature_low_c: 25,
            temperature_high_c: 32,
          },
        ],
      },
    });
  });

  it('returns 404 when deleting a missing location', async () => {
    const response = await callRoute(
      router,
      'delete',
      '/locations/:locationId',
      {
        params: { locationId: '999' },
      },
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ detail: 'Location not found' });
  });

  it('rejects coordinates outside Singapore with 422', async () => {
    const outOfBounds = [
      { latitude: 0, longitude: 103.85 },
      { latitude: 1.35, longitude: 0 },
      { latitude: 10, longitude: 110 },
    ];

    for (const coords of outOfBounds) {
      const response = await callRoute(router, 'post', '/locations', {
        body: coords,
      });
      expect(response.statusCode).toBe(422);
      expect(response.body).toMatchObject({
        detail: expect.stringContaining('Singapore'),
      });
    }
  });

  it('rejects missing latitude or longitude with 422', async () => {
    const response = await callRoute(router, 'post', '/locations', {
      body: { latitude: 'not-a-number', longitude: 103.85 },
    });
    expect(response.statusCode).toBe(422);
  });

  it('rejects a duplicate location with 409', async () => {
    await callRoute(router, 'post', '/locations', {
      body: { latitude: 1.35, longitude: 103.85 },
    });

    const response = await callRoute(router, 'post', '/locations', {
      body: { latitude: 1.35, longitude: 103.85 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({
      detail: expect.stringContaining('already exists'),
    });
  });

  it('returns normalized forecast areas and reuses the cache within ttl', async () => {
    const firstResponse = await callRoute(
      router,
      'get',
      '/locations/forecast-areas',
    );

    expect(firstResponse.statusCode).toBe(200);
    expect(firstResponse.body).toMatchObject({
      stale: false,
      areas: forecastAreas,
    });
    expect(
      (firstResponse.body as { fetched_at: string }).fetched_at,
    ).toEqual(expect.any(String));
    expect(forecastAreaFetchCount).toBe(1);

    const secondResponse = await callRoute(
      router,
      'get',
      '/locations/forecast-areas',
    );

    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.body).toMatchObject({
      stale: false,
      areas: forecastAreas,
    });
    expect(forecastAreaFetchCount).toBe(1);
  });

  it('serves stale forecast areas when the upstream request fails after caching', async () => {
    const { createLocationsRouter } = await import('./locations.js');
    router = createLocationsRouter({
      forecastAreasTtlMs: 0,
      weatherClient: {
        async getCurrentWeather() {
          return currentWeather;
        },
        async getForecastAreas() {
          forecastAreaFetchCount += 1;
          if (forecastAreaFailure) throw forecastAreaFailure;
          return forecastAreas;
        },
      },
    });

    const initialResponse = await callRoute(router, 'get', '/locations/forecast-areas');
    expect(initialResponse.statusCode).toBe(200);

    forecastAreaFailure = new Error('upstream unavailable');

    const staleResponse = await callRoute(
      router,
      'get',
      '/locations/forecast-areas',
    );

    expect(staleResponse.statusCode).toBe(200);
    expect(staleResponse.body).toMatchObject({
      stale: true,
      areas: forecastAreas,
    });
    expect(forecastAreaFetchCount).toBe(2);
  });

  it('returns 502 when forecast areas cannot be loaded and no cache exists', async () => {
    forecastAreaFailure = new Error('upstream unavailable');

    const response = await callRoute(router, 'get', '/locations/forecast-areas');

    expect(response.statusCode).toBe(502);
    expect(response.body).toMatchObject({
      detail: 'Weather data is temporarily unavailable',
    });
    expect(forecastAreaFetchCount).toBe(1);
  });

  it('allows the same coordinates to be added by two different sessions', async () => {
    const responseA = await callRoute(router, 'post', '/locations', {
      body: { latitude: 1.35, longitude: 103.85 },
      locals: { sessionId: 'session-a' },
    });
    expect(responseA.statusCode).toBe(201);

    const responseB = await callRoute(router, 'post', '/locations', {
      body: { latitude: 1.35, longitude: 103.85 },
      locals: { sessionId: 'session-b' },
    });
    expect(responseB.statusCode).toBe(201);
  });

  it('delete in session A does not affect session B', async () => {
    const createA = await callRoute(router, 'post', '/locations', {
      body: { latitude: 1.35, longitude: 103.85 },
      locals: { sessionId: 'session-a' },
    });
    const createB = await callRoute(router, 'post', '/locations', {
      body: { latitude: 1.35, longitude: 103.85 },
      locals: { sessionId: 'session-b' },
    });
    const idA = (createA.body as { id: number }).id;
    const idB = (createB.body as { id: number }).id;

    await callRoute(router, 'delete', '/locations/:locationId', {
      params: { locationId: String(idA) },
      locals: { sessionId: 'session-a' },
    });

    const listB = await callRoute(router, 'get', '/locations', {
      locals: { sessionId: 'session-b' },
    });
    expect(
      (listB.body as { locations: unknown[] }).locations,
    ).toHaveLength(1);

    const getB = await callRoute(router, 'get', '/locations/:locationId', {
      params: { locationId: String(idB) },
      locals: { sessionId: 'session-b' },
    });
    expect(getB.statusCode).toBe(200);
  });

  it('returns 502 with a generic message when weather refresh fails', async () => {
    const createResponse = await callRoute(router, 'post', '/locations', {
      body: { latitude: 1.35, longitude: 103.85 },
    });
    const created = createResponse.body as { id: number };

    const { WeatherProviderError } = await import('../weather.js');
    // Re-create router with a client that throws WeatherProviderError
    const { createLocationsRouter: makeRouter } = await import('./locations.js');
    const failingRouter = makeRouter({
      weatherClient: {
        async getCurrentWeather() {
          throw new WeatherProviderError('Weather provider rejected request (check API key)');
        },
        async getForecastAreas() {
          return forecastAreas;
        },
      },
    });

    // Insert the location into the DB so the refresh handler finds it
    const refreshResponse = await callRoute(
      failingRouter,
      'post',
      '/locations/:locationId/refresh',
      { params: { locationId: String(created.id) } },
    );

    expect(refreshResponse.statusCode).toBe(502);
    expect(refreshResponse.body).toMatchObject({
      detail: 'Weather data is temporarily unavailable',
    });
    // Must NOT contain the raw error message
    expect(JSON.stringify(refreshResponse.body)).not.toContain('API key');
  });
});

describe('parseLocationId', () => {
  it('returns the parsed integer for a valid positive integer string', () => {
    expect(parseLocationId('1')).toBe(1);
    expect(parseLocationId('42')).toBe(42);
  });

  it('returns null for non-numeric strings', () => {
    expect(parseLocationId('abc')).toBeNull();
    expect(parseLocationId('NaN')).toBeNull();
    expect(parseLocationId('Infinity')).toBeNull();
  });

  it('returns null for zero and negative integers', () => {
    expect(parseLocationId('0')).toBeNull();
    expect(parseLocationId('-1')).toBeNull();
  });

  it('returns null for floats', () => {
    expect(parseLocationId('1.5')).toBeNull();
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { WeatherSnapshot } from './weather.js';

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

describe('app API', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof import('./server.js')['createApp']>>['app'];
  let server: Server;
  let resetStore: () => Promise<void> = async () => {};
  let previousDatabasePath: string | undefined;
  let previousLogLevel: string | undefined;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'weather-starter-app-test-'));
    previousDatabasePath = process.env.DATABASE_PATH;
    previousLogLevel = process.env.LOG_LEVEL;
    process.env.DATABASE_PATH = join(tempDir, 'weather.db');
    process.env.LOG_LEVEL = 'silent';

    const db = await import('./db.js');
    resetStore = db.resetStore;

    const { createApp } = await import('./server.js');
    const created = await createApp({
      serveFrontend: false,
      enableRequestLogging: false,
      weatherClient: {
        async getCurrentWeather() {
          return weather;
        },
        async getForecastAreas() {
          return [
            { name: 'Bishan', latitude: 1.351, longitude: 103.839 },
            { name: 'Woodlands', latitude: 1.435, longitude: 103.786 },
          ];
        },
      },
    });

    app = created.app;
    server = created.server;
  });

  beforeEach(async () => {
    await resetStore();
  });

  afterAll(async () => {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    await rm(tempDir, { recursive: true, force: true });

    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }

    if (previousLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previousLogLevel;
    }
  });

  it('returns healthy status from /health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'healthy' });
  });

  it('sets security headers on every response', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeTruthy();
    expect(response.headers['referrer-policy']).toBeTruthy();
  });

  it('includes rate-limit headers on API responses', async () => {
    const response = await request(app).get('/api/locations');

    expect(response.headers['ratelimit-limit']).toBeTruthy();
    expect(response.headers['ratelimit-remaining']).toBeTruthy();
  });

  it('includes rate-limit headers on POST /api/logs', async () => {
    const response = await request(app)
      .post('/api/logs')
      .send({ event: 'test.event' });

    expect(response.headers['ratelimit-limit']).toBeTruthy();
  });

  it('validates /api/logs event payload', async () => {
    const response = await request(app).post('/api/logs').send({});

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ detail: 'event is required' });
  });

  it('accepts valid frontend events in /api/logs', async () => {
    const response = await request(app).post('/api/logs').send({
      event: 'location.add_click',
      metadata: { source: 'sidebar' },
      page: '/dashboard',
    });

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('truncates metadata to 10 keys maximum in /api/logs', async () => {
    const bigMetadata = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`key${i}`, `val${i}`]),
    );
    const response = await request(app)
      .post('/api/logs')
      .send({ event: 'test.event', metadata: bigMetadata });

    // Should not reject — just silently truncate
    expect(response.status).toBe(204);
  });

  it('rejects deeply nested metadata objects in /api/logs with 422', async () => {
    // A depth-10 nested object
    let nested: Record<string, unknown> = { value: 1 };
    for (let i = 0; i < 10; i++) {
      nested = { child: nested };
    }
    const response = await request(app)
      .post('/api/logs')
      .send({ event: 'test.event', metadata: nested });

    expect(response.status).toBe(422);
  });

  it('rejects array metadata in /api/logs with 422', async () => {
    const response = await request(app)
      .post('/api/logs')
      .send({ event: 'test.event', metadata: [1, 2, 3] });

    expect(response.status).toBe(422);
  });

  it('GET /api/logs is not subject to mutationLimiter — ratelimit-limit should be 120', async () => {
    const response = await request(app).get('/api/logs');
    expect(response.headers['ratelimit-limit']).toBe('120');
  });

  it('does not echo back arbitrary origins in CORS headers', async () => {
    const response = await request(app)
      .get('/api/locations')
      .set('Origin', 'https://evil.example.com');

    expect(response.headers['access-control-allow-origin']).not.toBe(
      'https://evil.example.com',
    );
  });

  it('allows requests from ALLOWED_ORIGINS when set', async () => {
    const previousAllowed = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = 'https://trusted.example.com';
    try {
      const { createApp: makeApp } = await import('./server.js');
      const { app: appWithCors } = await makeApp({
        serveFrontend: false,
        enableRequestLogging: false,
        weatherClient: {
          async getCurrentWeather() { throw new Error('not used'); },
          async getForecastAreas() { return []; },
        },
      });

      const response = await request(appWithCors)
        .get('/api/locations')
        .set('Origin', 'https://trusted.example.com');

      expect(response.headers['access-control-allow-origin']).toBe(
        'https://trusted.example.com',
      );
    } finally {
      if (previousAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
      else process.env.ALLOWED_ORIGINS = previousAllowed;
    }
  });

  it('rejects non-integer locationId with 422 on GET', async () => {
    const responses = await Promise.all([
      request(app).get('/api/locations/abc'),
      request(app).get('/api/locations/NaN'),
      request(app).get('/api/locations/Infinity'),
      request(app).get('/api/locations/0'),
      request(app).get('/api/locations/-1'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(422);
    }
  });

  it('rejects non-integer locationId with 422 on DELETE', async () => {
    const response = await request(app).delete('/api/locations/abc');

    expect(response.status).toBe(422);
  });

  it('rejects non-integer locationId with 422 on POST refresh', async () => {
    const response = await request(app).post('/api/locations/NaN/refresh');

    expect(response.status).toBe(422);
  });

  it('serves mounted location APIs through /api', async () => {
    const createResponse = await request(app).post('/api/locations').send({
      latitude: 1.35,
      longitude: 103.85,
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      id: expect.any(Number),
      latitude: 1.35,
      longitude: 103.85,
      weather: {
        condition: 'Cloudy',
        area: 'Bishan',
        temperature_c: 29,
      },
    });

    const listResponse = await request(app).get('/api/locations');

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toMatchObject({
      locations: [
        expect.objectContaining({
          id: createResponse.body.id,
          latitude: 1.35,
          longitude: 103.85,
        }),
      ],
    });
  });
});
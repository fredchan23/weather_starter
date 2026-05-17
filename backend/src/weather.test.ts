import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SingaporeWeatherClient } from './weather.js';

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  } as Response;
}

describe('SingaporeWeatherClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('composes current conditions from the two-hour forecast and nearest readings', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/v2/real-time/api/two-hr-forecast')) {
        return jsonResponse({
          data: {
            area_metadata: [
              {
                name: 'Bishan',
                label_location: {
                  latitude: 1.35,
                  longitude: 103.83,
                },
              },
            ],
            items: [
              {
                update_timestamp: '2026-05-17T01:00:00Z',
                valid_period: {
                  text: 'This morning',
                },
                forecasts: [
                  {
                    area: 'Bishan',
                    forecast: 'Partly Cloudy',
                  },
                ],
              },
            ],
          },
        });
      }

      if (url.endsWith('/v2/real-time/api/air-temperature')) {
        return jsonResponse({
          data: {
            stations: [
              {
                id: 'bishan-temp',
                location: {
                  latitude: 1.35,
                  longitude: 103.83,
                },
              },
            ],
            readings: [
              {
                timestamp: '2026-05-17T01:05:00Z',
                data: [{ stationId: 'bishan-temp', value: 30.1 }],
              },
            ],
          },
        });
      }

      if (url.endsWith('/v2/real-time/api/relative-humidity')) {
        return jsonResponse({
          data: {
            stations: [
              {
                id: 'bishan-humidity',
                location: {
                  latitude: 1.35,
                  longitude: 103.83,
                },
              },
            ],
            readings: [
              {
                timestamp: '2026-05-17T01:04:00Z',
                data: [{ stationId: 'bishan-humidity', value: 84 }],
              },
            ],
          },
        });
      }

      if (url.endsWith('/v2/real-time/api/rainfall')) {
        return jsonResponse({
          data: {
            stations: [
              {
                id: 'bishan-rainfall',
                location: {
                  latitude: 1.35,
                  longitude: 103.83,
                },
              },
            ],
            readings: [
              {
                timestamp: '2026-05-17T01:03:00Z',
                data: [{ stationId: 'bishan-rainfall', value: 0.4 }],
              },
            ],
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const client = new SingaporeWeatherClient({
      baseUrl: 'https://api-open.data.gov.sg',
      timeoutMs: 1000,
      userAgent: 'weather-starter-test',
    });

    const weather = await client.getCurrentWeather(1.351, 103.83);

    expect(weather).toMatchObject({
      condition: 'Partly Cloudy',
      observed_at: '2026-05-17T01:05:00Z',
      source: 'api-open.data.gov.sg',
      area: 'Bishan',
      valid_period_text: 'This morning',
      temperature_c: 30.1,
      humidity_percent: 84,
      rainfall_mm: 0.4,
    });
    expect(weather.forecast_periods).toEqual([
      {
        label: 'This morning',
        forecast: 'Partly Cloudy',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast',
      'https://api-open.data.gov.sg/v2/real-time/api/air-temperature',
      'https://api-open.data.gov.sg/v2/real-time/api/relative-humidity',
      'https://api-open.data.gov.sg/v2/real-time/api/rainfall',
    ]);
  });

  it('still returns the forecast snapshot when a reading endpoint fails', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/v2/real-time/api/two-hr-forecast')) {
        return jsonResponse({
          data: {
            area_metadata: [
              {
                name: 'Bishan',
                label_location: {
                  latitude: 1.35,
                  longitude: 103.83,
                },
              },
            ],
            items: [
              {
                update_timestamp: '2026-05-17T01:00:00Z',
                forecasts: [
                  {
                    area: 'Bishan',
                    forecast: 'Partly Cloudy',
                  },
                ],
              },
            ],
          },
        });
      }

      if (url.endsWith('/v2/real-time/api/air-temperature')) {
        return jsonResponse({
          data: {
            stations: [
              {
                id: 'bishan-temp',
                location: {
                  latitude: 1.35,
                  longitude: 103.83,
                },
              },
            ],
            readings: [
              {
                timestamp: '2026-05-17T01:05:00Z',
                data: [{ stationId: 'bishan-temp', value: 30.1 }],
              },
            ],
          },
        });
      }

      if (url.endsWith('/v2/real-time/api/relative-humidity')) {
        return jsonResponse({
          data: {
            stations: [
              {
                id: 'bishan-humidity',
                location: {
                  latitude: 1.35,
                  longitude: 103.83,
                },
              },
            ],
            readings: [
              {
                timestamp: '2026-05-17T01:04:00Z',
                data: [{ stationId: 'bishan-humidity', value: 84 }],
              },
            ],
          },
        });
      }

      if (url.endsWith('/v2/real-time/api/rainfall')) {
        return jsonResponse({ errorMsg: 'rainfall unavailable' }, 500);
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const client = new SingaporeWeatherClient({ baseUrl: 'https://api-open.data.gov.sg' });
    const weather = await client.getCurrentWeather(1.351, 103.83);

    expect(weather).toMatchObject({
      condition: 'Partly Cloudy',
      observed_at: '2026-05-17T01:05:00Z',
      temperature_c: 30.1,
      humidity_percent: 84,
      rainfall_mm: null,
    });
    expect(weather.forecast_periods).toEqual([
      {
        label: 'Next 2 hours',
        forecast: 'Partly Cloudy',
      },
    ]);
  });
});

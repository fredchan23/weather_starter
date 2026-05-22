// Hidden Code: Fox
import type {
  CreateLocationPayload,
  ForecastAreasResponse,
  Location,
} from './types';

const API_BASE = '/api';
const FORECAST_AREAS_TTL_MS = 10 * 60 * 1000;

let forecastAreasCache: {
  value: ForecastAreasResponse | null;
  expiresAt: number;
  pending: Promise<ForecastAreasResponse> | null;
} = {
  value: null,
  expiresAt: 0,
  pending: null,
};

interface LocationsResponse {
  locations: Location[];
}

interface ApiError {
  detail?: string;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as ApiError;
    throw new Error(error.detail || 'Request failed');
  }
  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

export const listLocations = () => request<LocationsResponse>('/locations');

export const createLocation = (payload: CreateLocationPayload) =>
  request<Location>('/locations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const deleteLocation = (id: number) =>
  request<void>(`/locations/${id}`, { method: 'DELETE' });

export const refreshLocation = (id: number) =>
  request<Location>(`/locations/${id}/refresh`, { method: 'POST' });

export async function fetchForecastAreas(): Promise<ForecastAreasResponse> {
  const cached = forecastAreasCache.value;
  if (cached && forecastAreasCache.expiresAt > Date.now()) {
    return cached;
  }

  if (forecastAreasCache.pending) {
    return forecastAreasCache.pending;
  }

  const pending = (async () => {
    try {
      const response = await request<ForecastAreasResponse>(
        '/locations/forecast-areas',
      );
      forecastAreasCache = {
        value: response,
        expiresAt: Date.now() + FORECAST_AREAS_TTL_MS,
        pending: null,
      };
      return response;
    } catch {
      try {
        const retryResponse = await request<ForecastAreasResponse>(
          '/locations/forecast-areas',
        );
        forecastAreasCache = {
          value: retryResponse,
          expiresAt: Date.now() + FORECAST_AREAS_TTL_MS,
          pending: null,
        };
        return retryResponse;
      } catch (retryError) {
        forecastAreasCache.pending = null;
        if (forecastAreasCache.value) {
          return {
            ...forecastAreasCache.value,
            stale: true,
          };
        }
        throw retryError;
      }
    }
  })();

  forecastAreasCache.pending = pending;
  return pending;
}

export function logInteraction(event: string, metadata: object = {}) {
  const page =
    typeof window === 'undefined' ? undefined : window.location.pathname;
  void fetch(`${API_BASE}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, metadata, page }),
    keepalive: true,
  }).catch(() => {});
}

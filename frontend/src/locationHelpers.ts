import type { ForecastArea, Location } from './types';

const COORDINATE_PRECISION = 4;

export const CENTRAL_DEFAULT = {
  latitude: 1.3048,
  longitude: 103.8318,
  label: 'Central',
} as const;

export function normalizeCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_PRECISION));
}

export function normalizeCoordinatePair(input: {
  latitude: number;
  longitude: number;
}): { latitude: number; longitude: number } {
  return {
    latitude: normalizeCoordinate(input.latitude),
    longitude: normalizeCoordinate(input.longitude),
  };
}

export function isWithinSingaporeBounds(input: {
  latitude: number;
  longitude: number;
}): boolean {
  return (
    input.latitude >= 1.1 &&
    input.latitude <= 1.5 &&
    input.longitude >= 103.6 &&
    input.longitude <= 104.1
  );
}

export function selectNearestForecastArea(
  areas: ForecastArea[],
  latitude: number,
  longitude: number,
): ForecastArea | null {
  let nearest: { area: ForecastArea; distance: number } | null = null;

  for (const area of areas) {
    const distance =
      (area.latitude - latitude) ** 2 + (area.longitude - longitude) ** 2;
    if (!nearest || distance < nearest.distance) {
      nearest = { area, distance };
    }
  }

  return nearest?.area ?? null;
}

export function findDuplicateLocation(
  locations: Location[],
  coordinates: { latitude: number; longitude: number },
): Location | null {
  return (
    locations.find(
      (location) =>
        normalizeCoordinate(location.latitude) === coordinates.latitude &&
        normalizeCoordinate(location.longitude) === coordinates.longitude,
    ) ?? null
  );
}

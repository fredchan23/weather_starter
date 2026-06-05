import { describe, expect, it } from 'vitest';
import {
  CENTRAL_DEFAULT,
  findDuplicateLocation,
  isWithinSingaporeBounds,
  normalizeCoordinate,
  normalizeCoordinatePair,
  resolveGeoUpgrade,
  selectNearestForecastArea,
} from './locationHelpers';
import type { Location } from './types';

describe('CENTRAL_DEFAULT', () => {
  it('is within Singapore bounds', () => {
    expect(isWithinSingaporeBounds(CENTRAL_DEFAULT)).toBe(true);
  });

  it('has the Orchard-area coordinates', () => {
    expect(CENTRAL_DEFAULT.latitude).toBe(1.3048);
    expect(CENTRAL_DEFAULT.longitude).toBe(103.8318);
  });

  it('has the label Central', () => {
    expect(CENTRAL_DEFAULT.label).toBe('Central');
  });
});

describe('normalizeCoordinate', () => {
  it('rounds to 4 decimal places', () => {
    expect(normalizeCoordinate(1.35089999)).toBe(1.3509);
    expect(normalizeCoordinate(103.819876)).toBe(103.8199);
  });

  it('preserves values already at 4 decimal precision', () => {
    expect(normalizeCoordinate(1.3521)).toBe(1.3521);
    expect(normalizeCoordinate(103.82)).toBe(103.82);
  });

  it('rounds halves away from zero', () => {
    expect(normalizeCoordinate(1.00005)).toBe(1.0001);
  });
});

describe('normalizeCoordinatePair', () => {
  it('normalizes both latitude and longitude', () => {
    expect(normalizeCoordinatePair({ latitude: 1.35089, longitude: 103.81999 })).toEqual({
      latitude: 1.3509,
      longitude: 103.82,
    });
  });

  it('returns a new object without mutating input', () => {
    const input = { latitude: 1.3521, longitude: 103.8198 };
    const result = normalizeCoordinatePair(input);
    expect(result).not.toBe(input);
    expect(input.latitude).toBe(1.3521);
  });
});

describe('isWithinSingaporeBounds', () => {
  it('returns true for a central Singapore coordinate', () => {
    expect(isWithinSingaporeBounds({ latitude: 1.352, longitude: 103.82 })).toBe(true);
  });

  it('returns true for coordinates exactly on the bounds', () => {
    expect(isWithinSingaporeBounds({ latitude: 1.1, longitude: 103.6 })).toBe(true);
    expect(isWithinSingaporeBounds({ latitude: 1.5, longitude: 104.1 })).toBe(true);
  });

  it('returns false for latitude below 1.1', () => {
    expect(isWithinSingaporeBounds({ latitude: 1.09, longitude: 103.82 })).toBe(false);
  });

  it('returns false for latitude above 1.5', () => {
    expect(isWithinSingaporeBounds({ latitude: 1.51, longitude: 103.82 })).toBe(false);
  });

  it('returns false for longitude below 103.6', () => {
    expect(isWithinSingaporeBounds({ latitude: 1.352, longitude: 103.59 })).toBe(false);
  });

  it('returns false for longitude above 104.1', () => {
    expect(isWithinSingaporeBounds({ latitude: 1.352, longitude: 104.11 })).toBe(false);
  });
});

describe('selectNearestForecastArea', () => {
  const areas = [
    { name: 'Ang Mo Kio', latitude: 1.375, longitude: 103.839 },
    { name: 'Bishan', latitude: 1.352, longitude: 103.848 },
    { name: 'Clementi', latitude: 1.333, longitude: 103.762 },
  ];

  it('returns the area closest to the given coordinates', () => {
    // Exactly at Bishan
    expect(selectNearestForecastArea(areas, 1.352, 103.848)?.name).toBe('Bishan');
    // Very close to Ang Mo Kio
    expect(selectNearestForecastArea(areas, 1.37, 103.84)?.name).toBe('Ang Mo Kio');
    // Very close to Clementi
    expect(selectNearestForecastArea(areas, 1.334, 103.763)?.name).toBe('Clementi');
  });

  it('returns null for an empty areas array', () => {
    expect(selectNearestForecastArea([], 1.352, 103.82)).toBeNull();
  });

  it('returns the single area when there is only one', () => {
    const single = [{ name: 'Jurong West', latitude: 1.34, longitude: 103.7 }];
    expect(selectNearestForecastArea(single, 0, 0)?.name).toBe('Jurong West');
  });

  it('snaps out-of-bounds coordinates to the nearest area', () => {
    // KL is far outside Singapore — should still snap to the nearest area
    const nearest = selectNearestForecastArea(areas, 3.14, 101.69);
    expect(nearest).not.toBeNull();
  });
});

describe('findDuplicateLocation', () => {
  const locations: Location[] = [
    {
      id: 1,
      latitude: 1.352,
      longitude: 103.848,
      created_at: '2026-01-01T00:00:00Z',
      weather: { area: 'Bishan' } as Location['weather'],
    },
    {
      id: 2,
      latitude: 1.375,
      longitude: 103.839,
      created_at: '2026-01-01T00:00:00Z',
      weather: { area: 'Ang Mo Kio' } as Location['weather'],
    },
  ];

  it('returns the matching location when coordinates match after normalization', () => {
    // 1.3520 normalizes to 1.352 — exact match
    const result = findDuplicateLocation(locations, { latitude: 1.352, longitude: 103.848 });
    expect(result?.id).toBe(1);
  });

  it('returns the correct location from a multi-location list', () => {
    const result = findDuplicateLocation(locations, { latitude: 1.375, longitude: 103.839 });
    expect(result?.id).toBe(2);
  });

  it('returns null when no location matches', () => {
    const result = findDuplicateLocation(locations, { latitude: 1.333, longitude: 103.762 });
    expect(result).toBeNull();
  });

  it('returns null for an empty locations array', () => {
    const result = findDuplicateLocation([], { latitude: 1.352, longitude: 103.848 });
    expect(result).toBeNull();
  });

  it('normalizes stored coordinates before comparing', () => {
    const stored: Location[] = [
      {
        id: 3,
        latitude: 1.35200001,
        longitude: 103.84800001,
        created_at: '2026-01-01T00:00:00Z',
        weather: { area: 'Bishan' } as Location['weather'],
      },
    ];
    // After normalization both sides resolve to 1.352, 103.848
    const result = findDuplicateLocation(stored, { latitude: 1.352, longitude: 103.848 });
    expect(result?.id).toBe(3);
  });
});

describe('resolveGeoUpgrade', () => {
  const areas = [
    { name: 'Orchard', latitude: 1.3048, longitude: 103.8318 },
    { name: 'Jurong West', latitude: 1.34, longitude: 103.7 },
    { name: 'Changi', latitude: 1.357, longitude: 103.988 },
  ];

  it('returns the nearest area for in-bounds coords', () => {
    const result = resolveGeoUpgrade(areas, 1.305, 103.832);
    expect(result?.name).toBe('Orchard');
  });

  it('returns null when areas is empty', () => {
    expect(resolveGeoUpgrade([], 1.305, 103.832)).toBeNull();
  });

  it('returns null for out-of-Singapore coords', () => {
    expect(resolveGeoUpgrade(areas, 3.14, 101.69)).toBeNull();
  });
});

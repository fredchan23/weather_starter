import { describe, expect, it } from 'vitest';
import { REGION_MAP, REGION_ORDER } from './regionMap';

// All 47 areas returned by /api/locations/forecast-areas as of 2026-06-05
const ALL_API_AREAS = [
  'Ang Mo Kio', 'Bedok', 'Bishan', 'Boon Lay', 'Bukit Batok',
  'Bukit Merah', 'Bukit Panjang', 'Bukit Timah', 'Central Water Catchment',
  'Changi', 'Choa Chu Kang', 'City', 'Clementi', 'Geylang', 'Hougang',
  'Jalan Bahar', 'Jurong East', 'Jurong Island', 'Jurong West', 'Kallang',
  'Lim Chu Kang', 'Mandai', 'Marine Parade', 'Novena', 'Pasir Ris',
  'Paya Lebar', 'Pioneer', 'Pulau Tekong', 'Pulau Ubin', 'Punggol',
  'Queenstown', 'Seletar', 'Sembawang', 'Sengkang', 'Sentosa', 'Serangoon',
  'Southern Islands', 'Sungei Kadut', 'Tampines', 'Tanglin', 'Tengah',
  'Toa Payoh', 'Tuas', 'Western Islands', 'Western Water Catchment',
  'Woodlands', 'Yishun',
];

describe('REGION_ORDER', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(REGION_ORDER)).toBe(true);
    expect(REGION_ORDER.length).toBeGreaterThan(0);
    REGION_ORDER.forEach((r) => expect(typeof r).toBe('string'));
  });

  it('matches the keys of REGION_MAP exactly', () => {
    const mapKeys = Object.keys(REGION_MAP).sort();
    const orderSorted = [...REGION_ORDER].sort();
    expect(orderSorted).toEqual(mapKeys);
  });
});

describe('REGION_MAP', () => {
  const allMapped = Object.values(REGION_MAP).flat();

  it('covers all 47 API areas', () => {
    const sorted = [...allMapped].sort();
    expect(sorted).toEqual([...ALL_API_AREAS].sort());
  });

  it('has no duplicate areas across regions', () => {
    const seen = new Set<string>();
    for (const area of allMapped) {
      expect(seen.has(area), `"${area}" appears in more than one region`).toBe(false);
      seen.add(area);
    }
  });

  it('each region has at least one area', () => {
    for (const [region, areas] of Object.entries(REGION_MAP)) {
      expect(areas.length, `region "${region}" is empty`).toBeGreaterThan(0);
    }
  });
});

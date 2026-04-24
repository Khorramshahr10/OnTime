import { calculateDistanceKm, kmToMiles, formatDistance } from '../utils/distance';

describe('User story: I see distances in my preferred unit', () => {
  it('shows distance in miles when I prefer miles', () => {
    const result = formatDistance(100, 'miles');
    expect(result).toBe('62 mi');
  });

  it('shows distance in km when I prefer km', () => {
    const result = formatDistance(100, 'km');
    expect(result).toBe('100 km');
  });

  it('rounds distances to whole numbers', () => {
    expect(formatDistance(88.7, 'km')).toBe('89 km');
    expect(formatDistance(88.7, 'miles')).toBe('55 mi');
  });

  it('converts km to miles accurately', () => {
    const miles = kmToMiles(1.60934);
    expect(miles).toBeCloseTo(1.0, 1);
  });

  it('calculates the distance between Toronto and Mecca correctly (~10,500 km)', () => {
    const toronto = { latitude: 43.6532, longitude: -79.3832 };
    const mecca = { latitude: 21.4225, longitude: 39.8262 };
    const distance = calculateDistanceKm(toronto, mecca);

    // Should be roughly 10,500 km
    expect(distance).toBeGreaterThan(10000);
    expect(distance).toBeLessThan(11000);
  });

  it('returns 0 distance for the same location', () => {
    const point = { latitude: 43.6532, longitude: -79.3832 };
    expect(calculateDistanceKm(point, point)).toBe(0);
  });

  it('calculates a short distance correctly (within a city ~5 km)', () => {
    const pointA = { latitude: 43.6532, longitude: -79.3832 };
    const pointB = { latitude: 43.6800, longitude: -79.3500 };
    const distance = calculateDistanceKm(pointA, pointB);

    expect(distance).toBeGreaterThan(3);
    expect(distance).toBeLessThan(6);
  });
});

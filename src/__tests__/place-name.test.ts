import { describe, it, expect } from 'vitest';
import { labelForGlobe } from '../utils/placeName';

describe('labelForGlobe', () => {
  it('leaves a short name alone', () => {
    expect(labelForGlobe('Dearborn')).toBe('Dearborn');
    expect(labelForGlobe('North Aurora')).toBe('North Aurora');
  });

  it('keeps the settlement out of a street address', () => {
    // The real case from the device: the label ran off the edge of the globe.
    expect(labelForGlobe('Meade Boulevard, North Aurora')).toBe('North Aurora');
  });

  it('prefers the last part that fits rather than the last part outright', () => {
    expect(labelForGlobe('Some Extremely Long Road Name, Springfield')).toBe('Springfield');
  });

  it('falls back to truncation when no part fits', () => {
    const out = labelForGlobe('Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch');
    expect(out.length).toBeLessThanOrEqual(18);
    expect(out.endsWith('…')).toBe(true);
  });

  it('never returns an empty label', () => {
    expect(labelForGlobe('')).toBe('You');
    expect(labelForGlobe('   ')).toBe('You');
  });

  it('respects a custom limit', () => {
    expect(labelForGlobe('Meade Boulevard, North Aurora', 12)).toBe('North Aurora');
    expect(labelForGlobe('North Aurora', 8)).toBe('North A…'); // 8 chars including the ellipsis
  });

  it('takes the last fitting part, which is where the app puts the city', () => {
    // LocationContext builds names as "<road|suburb>, <city>", so the city is
    // last. Its one other format is "<city>, <state>", where this picks the
    // state instead — a real place nearby, and only reachable for locations
    // saved before shortName existed, since shortName now carries the city.
    expect(labelForGlobe('Yonge Street, Toronto')).toBe('Toronto');
  });
});

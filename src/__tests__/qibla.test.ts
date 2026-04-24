import { calculateQiblaDirection } from '../services/prayerService';

describe('User story: I can find the Qibla direction from anywhere', () => {
  it('points roughly northeast from Toronto (~54-59 degrees)', () => {
    const direction = calculateQiblaDirection({ latitude: 43.6532, longitude: -79.3832 });

    expect(direction).toBeGreaterThan(50);
    expect(direction).toBeLessThan(65);
  });

  it('returns a valid bearing (0-360) for any location', () => {
    const locations = [
      { latitude: 43.6532, longitude: -79.3832 },  // Toronto
      { latitude: 51.5074, longitude: -0.1278 },    // London
      { latitude: -33.8688, longitude: 151.2093 },  // Sydney
      { latitude: 35.6762, longitude: 139.6503 },   // Tokyo
      { latitude: -1.2921, longitude: 36.8219 },     // Nairobi
    ];

    for (const loc of locations) {
      const direction = calculateQiblaDirection(loc);
      expect(direction).toBeGreaterThanOrEqual(0);
      expect(direction).toBeLessThan(360);
    }
  });

  it('points roughly south from a location north of Mecca (Istanbul)', () => {
    // Istanbul is north and slightly west of Mecca — Qibla should be ~150-175 degrees (SSE)
    const direction = calculateQiblaDirection({ latitude: 41.0082, longitude: 28.9784 });

    expect(direction).toBeGreaterThan(140);
    expect(direction).toBeLessThan(180);
  });

  it('points roughly west from a location east of Mecca (Islamabad)', () => {
    // Islamabad is northeast of Mecca — Qibla should be ~250-265 (WSW)
    const direction = calculateQiblaDirection({ latitude: 33.6844, longitude: 73.0479 });

    expect(direction).toBeGreaterThan(245);
    expect(direction).toBeLessThan(270);
  });
});

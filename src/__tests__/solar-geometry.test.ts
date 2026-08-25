import { describe, it, expect } from 'vitest';
import {
  D2R,
  R2D,
  MECCA,
  dayOfYear,
  solarDeclination,
  decimalHours,
  hourAngle,
  sunPosition,
  latLonToVec3,
  normalize,
  greatCircleArc,
  angularSeparation,
  sunPath,
  subSolarPoint,
  subLunarPoint,
  geocentricMoonEcliptic,
  moonIllumination,
} from '../services/solarGeometry';

const DEARBORN = { latitude: 42.3223, longitude: -83.1763 };

const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);

describe('dayOfYear', () => {
  it('is 1 on January 1st', () => {
    expect(dayOfYear(new Date(2026, 0, 1, 12))).toBe(1);
  });

  it('counts the leap day', () => {
    expect(dayOfYear(new Date(2024, 11, 31, 12))).toBe(366);
    expect(dayOfYear(new Date(2026, 11, 31, 12))).toBe(365);
  });
});

describe('solarDeclination', () => {
  it('peaks near +23.4 at the June solstice', () => {
    expect(solarDeclination(new Date(2026, 5, 21, 12))).toBeCloseTo(23.4, 0);
  });

  it('bottoms out near -23.4 at the December solstice', () => {
    expect(solarDeclination(new Date(2026, 11, 21, 12))).toBeCloseTo(-23.4, 0);
  });

  it('crosses near zero at the equinoxes', () => {
    expect(Math.abs(solarDeclination(new Date(2026, 2, 20, 12)))).toBeLessThan(1.5);
    expect(Math.abs(solarDeclination(new Date(2026, 8, 22, 12)))).toBeLessThan(1.5);
  });

  it('matches the ~12 degrees the design mock hardcoded for late August', () => {
    expect(solarDeclination(new Date(2026, 7, 20, 12))).toBeCloseTo(12, 0);
  });
});

describe('decimalHours / hourAngle', () => {
  it('converts a clock time to decimal hours', () => {
    expect(decimalHours(new Date(2026, 7, 20, 18, 12, 0))).toBeCloseTo(18.2, 5);
  });

  it('is zero at solar noon', () => {
    const noon = new Date(2026, 7, 20, 13, 18);
    expect(hourAngle(noon, noon)).toBe(0);
  });

  it('advances 15 degrees per hour, negative before noon', () => {
    const noon = new Date(2026, 7, 20, 13, 0);
    expect(hourAngle(new Date(2026, 7, 20, 14, 0), noon)).toBeCloseTo(15, 5);
    expect(hourAngle(new Date(2026, 7, 20, 11, 0), noon)).toBeCloseTo(-30, 5);
  });
});

describe('sunPosition', () => {
  it('returns a unit vector', () => {
    for (const H of [-150, -60, 0, 45, 170]) {
      expect(len(sunPosition(DEARBORN.latitude, 12, H).v)).toBeCloseTo(1, 10);
    }
  });

  it('puts the sun overhead at the equator on the equinox at noon', () => {
    const { v, altitude } = sunPosition(0, 0, 0);
    expect(altitude * R2D).toBeCloseTo(90, 6);
    expect(v.y).toBeCloseTo(1, 6);
  });

  it('reaches altitude 90 - |lat - dec| at local solar noon', () => {
    const { altitude } = sunPosition(DEARBORN.latitude, 12, 0);
    expect(altitude * R2D).toBeCloseTo(90 - Math.abs(DEARBORN.latitude - 12), 4);
  });

  it('places the noon sun due south for a northern-hemisphere observer', () => {
    const { v, azimuth } = sunPosition(DEARBORN.latitude, 12, 0);
    expect(Math.abs(azimuth * R2D)).toBeCloseTo(180, 4);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.z).toBeGreaterThan(0); // +z is south
  });

  it('sits on the horizon at 6 hours from noon on the equinox at the equator', () => {
    expect(sunPosition(0, 0, 90).altitude * R2D).toBeCloseTo(0, 6);
    expect(sunPosition(0, 0, -90).altitude * R2D).toBeCloseTo(0, 6);
  });

  it('is east of the observer in the morning and west in the afternoon', () => {
    expect(sunPosition(DEARBORN.latitude, 12, -60).v.x).toBeGreaterThan(0);
    expect(sunPosition(DEARBORN.latitude, 12, 60).v.x).toBeLessThan(0);
  });

  it('keeps the sun above the horizon all day inside the arctic summer', () => {
    for (let H = -180; H <= 180; H += 30) {
      expect(sunPosition(80, 23.4, H).altitude).toBeGreaterThan(0);
    }
  });
});

describe('latLonToVec3', () => {
  it('maps the origin of the graticule to +x', () => {
    const v = latLonToVec3(0, 0);
    expect(v.x).toBeCloseTo(1, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it('maps the north pole to +y', () => {
    const v = latLonToVec3(90, 0);
    expect(v.y).toBeCloseTo(1, 10);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(0, 10);
  });

  it('scales by radius', () => {
    expect(len(latLonToVec3(31, 77, 2.5))).toBeCloseTo(2.5, 10);
  });
});

describe('greatCircleArc', () => {
  const arc = greatCircleArc(DEARBORN, MECCA, 64);

  it('starts at the origin and ends at the destination', () => {
    const a = normalize(latLonToVec3(DEARBORN.latitude, DEARBORN.longitude));
    const b = normalize(latLonToVec3(MECCA.latitude, MECCA.longitude));
    expect(arc[0].x).toBeCloseTo(a.x, 8);
    expect(arc[0].y).toBeCloseTo(a.y, 8);
    expect(arc[0].z).toBeCloseTo(a.z, 8);
    expect(arc[arc.length - 1].x).toBeCloseTo(b.x, 8);
    expect(arc[arc.length - 1].y).toBeCloseTo(b.y, 8);
    expect(arc[arc.length - 1].z).toBeCloseTo(b.z, 8);
  });

  it('stays on the sphere for every point', () => {
    for (const p of arc) expect(len(p)).toBeCloseTo(1, 8);
  });

  it('honours the radius argument', () => {
    for (const p of greatCircleArc(DEARBORN, MECCA, 16, 1.012)) {
      expect(len(p)).toBeCloseTo(1.012, 8);
    }
  });

  it('spaces points evenly along the arc', () => {
    const step = (i: number) =>
      Math.hypot(arc[i + 1].x - arc[i].x, arc[i + 1].y - arc[i].y, arc[i + 1].z - arc[i].z);
    const first = step(0);
    for (let i = 1; i < arc.length - 1; i++) {
      expect(step(i)).toBeCloseTo(first, 6);
    }
  });

  it('does not collapse for near-antipodal endpoints', () => {
    const anti = greatCircleArc(MECCA, { latitude: -21.4225, longitude: -140.1738 }, 32);
    for (const p of anti) expect(len(p)).toBeCloseTo(1, 6);
  });

  it('bends north of the naive straight line from Dearborn to Makkah', () => {
    // The great circle to Makkah from Michigan heads northeast, so the arc's
    // midpoint sits at a higher latitude than the midpoint of the endpoints.
    const mid = arc[Math.floor(arc.length / 2)];
    const midLat = Math.asin(mid.y) * R2D;
    expect(midLat).toBeGreaterThan((DEARBORN.latitude + MECCA.latitude) / 2);
  });
});

describe('sunPath', () => {
  it('splits the day at the horizon', () => {
    const { above, below } = sunPath(DEARBORN.latitude, 12, 2);
    expect(above.length).toBeGreaterThan(0);
    expect(below.length).toBeGreaterThan(0);
    expect(above.every((p) => p.y >= 0)).toBe(true);
    expect(below.every((p) => p.y < 0)).toBe(true);
  });

  it('has a longer daylight arc than night arc in northern summer', () => {
    const { above, below } = sunPath(DEARBORN.latitude, 23.4, 1);
    expect(above.length).toBeGreaterThan(below.length);
  });

  it('degrades to an all-daylight track under the midnight sun', () => {
    const { above, below } = sunPath(80, 23.4, 5);
    expect(below).toHaveLength(0);
    expect(above.length).toBeGreaterThan(0);
  });

  it('degrades to an all-night track during polar night', () => {
    const { above, below } = sunPath(80, -23.4, 5);
    expect(above).toHaveLength(0);
    expect(below.length).toBeGreaterThan(0);
  });

  it('exports D2R for the renderer layer', () => {
    expect(D2R).toBeCloseTo(Math.PI / 180, 12);
  });
});

describe('angularSeparation', () => {
  it('is zero at the same point', () => {
    expect(angularSeparation(MECCA, MECCA)).toBeCloseTo(0, 10);
  });

  it("is below half a degree for the app's default location, which is the Kaaba", () => {
    // LocationContext falls back to exactly these coordinates before GPS
    // resolves, so the globe must treat it as "you are already there".
    expect(angularSeparation({ latitude: 21.4225, longitude: 39.8262 }, MECCA)).toBeLessThan(0.5);
  });

  it('is 180 for antipodes', () => {
    expect(angularSeparation(MECCA, { latitude: -21.4225, longitude: -140.1738 })).toBeCloseTo(180, 6);
  });

  it('reports a real journey for Dearborn', () => {
    // Dearborn to Makkah is roughly 10,300 km, about 93 degrees of arc.
    expect(angularSeparation(DEARBORN, MECCA)).toBeGreaterThan(80);
    expect(angularSeparation(DEARBORN, MECCA)).toBeLessThan(100);
  });
});

describe('subSolarPoint', () => {
  it('matches solarDeclination for the sub-solar latitude', () => {
    const date = new Date(Date.UTC(2026, 5, 21, 12, 0, 0)); // June solstice, noon UTC
    const point = subSolarPoint(date);
    expect(point.latitude).toBeCloseTo(solarDeclination(date), 10);
  });

  it('places the sub-solar longitude near 0° at 12:00 UTC', () => {
    const date = new Date(Date.UTC(2026, 2, 20, 12, 0, 0));
    const point = subSolarPoint(date);
    expect(Math.abs(point.longitude)).toBeLessThan(1);
  });

  it('places the sub-solar longitude near 180° at 00:00 UTC', () => {
    const date = new Date(Date.UTC(2026, 2, 20, 0, 0, 0));
    const point = subSolarPoint(date);
    expect(Math.abs(Math.abs(point.longitude) - 180)).toBeLessThan(1);
  });

  it('wraps longitude to stay within [-180, 180]', () => {
    const date = new Date(Date.UTC(2026, 2, 20, 23, 0, 0)); // 23:00 UTC → expect ~-165° (11 hours westward from noon), not -195° (unwrapped)
    const point = subSolarPoint(date);
    expect(point.longitude).toBeGreaterThanOrEqual(-180);
    expect(point.longitude).toBeLessThanOrEqual(180);
    expect(point.longitude).toBeCloseTo(-165, 0);
  });

  it('matches Mecca longitude near solar noon', () => {
    const date = new Date(Date.UTC(2026, 2, 20, 9, 20, 0)); // ~solar noon at Mecca (~09:20 UTC)
    const point = subSolarPoint(date);
    expect(point.longitude).toBeCloseTo(MECCA.longitude, 0); // Should be near +39.83°
  });
});

describe('geocentricMoonEcliptic', () => {
  it('reproduces Meeus example 47.a (1992 Apr 12, 0h)', () => {
    const date = new Date(Date.UTC(1992, 3, 12, 0, 0, 0));
    const { longitudeDeg, latitudeDeg } = geocentricMoonEcliptic(date);
    // Book values: lambda = 133.162655, beta = -3.229126. The periodic
    // series used here is Meeus's own ("Astronomical Formulas for
    // Calculators", ch. 30); the edition-to-edition coefficient drift keeps
    // lambda within a couple of hundredths of a degree.
    expect(longitudeDeg).toBeCloseTo(133.162655, 1);
    expect(latitudeDeg).toBeCloseTo(-3.229126, 2);
  });
});

describe('subLunarPoint', () => {
  it('lands on the JPL-validated sub-lunar point for 2026-08-24 12:00 UTC', () => {
    // NASA JPL Horizons apparent place for that moment: RA 291.5473°,
    // Dec -25.4289°; subtracting GMST gives longitude +138.76°.
    const p = subLunarPoint(new Date(Date.UTC(2026, 7, 24, 12, 0, 0)));
    expect(p.latitude).toBeCloseTo(-25.43, 1);
    expect(p.longitude).toBeCloseTo(138.76, 1);
  });

  it('stays within the Moon\'s declination band (max ~±28.6°)', () => {
    for (let day = 0; day < 60; day++) {
      const p = subLunarPoint(new Date(Date.UTC(2026, 0, 1 + day, 6, 0, 0)));
      expect(Math.abs(p.latitude)).toBeLessThanOrEqual(28.7);
    }
  });

  it('drifts east ~12.2°/day (the Moon gains on the rotating earth)', () => {
    const a = subLunarPoint(new Date(Date.UTC(2026, 7, 24, 12, 0, 0)));
    const b = subLunarPoint(new Date(Date.UTC(2026, 7, 25, 12, 0, 0)));
    let drift = b.longitude - a.longitude;
    drift = ((drift + 180) % 360 + 360) % 360 - 180; // normalize to [-180, 180]
    expect(drift).toBeGreaterThan(11);
    expect(drift).toBeLessThan(13.5);
  });

  it('shares the globe frame with subSolarPoint (unit direction)', () => {
    const p = subLunarPoint(new Date(Date.UTC(2026, 7, 24, 12, 0, 0)));
    expect(len(latLonToVec3(p.latitude, p.longitude))).toBeCloseTo(1, 10);
  });
});

describe('moonIllumination', () => {
  it('is near zero at the 2025-01-29 new moon', () => {
    expect(moonIllumination(new Date(Date.UTC(2025, 0, 29, 12, 36)))).toBeLessThan(0.02);
  });

  it('is near one at the 2025-02-12 full moon', () => {
    expect(moonIllumination(new Date(Date.UTC(2025, 1, 12, 13, 53)))).toBeGreaterThan(0.98);
  });

  it('is near half at the 2025 first and last quarters', () => {
    expect(Math.abs(moonIllumination(new Date(Date.UTC(2025, 1, 5, 8, 2))) - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(moonIllumination(new Date(Date.UTC(2025, 1, 20, 17, 33))) - 0.5)).toBeLessThan(0.02);
  });
});

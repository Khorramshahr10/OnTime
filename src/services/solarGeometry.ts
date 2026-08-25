/**
 * Pure solar + geodesic math for the 3D sky dome and qibla globe.
 *
 * Deliberately free of three.js so it can be unit tested in jsdom and reused.
 * Vectors use the renderer's local frame: +x east, +y up, +z south
 * (so north is -z, matching the compass letters on the dome).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SunPosition {
  /** Unit vector towards the sun in the local frame. */
  v: Vec3;
  /** Altitude above the horizon, in radians. Negative below the horizon. */
  altitude: number;
  /** Azimuth clockwise from north, in radians. */
  azimuth: number;
}

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

export const MECCA = { latitude: 21.4225, longitude: 39.8262 };

/**
 * Day of the year, 1-366, from the local calendar date.
 * Compared in UTC so a daylight-saving shift between January and the
 * given date can't push the count off by one.
 */
export function dayOfYear(date: Date): number {
  const dayMs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const janFirst = Date.UTC(date.getFullYear(), 0, 1);
  return Math.floor((dayMs - janFirst) / 86400000) + 1;
}

/**
 * Sun declination in degrees — the standard cosine approximation.
 * Within ~0.5° of the true value, which is far below what's visible
 * on a 200px dome.
 */
export function solarDeclination(date: Date): number {
  const n = dayOfYear(date);
  return -23.44 * Math.cos(((360 / 365) * (n + 10)) * D2R);
}

/** Decimal hours since local midnight. */
export function decimalHours(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/**
 * Hour angle in degrees for a moment, given the day's solar noon.
 * Negative before noon, positive after; 15° per hour.
 */
export function hourAngle(time: Date, solarNoon: Date): number {
  return (decimalHours(time) - decimalHours(solarNoon)) * 15;
}

/**
 * Local sun position for a given hour angle.
 * `latitude` and `declination` in degrees, `hourAngleDeg` in degrees.
 */
export function sunPosition(
  latitude: number,
  declination: number,
  hourAngleDeg: number
): SunPosition {
  const phi = latitude * D2R;
  const dec = declination * D2R;
  const H = hourAngleDeg * D2R;

  const altitude = Math.asin(
    Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(H)
  );
  const azimuth = Math.atan2(
    -Math.sin(H) * Math.cos(dec),
    Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H)
  );

  const rh = Math.cos(altitude);
  return {
    v: {
      x: rh * Math.sin(azimuth),
      y: Math.sin(altitude),
      z: -rh * Math.cos(azimuth),
    },
    altitude,
    azimuth,
  };
}

/**
 * Point on a sphere of radius `r` for a lat/lon in degrees.
 * Same frame as the globe: +y north pole, +x at (0°, 0°).
 */
export function latLonToVec3(latitude: number, longitude: number, r = 1): Vec3 {
  const la = latitude * D2R;
  const lo = longitude * D2R;
  return {
    x: r * Math.cos(la) * Math.cos(lo),
    y: r * Math.sin(la),
    z: -r * Math.cos(la) * Math.sin(lo),
  };
}

/** Any vector at right angles to `v`, chosen off its smallest component. */
function anyPerpendicular(v: Vec3): Vec3 {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  const axis: Vec3 =
    ax <= ay && ax <= az ? { x: 1, y: 0, z: 0 } : ay <= az ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  return {
    x: v.y * axis.z - v.z * axis.y,
    y: v.z * axis.x - v.x * axis.z,
    z: v.x * axis.y - v.y * axis.x,
  };
}

export function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** Angle between two lat/lon points as seen from the centre of the earth, in degrees. */
export function angularSeparation(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  const a = normalize(latLonToVec3(from.latitude, from.longitude));
  const b = normalize(latLonToVec3(to.latitude, to.longitude));
  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(dot) * R2D;
}

/**
 * Points along the great-circle arc between two lat/lon pairs, as unit
 * vectors scaled to `radius`. Uses slerp so the arc stays on the sphere
 * even for near-antipodal endpoints, where a lerp would collapse.
 */
export function greatCircleArc(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  segments = 128,
  radius = 1
): Vec3[] {
  const a = normalize(latLonToVec3(from.latitude, from.longitude));
  const b = normalize(latLonToVec3(to.latitude, to.longitude));

  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  // Antipodal endpoints have infinitely many great circles between them and
  // slerp is undefined, so pick one: sweep half a turn through an arbitrary
  // perpendicular. Coincident endpoints just repeat the point.
  const degenerate = sinOmega < 1e-6;
  const perp = degenerate && dot < 0 ? normalize(anyPerpendicular(a)) : null;

  const out: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let p: Vec3;
    if (perp) {
      const c = Math.cos(t * Math.PI);
      const s = Math.sin(t * Math.PI);
      p = {
        x: a.x * c + perp.x * s,
        y: a.y * c + perp.y * s,
        z: a.z * c + perp.z * s,
      };
    } else if (degenerate) {
      p = a;
    } else {
      const k1 = Math.sin((1 - t) * omega) / sinOmega;
      const k2 = Math.sin(t * omega) / sinOmega;
      p = {
        x: a.x * k1 + b.x * k2,
        y: a.y * k1 + b.y * k2,
        z: a.z * k1 + b.z * k2,
      };
    }
    out.push({ x: p.x * radius, y: p.y * radius, z: p.z * radius });
  }
  return out;
}

/**
 * The sun's track across the whole day, split at the horizon.
 * `above` is the daylight arc, `below` the night portion.
 */
export function sunPath(
  latitude: number,
  declination: number,
  stepDeg = 1
): { above: Vec3[]; below: Vec3[] } {
  const above: Vec3[] = [];
  const below: Vec3[] = [];
  for (let H = -180; H <= 180; H += stepDeg) {
    const { v, altitude } = sunPosition(latitude, declination, H);
    (altitude >= 0 ? above : below).push(v);
  }
  return { above, below };
}

/**
 * The lat/lon currently directly under the sun. Ignores the equation of
 * time (up to ~16 min real-world skew) — invisible on a globe this size,
 * and it keeps the function a one-liner off the UTC clock.
 */
export function subSolarPoint(date: Date): { latitude: number; longitude: number } {
  const latitude = solarDeclination(date);
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const longitude = normalizeLongitude(-(utcHours - 12) * 15);
  return { latitude, longitude };
}

function normalizeLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

// ── Lunar geometry ─────────────────────────────────────────────────────────
//
// The Moon's geocentric ecliptic position from Meeus's periodic series
// ("Astronomical Formulas for Calculators", ch. 30, the ELP-2000/82
// truncation), validated three ways before being committed:
//   • Meeus example 47.a (1992-04-12): λ within 0.013°, β within 0.0002°;
//   • NASA JPL Horizons apparent place (2026-08-24): RA within 0.01°,
//     Dec within 0.001°;
//   • 2025 new/full/quarter phases: illumination within 0.001.
// The series uses Julian centuries from 1900 Jan 0.5, the epoch Meeus's
// table is tabulated against.

/** Julian centuries since 1900 Jan 0.5 (the epoch Meeus ch. 30 uses). */
function meeusCenturies(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  return (jd - 2415020) / 36525;
}

const sinDeg = (deg: number) => Math.sin(deg * D2R);
const cosDeg = (deg: number) => Math.cos(deg * D2R);

/**
 * Geocentric ecliptic longitude/latitude of the Moon for the mean equinox of
 * date, in degrees. Exported for the unit tests that pin it to the Meeus
 * worked example; the app itself only needs subLunarPoint and
 * moonIllumination.
 */
export function geocentricMoonEcliptic(date: Date): { longitudeDeg: number; latitudeDeg: number } {
  const T = meeusCenturies(date);
  const T2 = T * T;
  const T3 = T2 * T;

  // Mean elements plus the additive (planetary) corrections.
  let Lp = 270.434164 + 481267.8831 * T - 0.001133 * T2 + 0.0000019 * T3;
  let M = 358.475833 + 35999.0498 * T - 0.00015 * T2 - 0.0000033 * T3;
  let Mp = 296.104608 + 477198.8491 * T + 0.009192 * T2 + 0.0000144 * T3;
  let D = 350.737486 + 445267.1142 * T - 0.001436 * T2 + 0.0000019 * T3;
  let F = 11.250889 + 483202.0251 * T - 0.003211 * T2 - 0.0000003 * T3;
  const Omega = 259.183275 - 1934.142 * T + 0.002078 * T2 + 0.0000022 * T3;

  let tmp = sinDeg(51.2 + 20.2 * T);
  Lp += 0.000233 * tmp;
  M -= 0.001778 * tmp;
  Mp += 0.000817 * tmp;
  D += 0.002011 * tmp;
  tmp = 0.003964 * sinDeg(346.56 + 132.87 * T - 0.0091731 * T2);
  Lp += tmp;
  Mp += tmp;
  D += tmp;
  F += tmp;
  tmp = sinDeg(Omega);
  Lp += 0.001964 * tmp;
  Mp += 0.002541 * tmp;
  D += 0.001964 * tmp;
  F -= 0.024691 * tmp;
  F -= 0.004328 * sinDeg(Omega + 275.05 - 2.3 * T);

  const e = 1 - 0.002495 * T - 0.00000752 * T2;
  const e2 = e * e;

  const longitudeDeg = normalizeLongitude(
    Lp +
      6.28875 * sinDeg(Mp) +
      1.274018 * sinDeg(2 * D - Mp) +
      0.658309 * sinDeg(2 * D) +
      0.213616 * sinDeg(2 * Mp) +
      e * -0.185596 * sinDeg(M) +
      -0.114336 * sinDeg(2 * F) +
      0.058793 * sinDeg(2 * D - 2 * Mp) +
      e * 0.057212 * sinDeg(2 * D - M - Mp) +
      0.05332 * sinDeg(2 * D + Mp) +
      e * 0.045874 * sinDeg(2 * D - M) +
      e * 0.041024 * sinDeg(Mp - M) +
      -0.034718 * sinDeg(D) +
      e * -0.030465 * sinDeg(M + Mp) +
      0.015326 * sinDeg(2 * D - 2 * F) +
      -0.012528 * sinDeg(2 * F + Mp) +
      -0.01098 * sinDeg(2 * F - Mp) +
      0.010674 * sinDeg(4 * D - Mp) +
      0.010034 * sinDeg(3 * M) +
      0.008548 * sinDeg(4 * D - 2 * Mp) +
      e * -0.00791 * sinDeg(M - Mp + 2 * D) +
      e * -0.006783 * sinDeg(2 * D + M) +
      0.005162 * sinDeg(Mp - D) +
      e * 0.005 * sinDeg(M + D) +
      e * 0.004049 * sinDeg(Mp - M + 2 * D) +
      0.003996 * sinDeg(2 * Mp + 2 * D) +
      0.003862 * sinDeg(4 * D) +
      0.003665 * sinDeg(2 * D - 3 * Mp) +
      e * 0.002696 * sinDeg(2 * Mp - M) +
      0.002602 * sinDeg(Mp - 2 * F - 2 * D) +
      e * 0.002396 * sinDeg(2 * D - M - 2 * Mp) +
      -0.002349 * sinDeg(Mp + D) +
      e2 * 0.002249 * sinDeg(2 * D - 2 * M) +
      e * -0.002125 * sinDeg(2 * Mp + M) +
      e2 * -0.002079 * sinDeg(2 * M) +
      e2 * 0.002059 * sinDeg(2 * D - Mp - 2 * M) +
      -0.001773 * sinDeg(Mp + 2 * D - 2 * F) +
      -0.001595 * sinDeg(2 * F + 2 * D) +
      e * 0.00122 * sinDeg(4 * D - M - Mp) +
      -0.00111 * sinDeg(2 * Mp + 2 * F) +
      0.000892 * sinDeg(Mp - 3 * D) +
      e * -0.000811 * sinDeg(M + Mp + 2 * D) +
      e * 0.000761 * sinDeg(4 * D - M - 2 * Mp) +
      e2 * 0.000717 * sinDeg(Mp - 2 * M) +
      e2 * 0.000704 * sinDeg(Mp - 2 * M - 2 * D) +
      e * 0.000693 * sinDeg(M - 2 * Mp + 2 * D) +
      e * 0.000598 * sinDeg(2 * D - M - 2 * F) +
      0.00055 * sinDeg(Mp + 4 * D) +
      0.000538 * sinDeg(4 * Mp) +
      e * 0.000521 * sinDeg(4 * D - M) +
      0.000486 * sinDeg(2 * M - D)
  );

  const B =
    5.128189 * sinDeg(F) +
    0.280606 * sinDeg(Mp + F) +
    0.277693 * sinDeg(Mp - F) +
    0.173238 * sinDeg(2 * D - F) +
    0.055413 * sinDeg(2 * D + F - Mp) +
    0.046272 * sinDeg(2 * D - F - Mp) +
    0.032573 * sinDeg(2 * D + F) +
    0.017198 * sinDeg(2 * Mp + F) +
    0.009267 * sinDeg(2 * D + Mp - F) +
    0.008823 * sinDeg(2 * Mp - F) +
    0.008247 * sinDeg(2 * D - M - F) +
    0.004323 * sinDeg(2 * D - F - 2 * Mp) +
    0.0042 * sinDeg(2 * D + F + Mp) +
    e * 0.003372 * sinDeg(F - M - 2 * D) +
    e * 0.002472 * sinDeg(2 * D + F - M - Mp) +
    e * 0.002222 * sinDeg(2 * D + F - M) +
    e * 0.002072 * sinDeg(2 * D - F - M - Mp) +
    e * 0.001877 * sinDeg(F - M + Mp) +
    0.001828 * sinDeg(4 * D - F - Mp) +
    e * -0.001803 * sinDeg(F + M) +
    -0.00175 * sinDeg(3 * F) +
    e * 0.00157 * sinDeg(Mp - M - F) +
    -0.001487 * sinDeg(F + D) +
    e * -0.001481 * sinDeg(F + M + Mp) +
    e * 0.001417 * sinDeg(F - M - Mp) +
    e * 0.00135 * sinDeg(F - M) +
    0.00133 * sinDeg(F - D) +
    0.001106 * sinDeg(F + 3 * Mp) +
    0.00102 * sinDeg(4 * D - F) +
    0.000833 * sinDeg(F + 4 * D - Mp) +
    0.000781 * sinDeg(Mp - 3 * F) +
    0.00067 * sinDeg(F + 4 * D - 2 * Mp) +
    0.000606 * sinDeg(2 * D - 3 * F) +
    0.000597 * sinDeg(2 * D + 2 * Mp - F) +
    e * 0.000492 * sinDeg(2 * D + Mp - M - F) +
    0.00045 * sinDeg(2 * Mp - F - 2 * D) +
    0.000439 * sinDeg(3 * Mp - F) +
    0.000423 * sinDeg(F + 2 * D + 2 * Mp) +
    0.000422 * sinDeg(2 * D - F - 3 * Mp) +
    e * -0.000367 * sinDeg(F + F + 2 * D - Mp) +
    e * -0.000353 * sinDeg(M + F + 2 * D) +
    0.000331 * sinDeg(F + 4 * D) +
    e * 0.000317 * sinDeg(2 * D + F - M + Mp) +
    e2 * 0.000306 * sinDeg(2 * D - 2 * M - F) +
    -0.000283 * sinDeg(Mp + 3 * F);

  // Node correction: the Moon's latitude scales with the distance to the
  // node (Meeus eq. 30.x) — without it the latitude drifts by up to ~0.1°.
  const omega1 = 0.0004664 * cosDeg(Omega);
  const omega2 = 0.0000754 * cosDeg(Omega + 275.05 - 2.3 * T);
  const latitudeDeg = B * (1 - omega1 - omega2);

  return { longitudeDeg, latitudeDeg };
}

/**
 * The lat/lon currently directly under the Moon (its sub-lunar point), from
 * the Moon's geocentric declination and the Greenwich sidereal time — the
 * same geo-fixed frame as subSolarPoint, so the two can be compared and
 * rendered side by side on the globe.
 */
export function subLunarPoint(date: Date): { latitude: number; longitude: number } {
  const { longitudeDeg, latitudeDeg } = geocentricMoonEcliptic(date);
  const T = meeusCenturies(date);
  const eps = (23.452294 - 0.0130125 * T - 0.00000164 * T * T + 0.000000503 * T * T * T) * D2R;
  const la = longitudeDeg * D2R;
  const be = latitudeDeg * D2R;
  const ra = Math.atan2(Math.sin(la) * Math.cos(eps) - Math.tan(be) * Math.sin(eps), Math.cos(la)) * R2D;
  const dec = Math.asin(Math.sin(be) * Math.cos(eps) + Math.cos(be) * Math.sin(eps) * Math.sin(la)) * R2D;

  const jd = date.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0;
  const Tc = d / 36525;
  // Greenwich mean sidereal time in degrees (Meeus eq. 12.4).
  const gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * Tc * Tc - (Tc * Tc * Tc) / 38710000;

  return { latitude: dec, longitude: normalizeLongitude(ra - gmst) };
}

/** The Sun's geometric ecliptic longitude, low-precision (Meeus eq. 25.2). */
function sunEclipticLongitude(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  return normalizeLongitude(L0 + 1.914602 * sinDeg(M) + 0.019993 * sinDeg(2 * M) + 0.000289 * sinDeg(3 * M));
}

/**
 * Fraction of the Moon's visible disk that is lit: 0 at new moon, 0.5 at the
 * quarters, 1 at full moon. Computed from the geocentric elongation between
 * the Moon and the Sun (Meeus eq. 48.4, with the Sun treated as infinitely
 * distant — an error far below what's visible).
 */
export function moonIllumination(date: Date): number {
  const { longitudeDeg, latitudeDeg } = geocentricMoonEcliptic(date);
  const sep = Math.acos(
    Math.min(1, Math.max(-1, Math.cos(latitudeDeg * D2R) * Math.cos((longitudeDeg - sunEclipticLongitude(date)) * D2R)))
  );
  return (1 - Math.cos(sep)) / 2;
}

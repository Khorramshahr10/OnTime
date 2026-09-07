import ThreeSlippyMapGlobe from 'three-slippy-map-globe';

/**
 * Regression guard for the tile-level thresholds in
 * `patches/three-slippy-map-globe+1.0.6.patch`.
 *
 * The engine picks its level as the first threshold <= the camera distance,
 * measured in globe-radius units. The patched table used to begin
 * 100/90/80/70/60 — all above any altitude the app can reach (max is
 * MAX_DISTANCE / GLOBE_RADIUS = 35) — so indices 0-4 were unreachable and the
 * level pinned to 5 at the default home framing: 1024 tiles instead of 16,
 * fetched on every cold start of the home globe.
 *
 * The altitudes below are the ones `src/components/three/homeGlobe.ts` uses.
 */
const HOME_ALTITUDE = 2.5; // default framing
const FOCUS_ALTITUDE = 0.5; // "My location" fly-in
const MIN_ALTITUDE = 0.06; // pinch floor
const MAX_ALTITUDE = 35; // MAX_DISTANCE 3500 / GLOBE_RADIUS 100

/** The engine's own selection rule, restated so the test can drive it. */
function levelFor(cameraDistance: number, thresholds: number[]): number {
  const idx = thresholds.findIndex((t) => t && t <= cameraDistance);
  return idx < 0 ? thresholds.length : idx;
}

/** Upstream's unpatched ramp, for comparison. */
const upstreamThresholds = Array.from({ length: 30 }, (_, i) => 8 / Math.pow(2, i));

describe('globe tile level selection (GL-1)', () => {
  const engine = new ThreeSlippyMapGlobe(100) as unknown as { thresholds: number[] };
  const thresholds = engine.thresholds;

  it('exposes a usable threshold table', () => {
    expect(Array.isArray(thresholds)).toBe(true);
    expect(thresholds.length).toBeGreaterThan(8);
  });

  it('keeps the ramp monotonically non-increasing', () => {
    // A flat or rising prefix is what made whole levels unreachable.
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeLessThanOrEqual(thresholds[i - 1]);
    }
  });

  it('uses the coarse 16-tile level at the default home framing', () => {
    expect(levelFor(HOME_ALTITUDE, thresholds)).toBe(2);
  });

  it('matches upstream at every altitude the app actually uses', () => {
    for (const altitude of [MAX_ALTITUDE, HOME_ALTITUDE, 1.0, FOCUS_ALTITUDE, 0.25]) {
      expect(levelFor(altitude, thresholds)).toBe(levelFor(altitude, upstreamThresholds));
    }
  });

  it('still caps the deepest pinch at level 7, not upstream level 8', () => {
    // Level 8 is 65536 tiles; the library only builds lookup octrees up to 7,
    // which is the explosion the patch was originally written to prevent.
    expect(levelFor(MIN_ALTITUDE, thresholds)).toBe(7);
    expect(levelFor(MIN_ALTITUDE, upstreamThresholds)).toBe(8);
  });

  it('never selects a level above 7 anywhere in the app altitude range', () => {
    for (let alt = MIN_ALTITUDE; alt <= MAX_ALTITUDE; alt *= 1.5) {
      expect(levelFor(alt, thresholds)).toBeLessThanOrEqual(7);
    }
  });
});

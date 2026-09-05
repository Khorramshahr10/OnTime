import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from '../context/LocationContext';
import { useQibla } from '../hooks/useQibla';
import { GlobeLoader, GLOBE_LOADER_FADE_MS } from './GlobeLoader';
import type { PrayerTime } from '../types';
import type { HomeGlobe } from './three/homeGlobe';

const HomeGlobeView = lazy(() =>
  import('./three/Scenes').then((m) => ({ default: m.HomeGlobeView }))
);

/**
 * Always-dark space backdrop, independent of the app's light/dark theme —
 * the globe is meant to read as a night sky regardless of theme, the same
 * reasoning that already justifies the fixed HUD colours in
 * CountdownTimer/IslamicCountdownTimer. Used both as the wrapper's own
 * background (visible while the WebGL canvas is transparent, per
 * base3d.ts's `alpha: true` renderer) and as SceneHost's `fallback`, so a
 * WebGL-unavailable device still shows an intentional dark scene instead of
 * a blank rect.
 */
const SPACE_BACKDROP = 'radial-gradient(ellipse at 50% 40%, #0d1424 0%, #03050a 70%)';

/**
 * Full-page ambient background for the Home Globe view: starfield, earth,
 * day/night terminator, live clouds. Purely visual — the header and
 * countdown HUD render on top of this as siblings in App.tsx, not inside it.
 */
export function HomeGlobeScreen({ prayers, covered = false }: { prayers: PrayerTime[]; covered?: boolean }) {
  const { location } = useLocation();
  const [now, setNow] = useState(() => new Date());
  const [groundMode, setGroundMode] = useState(false);
  const { deviceHeading, qiblaDirection, accuracy, error, startListening, stopListening } = useQibla();
  const smoothRot = useRef<number | null>(null);
  const [rot, setRot] = useState(0);
  const viewRef = useRef<HomeGlobe | null>(null);
  const coveredRef = useRef(covered);
  // The loader stays up until the globe has drawn its first complete frame,
  // then fades and is unmounted (its animations must not outlive the load).
  const [surfaceReady, setSurfaceReady] = useState(false);
  const [loaderGone, setLoaderGone] = useState(false);

  useEffect(() => {
    coveredRef.current = covered;
    viewRef.current?.setCovered(covered);
  }, [covered]);

  useEffect(() => {
    if (!surfaceReady) return;
    const t = setTimeout(() => setLoaderGone(true), GLOBE_LOADER_FADE_MS);
    return () => clearTimeout(t);
  }, [surfaceReady]);

  // The sun moves a quarter of a degree a minute; a per-minute tick is
  // plenty, lined up with the start of each minute so it never drifts.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = 60000 - (Date.now() % 60000);
      timeout = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, ms);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  // Run the compass only while in ground view — and not under an overlay.
  useEffect(() => {
    if (groundMode && !covered) startListening();
    else {
      stopListening();
      smoothRot.current = null;
    }
  }, [groundMode, covered, startListening, stopListening]);

  const onView = useCallback((view: HomeGlobe) => {
    viewRef.current = view;
    view.onGroundModeChange = setGroundMode;
    view.onSurfaceReady = () => setSurfaceReady(true);
    view.setCovered(coveredRef.current);
  }, []);

  // Smoothed degrees still to turn (positive = to your right). Updated in an
  // effect after commit — mutating the ref during render would be impure
  // under StrictMode's double-render. Layout (not passive) effect: entering
  // ground view would otherwise paint one frame of the stale pre-toggle angle
  // before snapping to the real heading.
  useLayoutEffect(() => {
    let rawRot = 0;
    if (groundMode && accuracy >= 2 && deviceHeading != null) {
      rawRot = ((qiblaDirection - deviceHeading + 540) % 360) - 180;
    }
    if (smoothRot.current === null) smoothRot.current = rawRot;
    else {
      let d = rawRot - smoothRot.current;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      smoothRot.current += d * 0.3;
    }
    const next = Math.round(smoothRot.current);
    setRot((prev) => (prev === next ? prev : next));
  }, [groundMode, accuracy, deviceHeading, qiblaDirection]);

  return (
    <div
      className="absolute inset-0 z-0"
      aria-hidden="true"
      style={{ background: SPACE_BACKDROP, visibility: covered ? 'hidden' : 'visible' }}
    >
      {!loaderGone && <GlobeLoader fading={surfaceReady} />}
      <Suspense fallback={null}>
        <HomeGlobeView
          data={{
            now,
            latitude: location.coordinates.latitude,
            longitude: location.coordinates.longitude,
            prayers,
            groundMode,
            deviceHeading,
            qiblaDirection,
          }}
          // Cross-fades in against the loader once the first complete frame
          // exists — until then the canvas holds a black sphere with the
          // prayer lines already drawn on it, which is not a globe yet.
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            opacity: surfaceReady ? 1 : 0,
            transition: `opacity ${GLOBE_LOADER_FADE_MS}ms ease-out`,
          }}
          fallback={<div className="absolute inset-0" style={{ background: SPACE_BACKDROP }} />}
          onView={onView}
        />
      </Suspense>

      {/* Ground-view (Qibla) toggle */}
      <button
        onClick={() => setGroundMode((v) => !v)}
        className="absolute bottom-4 left-4 z-10 rounded-full px-3 py-1.5 text-xs font-medium
                   bg-[var(--color-card)] text-[var(--color-muted)]
                   border border-[var(--color-border)] shadow-sm"
      >
        {groundMode ? 'Exit ground' : 'Ground view'}
      </button>

      {/* Compass guidance while in ground view */}
      {groundMode && (
        <div
          className="pointer-events-none absolute top-[22%] left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-center text-sm font-medium"
          style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}
        >
          {error ? (
            <span className="text-white/80">Compass unavailable — check location permission</span>
          ) : accuracy < 2 ? (
            <span className="text-white/80">Hold your phone flat · sweep it in a figure-8 to calibrate</span>
          ) : Math.abs(rot) < 4 ? (
            <span className="text-emerald-400">✓ Facing the Qibla</span>
          ) : (
            <span className="text-white/90">
              Turn {Math.abs(rot)}° {rot > 0 ? 'right' : 'left'}
            </span>
          )}
        </div>
      )}

      {/* Required attribution for the Esri + OpenWeatherMap tile layers. */}
      <div
        className="absolute bottom-1 left-2 z-0 text-[9px] leading-tight text-white/35 pointer-events-none select-none"
        aria-hidden="true"
      >
        Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community · Clouds © OpenWeatherMap
      </div>
    </div>
  );
}

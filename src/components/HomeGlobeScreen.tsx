import { lazy, Suspense, useEffect, useState } from 'react';

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
 * No location dependency: the terminator is computed from the sub-solar
 * point in absolute lat/lon space, not relative to the user.
 */
export function HomeGlobeScreen() {
  const [now, setNow] = useState(() => new Date());

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

  return (
    <div className="absolute inset-0 z-0" aria-hidden="true" style={{ background: SPACE_BACKDROP }}>
      <Suspense fallback={null}>
        <HomeGlobeView
          data={{ now }}
          style={{ display: 'block', width: '100%', height: '100%' }}
          fallback={<div className="absolute inset-0" style={{ background: SPACE_BACKDROP }} />}
        />
      </Suspense>
    </div>
  );
}

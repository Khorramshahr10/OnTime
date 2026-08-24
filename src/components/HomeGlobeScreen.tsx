import { lazy, Suspense, useEffect, useState } from 'react';

const HomeGlobeView = lazy(() =>
  import('./three/Scenes').then((m) => ({ default: m.HomeGlobeView }))
);

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
    <div className="absolute inset-0 z-0" aria-hidden="true">
      <Suspense fallback={null}>
        <HomeGlobeView data={{ now }} style={{ display: 'block', width: '100%', height: '100%' }} />
      </Suspense>
    </div>
  );
}

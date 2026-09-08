import { useState, useEffect } from 'react';
import { getTimeUntil } from '../services/prayerService';

/** No target to count to — a polar latitude where the prayer never occurs. */
const NO_COUNTDOWN = { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };

/**
 * Time remaining until an instant, ticking once a second.
 *
 * This lives in its own hook so the per-second state sits with the component
 * that displays it. It used to be held in usePrayerTimes, which App calls — so
 * App re-rendered every second, and with it HomeGlobeScreen (a plain function
 * export), which rebuilt its `data` object and re-ran SceneHost's [data]
 * effect once a second for the life of the app. The applyKey gate absorbed the
 * expensive scene work, so the cost was one string build and compare per
 * second rather than a re-render of the globe, but v1.8.0 made the globe the
 * default view for everyone and none of that work needed doing at all.
 */
export function useCountdown(target: Date | null) {
  const targetMs = target?.getTime() ?? null;
  const [countdown, setCountdown] = useState(() =>
    targetMs === null ? NO_COUNTDOWN : getTimeUntil(new Date(targetMs)),
  );

  // Keyed on the primitive: recalculating upstream builds a fresh Date for the
  // same moment, and keying on the object identity would tear this down and
  // re-register on every recompute.
  useEffect(() => {
    if (targetMs === null) return;
    const update = () => setCountdown(getTimeUntil(new Date(targetMs)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetMs]);

  // Read through rather than stored: with no target the effect has nothing to
  // tick, so held state would keep showing whatever the last real target left
  // behind.
  return targetMs === null ? NO_COUNTDOWN : countdown;
}

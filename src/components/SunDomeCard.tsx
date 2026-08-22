import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation } from '../context/LocationContext';
import { formatTime } from '../services/prayerService';
import type { PrayerTime, PrayerName } from '../types';

const SunDomeView = lazy(() =>
  import('./three/Scenes').then((m) => ({ default: m.SunDomeView }))
);

/** The prayers that get a marker on the dome — Sunrise is left off to keep it readable. */
const MARKED: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

// Taller than the original mock: the markers carry prayer times at a size
// meant to be read at arm's length, and they need the room.
const DOME_HEIGHT = 320;

interface SunDomeCardProps {
  prayers: PrayerTime[];
}

/**
 * "Today's Sky" — the sun's path for the day, where each prayer sits along
 * it, and where the sun is right now.
 */
export function SunDomeCard({ prayers }: SunDomeCardProps) {
  const { location } = useLocation();
  const [now, setNow] = useState(() => new Date());

  // The sun moves a quarter of a degree a minute; a per-minute tick is plenty,
  // and it lines up with the start of each minute so it never drifts.
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

  const latitude = location?.coordinates?.latitude ?? null;

  const data = useMemo(() => {
    const byName = new Map(prayers.map((p) => [p.name, p]));
    const dhuhr = byName.get('dhuhr');
    return {
      latitude,
      solarNoon: dhuhr?.time ?? null,
      marks: MARKED.flatMap((name) => {
        const p = byName.get(name);
        return p ? [{ name: p.label, time: p.time, timeLabel: formatTime(p.time) }] : [];
      }),
      now,
    };
  }, [prayers, latitude, now]);

  return (
    <div className="mb-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
      <div className="flex items-baseline justify-between px-3 pt-3">
        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Today's Sky</p>
        <p className="text-xs text-[var(--color-muted)]">Drag · pinch to zoom</p>
      </div>
      <Suspense fallback={<div style={{ height: DOME_HEIGHT }} />}>
        <SunDomeView data={data} style={{ display: 'block', width: '100%', height: DOME_HEIGHT }} />
      </Suspense>
    </div>
  );
}

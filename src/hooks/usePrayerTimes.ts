import { useState, useEffect, useMemo, useRef } from 'react';
import { calculatePrayerTimes } from '../services/prayerService';
import { useSettings } from '../context/SettingsContext';
import { useLocation } from '../context/LocationContext';
import { useLocalTimeKey } from './useLocalTimeKey';
import type { PrayerTimesData } from '../types';

// setTimeout's delay is a 32-bit signed int; anything longer fires immediately.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
// How often to re-check that the boundary has not passed behind the timeout's
// back — after a sleep, a background spell, or a clock correction.
const BOUNDARY_WATCHDOG_MS = 5000;

export function usePrayerTimes() {
  const { settings } = useSettings();
  const { location } = useLocation();
  const [date, setDate] = useState(new Date());
  const localTimeKey = useLocalTimeKey();

  // Recalculate prayer times when settings, location, or date change
  const prayerData: PrayerTimesData = useMemo(() => {
    return calculatePrayerTimes(
      location.coordinates,
      date,
      settings.calculationMethod,
      settings.asrCalculation
    );
  }, [location.coordinates, date, settings.calculationMethod, settings.asrCalculation]);

  // The device's local time changed under us — a new zone, or the same zone
  // stepping on or off DST. Force a date refresh so the next memo recalculates.
  useEffect(() => {
    setDate(new Date());
  }, [localTimeKey]);

  // Update date at midnight
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    const timeout = setTimeout(() => {
      setDate(new Date());
    }, msUntilMidnight);

    return () => clearTimeout(timeout);
  }, [date]);

  // The next prayer as a primitive instant. Recalculating builds a fresh Date
  // for the same moment, so keying the countdown effect on the object identity
  // would re-run it on every recompute.
  const nextPrayerTimeMs = prayerData.nextPrayerTime?.getTime() ?? null;

  // Which passed target we have already recalculated for, so a target that
  // fails to advance can't spin this effect forever.
  const refreshedForMs = useRef<number | null>(null);

  // Recalculate when the next prayer actually arrives.
  //
  // This used to be a once-a-second interval that also drove a countdown, and
  // that per-second state is why App — and everything under it — re-rendered
  // every second. The countdown moved to useCountdown, next to the components
  // that show it, leaving this hook with the one thing it genuinely has to do:
  // notice the boundary. A single timeout armed at the instant itself is both
  // exact and free.
  //
  // The +250ms matters: setTimeout can fire a hair early, and recalculating
  // while the target is still (just) ahead rebuilds the same instant as a new
  // Date, which re-runs this effect. That is the shape of the render storm
  // PM-1 fixed, so the guard below stays too.
  //
  // The watchdog is there because a timeout alone trusts elapsed time, and a
  // phone does not: it sleeps, it is backgrounded, its clock is corrected. The
  // old per-second poll noticed any of that within a second. This checks the
  // same condition, five seconds apart, and — unlike the poll — sets no state
  // unless the boundary has genuinely passed, so App still re-renders only at
  // boundaries.
  useEffect(() => {
    if (nextPrayerTimeMs === null) return;

    const refresh = () => {
      if (refreshedForMs.current === nextPrayerTimeMs) return;
      refreshedForMs.current = nextPrayerTimeMs;
      setDate(new Date());
    };

    const remaining = nextPrayerTimeMs - Date.now();
    if (remaining <= 0) {
      // Already passed — a stale target from a resume or a settings change.
      const immediate = setTimeout(refresh, 0);
      return () => clearTimeout(immediate);
    }

    // setTimeout's delay is a 32-bit signed int; a longer one fires at once.
    const timer = setTimeout(refresh, Math.min(remaining + 250, MAX_TIMEOUT_MS));
    const watchdog = setInterval(() => {
      if (nextPrayerTimeMs - Date.now() <= 0) refresh();
    }, BOUNDARY_WATCHDOG_MS);

    return () => {
      clearTimeout(timer);
      clearInterval(watchdog);
    };
  }, [nextPrayerTimeMs]);

  return {
    ...prayerData,
    date,
  };
}
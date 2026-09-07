import { useState, useEffect, useMemo, useRef } from 'react';
import { calculatePrayerTimes, getTimeUntil } from '../services/prayerService';
import { useSettings } from '../context/SettingsContext';
import { useLocation } from '../context/LocationContext';
import { useTimezone } from './useTimezone';
import type { PrayerTimesData } from '../types';

export function usePrayerTimes() {
  const { settings } = useSettings();
  const { location } = useLocation();
  const [date, setDate] = useState(new Date());
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const timezone = useTimezone();

  // Recalculate prayer times when settings, location, or date change
  const prayerData: PrayerTimesData = useMemo(() => {
    return calculatePrayerTimes(
      location.coordinates,
      date,
      settings.calculationMethod,
      settings.asrCalculation
    );
  }, [location.coordinates, date, settings.calculationMethod, settings.asrCalculation]);

  // When the timezone changes, force a date refresh so the next memo recalculates
  useEffect(() => {
    setDate(new Date());
  }, [timezone]);

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
  // fails to advance can't spin this effect once per second forever.
  const refreshedForMs = useRef<number | null>(null);

  // Update countdown every second
  useEffect(() => {
    if (nextPrayerTimeMs === null) return;

    const updateCountdown = () => {
      setCountdown(getTimeUntil(new Date(nextPrayerTimeMs)));

      // Recalculate only once the target has genuinely passed. getTimeUntil
      // floors to whole seconds, so its totalSeconds reads 0 for the entire
      // final second while the target is still ahead — refreshing on that
      // rebuilt the same instant with a new Date identity, re-ran this effect,
      // and spun until the wall clock crossed the prayer time.
      if (nextPrayerTimeMs - Date.now() <= 0 && refreshedForMs.current !== nextPrayerTimeMs) {
        refreshedForMs.current = nextPrayerTimeMs;
        setDate(new Date());
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [nextPrayerTimeMs]);

  return {
    ...prayerData,
    countdown,
    date,
  };
}
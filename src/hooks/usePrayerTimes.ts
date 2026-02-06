import { useState, useEffect, useMemo } from 'react';
import { calculatePrayerTimes, getTimeUntil } from '../services/prayerService';
import { useSettings } from '../context/SettingsContext';
import { useLocation } from '../context/LocationContext';
import type { PrayerTimesData } from '../types';

export function usePrayerTimes() {
  const { settings } = useSettings();
  const { location } = useLocation();
  const [date, setDate] = useState(new Date());
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });

  // Recalculate prayer times when settings or location change
  const prayerData: PrayerTimesData = useMemo(() => {
    return calculatePrayerTimes(
      location.coordinates,
      date,
      settings.calculationMethod,
      settings.asrCalculation
    );
  }, [location.coordinates, date, settings.calculationMethod, settings.asrCalculation]);

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

  // Update countdown every second
  useEffect(() => {
    if (!prayerData.nextPrayerTime) return;

    const updateCountdown = () => {
      const timeUntil = getTimeUntil(prayerData.nextPrayerTime!);
      setCountdown(timeUntil);

      // If countdown finished, trigger recalculation
      if (timeUntil.totalSeconds <= 0) {
        setDate(new Date());
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [prayerData.nextPrayerTime]);

  return {
    ...prayerData,
    countdown,
    date,
  };
}

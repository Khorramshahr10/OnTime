import { useEffect, useCallback } from 'react';
import { scheduleNotifications, scheduleJumuahNotifications, scheduleSurahKahfNotifications, setupNotificationListeners } from '../services/notificationService';
import { useSettings } from '../context/SettingsContext';
import { useLocation } from '../context/LocationContext';

export function useNotifications(enabled = true) {
  const { settings } = useSettings();
  const { location } = useLocation();
  const masterEnabled = enabled && settings.notifications.enabled;

  // Schedule prayer notifications whenever location or settings change
  const reschedule = useCallback(async () => {
    await scheduleNotifications(location.coordinates, settings);
  }, [location.coordinates, settings]);

  // Schedule Jumuah notifications when settings change
  const rescheduleJumuah = useCallback(async () => {
    await scheduleJumuahNotifications(settings.jumuah);
  }, [settings.jumuah]);

  // Schedule Surah Kahf notifications when location or settings change
  const rescheduleSurahKahf = useCallback(async () => {
    await scheduleSurahKahfNotifications(
      location.coordinates,
      settings.surahKahf,
      settings.calculationMethod,
      settings.asrCalculation,
    );
  }, [location.coordinates, settings.surahKahf, settings.calculationMethod, settings.asrCalculation]);

  // Debounce rescheduling to prevent race conditions when settings change rapidly.
  // Not gated on the master switch: with notifications disabled, reschedule is
  // exactly what cancels everything.
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => { reschedule(); }, 300);
    return () => clearTimeout(timer);
  }, [reschedule, enabled]);

  // Gated on the master switch: disabling cancels these via reschedule's
  // cancel-all, and re-enabling must bring them back — their own settings
  // objects don't change identity when the master toggle flips, so without
  // this dependency they would silently stay dead until app restart.
  useEffect(() => {
    if (!masterEnabled) return;
    const timer = setTimeout(() => { rescheduleJumuah(); }, 300);
    return () => clearTimeout(timer);
  }, [rescheduleJumuah, masterEnabled]);

  useEffect(() => {
    if (!masterEnabled) return;
    const timer = setTimeout(() => { rescheduleSurahKahf(); }, 300);
    return () => clearTimeout(timer);
  }, [rescheduleSurahKahf, masterEnabled]);

  // Set up notification click listener
  useEffect(() => {
    const cleanup = setupNotificationListeners((prayerName) => {
      console.log(`Notification clicked for: ${prayerName}`);
    });

    return cleanup;
  }, []);

  return { reschedule, rescheduleJumuah, rescheduleSurahKahf };
}

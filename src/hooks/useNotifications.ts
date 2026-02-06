import { useEffect, useCallback } from 'react';
import { scheduleNotifications, scheduleJumuahNotifications, setupNotificationListeners } from '../services/notificationService';
import { useSettings } from '../context/SettingsContext';
import type { PrayerTime } from '../types';

export function useNotifications(prayers: PrayerTime[]) {
  const { settings } = useSettings();

  // Schedule prayer notifications whenever prayers or settings change
  const reschedule = useCallback(async () => {
    if (prayers.length > 0) {
      await scheduleNotifications(prayers, settings);
    }
  }, [prayers, settings]);

  // Schedule Jumuah notifications when settings change
  const rescheduleJumuah = useCallback(async () => {
    await scheduleJumuahNotifications(settings.jumuah);
  }, [settings.jumuah]);

  useEffect(() => {
    reschedule();
  }, [reschedule]);

  useEffect(() => {
    rescheduleJumuah();
  }, [rescheduleJumuah]);

  // Set up notification click listener
  useEffect(() => {
    const cleanup = setupNotificationListeners((prayerName) => {
      console.log(`Notification clicked for: ${prayerName}`);
      // Could navigate to specific prayer or show details
    });

    return cleanup;
  }, []);

  return { reschedule, rescheduleJumuah };
}

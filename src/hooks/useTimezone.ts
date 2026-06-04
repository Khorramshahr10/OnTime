import { useState, useEffect } from 'react';
import { App } from '@capacitor/app';
import { getTimezone } from '../services/prayerService';

export function useTimezone(): string {
  const [timezone, setTimezone] = useState<string>(getTimezone);

  useEffect(() => {
    let listenerHandle: { remove: () => void } | undefined;

    const checkAndUpdate = () => {
      const current = getTimezone();
      setTimezone((prev) => (prev !== current ? current : prev));
    };

    App.addListener('appStateChange', (state: { isActive: boolean }) => {
      if (state.isActive) {
        checkAndUpdate();
      }
    }).then((handle) => {
      listenerHandle = handle;
    });

    // Re-check every hour for DST transitions while the app is open
    const interval = setInterval(checkAndUpdate, 60 * 60 * 1000);

    return () => {
      clearInterval(interval);
      listenerHandle?.remove();
    };
  }, []);

  return timezone;
}
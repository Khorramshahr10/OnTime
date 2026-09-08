import { useState, useEffect } from 'react';
import { App } from '@capacitor/app';
import { getTimezone } from '../services/prayerService';

/**
 * A key that changes whenever the device's idea of local time changes — the
 * zone itself, or the offset that zone is currently on.
 *
 * The offset half is the whole point, and this hook used to be missing it.
 * It compared only `getTimezone()`, the IANA zone *id*, which is identical on
 * both sides of a DST transition: under TZ=America/New_York the January zone
 * and the July zone are both "America/New_York" while the offset moves 300 to
 * 240. So the hourly "DST re-check" could never fire, and the hook — native
 * listener and interval alike — was a no-op, along with the app's only
 * DST-specific refresh path in usePrayerTimes.
 *
 * Correctness survived that by accident: adhan builds prayer Dates from UTC
 * components, so the instants are offset-independent, and the midnight timer
 * happens to re-read the local calendar day. This closes the gap the code
 * always claimed to cover.
 */
function readLocalTimeKey(): string {
  return `${getTimezone()}|${new Date().getTimezoneOffset()}`;
}

export function useLocalTimeKey(): string {
  const [key, setKey] = useState(readLocalTimeKey);

  useEffect(() => {
    // The listener handle only arrives once the plugin's promise resolves, and
    // cleanup can run first — a StrictMode double-mount or a fast unmount. The
    // old code assigned it to a local that cleanup had already read as
    // undefined, so `listenerHandle?.remove()` was a silent no-op and the
    // native listener went on calling setState on a dead hook. Same race the
    // team already fixed in useQibla (C-2); the fix never reached here.
    let stopped = false;
    let handle: { remove: () => void } | undefined;

    const checkAndUpdate = () => {
      const next = readLocalTimeKey();
      setKey((prev) => (prev !== next ? next : prev));
    };

    App.addListener('appStateChange', (state: { isActive: boolean }) => {
      if (state.isActive) checkAndUpdate();
    }).then((h) => {
      if (stopped) {
        h.remove();
        return;
      }
      handle = h;
    });

    // Re-check every hour, so a DST transition that happens while the app sits
    // open is picked up without waiting for a resume.
    const interval = setInterval(checkAndUpdate, 60 * 60 * 1000);

    return () => {
      stopped = true;
      clearInterval(interval);
      handle?.remove();
    };
  }, []);

  return key;
}

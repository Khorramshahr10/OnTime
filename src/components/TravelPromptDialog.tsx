import { useEffect, type MutableRefObject } from 'react';
import { useTravel } from '../context/TravelContext';
import { useSettings } from '../context/SettingsContext';
import { formatDistance } from '../utils/distance';

export function TravelPromptDialog({
  onBackRef,
}: {
  /** Registers "Not now" as the Android back action while this is on screen. */
  onBackRef?: MutableRefObject<(() => void) | null>;
} = {}) {
  const { travelState, confirmTravel, dismissTravel } = useTravel();
  const { settings } = useSettings();

  const distanceKm = travelState.distanceFromHomeKm;
  const showing = travelState.travelPending && distanceKm !== null;
  useEffect(() => {
    if (!onBackRef) return;
    if (showing) onBackRef.current = dismissTravel;
    return () => {
      if (onBackRef.current === dismissTravel) onBackRef.current = null;
    };
  }, [onBackRef, showing, dismissTravel]);

  if (!showing) {
    return null;
  }

  const distanceText = formatDistance(distanceKm, settings.distanceUnit);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-card)] p-6 shadow-xl">
        {/* Icon */}
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
          <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-[var(--color-text)] text-center mb-2">
          Looks like you're traveling
        </h3>

        {/* Body */}
        <p className="text-sm text-[var(--color-muted)] text-center leading-relaxed mb-6">
          You're about {distanceText} from home. Would you like to enable Qasr (shortened) prayers?
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={confirmTravel}
            className="w-full py-3 bg-[var(--color-primary)] text-white font-semibold rounded-lg text-sm"
          >
            Enable Travel Prayers
          </button>
          <button
            onClick={dismissTravel}
            className="w-full py-3 text-[var(--color-muted)] font-medium text-sm rounded-lg hover:bg-[var(--color-background)] transition-colors"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}

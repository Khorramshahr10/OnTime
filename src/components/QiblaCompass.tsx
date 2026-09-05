import { lazy, Suspense, useMemo } from 'react';
import { useLocation } from '../context/LocationContext';
import { QiblaHeadingBar } from './QiblaHeading';
import { useQiblaHeading } from '../hooks/useQiblaHeading';
import { labelForGlobe } from '../utils/placeName';
import { calculateQiblaDirection } from '../services/prayerService';

const QiblaGlobeView = lazy(() =>
  import('./three/Scenes').then((m) => ({ default: m.QiblaGlobeView }))
);
const KaabaMiniView = lazy(() =>
  import('./three/Scenes').then((m) => ({ default: m.KaabaMiniView }))
);

interface QiblaCompassProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QiblaCompass({ isOpen, onClose }: QiblaCompassProps) {
  const { location } = useLocation();

  const { latitude, longitude } = location.coordinates;
  // The globe gets the settlement only — the full name is a street address
  // that overflows the canvas, and the card above already shows it in full.
  const cityName = labelForGlobe(location.shortName || location.cityName || 'You');

  // Gate the magnetometer on the screen actually being open — this component
  // stays mounted for the app's lifetime.
  const heading = useQiblaHeading(isOpen);

  // Feed the compass reading to the globe so it turns with the phone. Rounded
  // to whole degrees so sensor jitter doesn't rebuild the scene every frame.
  const turnDegrees = heading.supported && !heading.unavailable ? Math.round(heading.rotation) : null;

  const globeData = useMemo(
    () => ({ latitude, longitude, cityName, turnDegrees }),
    [latitude, longitude, cityName, turnDegrees]
  );

  if (!isOpen) return null;

  const qiblaDirection = calculateQiblaDirection(location.coordinates);

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-background)] safe-area-top safe-area-bottom animate-slide-in">
      <div className="max-w-lg mx-auto h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-[var(--color-card)] transition-colors"
          >
            <svg className="w-6 h-6 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Qibla Direction</h2>
          <div className="w-10" />
        </div>

        {/* Qibla info card */}
        <div className="flex-shrink-0 px-4 pb-3">
          <div className="bg-[var(--color-card)] rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--color-muted)]">From {location.cityName || 'your location'}</p>
                <p className="text-2xl font-bold text-[var(--color-text)]">
                  {Math.round(qiblaDirection)}° <span className="text-base font-normal text-[var(--color-muted)]">{getCardinalDirection(qiblaDirection)}</span>
                </p>
                <p className="text-xs text-[var(--color-muted)] mt-1">Face {getCardinalDirection(qiblaDirection)} to face the Kaaba</p>
              </div>
              <Suspense fallback={<div className="w-24 h-24 flex-shrink-0" />}>
                <KaabaMiniView className="w-24 h-24 flex-shrink-0" />
              </Suspense>
            </div>
          </div>
        </div>

        {/* Live compass */}
        {heading.supported && (
          <QiblaHeadingBar
            rotation={heading.rotation}
            calibrated={heading.calibrated}
            unavailable={heading.unavailable}
          />
        )}

        {/* Great-circle globe */}
        <div className="flex-1 px-4 pb-4 min-h-[260px] flex">
          <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden border border-[var(--color-border)]">
            <Suspense fallback={<div className="absolute inset-0" />}>
              <QiblaGlobeView
                data={globeData}
                className="absolute inset-0"
                fallback={
                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                    <p className="text-sm text-[var(--color-muted)]">
                      Face {Math.round(qiblaDirection)}° ({getCardinalDirection(qiblaDirection)}) from north.
                    </p>
                  </div>
                }
              />
            </Suspense>
            <p className="absolute left-3 bottom-2.5 text-xs text-[var(--color-muted)] pointer-events-none">
              Great-circle bearing · drag to rotate
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}

function getCardinalDirection(degrees: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return dirs[index];
}

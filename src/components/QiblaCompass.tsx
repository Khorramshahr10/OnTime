import { useLocation } from '../context/LocationContext';
import { calculateQiblaDirection } from '../services/prayerService';

interface QiblaCompassProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QiblaCompass({ isOpen, onClose }: QiblaCompassProps) {
  const { location } = useLocation();

  if (!isOpen) return null;

  const userLat = location.coordinates.latitude;
  const userLon = location.coordinates.longitude;
  const qiblaDirection = calculateQiblaDirection(location.coordinates);

  // Tight bbox around user location (~2km view)
  const latSpan = 0.015;
  const lonSpan = 0.025;

  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${userLon - lonSpan},${userLat - latSpan},${userLon + lonSpan},${userLat + latSpan}&layer=mapnik`;

  // Arrow endpoint: extend from center in the Qibla direction
  // qiblaDirection is degrees clockwise from North
  // In SVG: 0° = up (north), 90° = right (east)
  const arrowLength = 38; // % of viewbox from center
  const angleRad = (qiblaDirection * Math.PI) / 180;
  const arrowEndX = 50 + arrowLength * Math.sin(angleRad);
  const arrowEndY = 50 - arrowLength * Math.cos(angleRad);

  // Arrowhead points
  const headLength = 4;
  const headAngle = 25 * (Math.PI / 180);
  const ax1 = arrowEndX - headLength * Math.sin(angleRad - headAngle);
  const ay1 = arrowEndY + headLength * Math.cos(angleRad - headAngle);
  const ax2 = arrowEndX - headLength * Math.sin(angleRad + headAngle);
  const ay2 = arrowEndY + headLength * Math.cos(angleRad + headAngle);

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
              <div className="w-14 h-14 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
                <span className="text-2xl">🕋</span>
              </div>
            </div>
          </div>
        </div>

        {/* Map with arrow overlay */}
        <div className="flex-1 px-4 pb-4">
          <div className="relative w-full h-full rounded-lg overflow-hidden border border-[var(--color-border)]">
            <iframe
              src={mapSrc}
              className="w-full h-full border-0"
              title="Qibla Map"
            />
            {/* SVG overlay: red dot at center + arrow pointing toward Qibla */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Arrow line from center toward Qibla */}
              <line
                x1="50" y1="50"
                x2={arrowEndX} y2={arrowEndY}
                stroke="#dc2626"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              {/* Arrowhead */}
              <polygon
                points={`${arrowEndX},${arrowEndY} ${ax1},${ay1} ${ax2},${ay2}`}
                fill="#dc2626"
              />
              {/* User location red dot with white border */}
              <circle cx="50" cy="50" r="3" fill="#dc2626" stroke="white" strokeWidth="1" />
              {/* Small "N" indicator at top */}
              <text x="50" y="6" textAnchor="middle" fontSize="4" fontWeight="bold" fill="#6b7280">N</text>
            </svg>
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

import { useEffect, useRef, useState } from 'react';
import { headingInstruction, shortestDelta } from '../utils/heading';

/** Accumulates a wrapping angle into one that only ever moves the short way. */
function useContinuousAngle(target: number): number {
  const [angle, setAngle] = useState(target);
  const angleRef = useRef(target);

  useEffect(() => {
    const next = angleRef.current + shortestDelta(angleRef.current, target);
    angleRef.current = next;
    setAngle(next);
  }, [target]);

  return angle;
}

interface QiblaHeadingBarProps {
  rotation: number;
  calibrated: boolean;
  /** Set when the sensor can't be read at all. */
  unavailable?: boolean;
}

/**
 * Presentational half — a dial that turns with the phone and a line telling
 * you which way to move. Kept free of sensor access so it can be rendered
 * and tested without a device.
 */
export function QiblaHeadingBar({ rotation, calibrated, unavailable = false }: QiblaHeadingBarProps) {
  const { aligned, text } = headingInstruction(rotation);
  const smoothed = useContinuousAngle(rotation);
  const accent = aligned && calibrated ? 'var(--color-primary)' : 'var(--color-text)';

  if (unavailable) {
    return (
      <div className="flex-shrink-0 px-4 pb-3">
        <div className="bg-[var(--color-card)] rounded-lg px-4 py-3">
          <p className="text-sm text-[var(--color-muted)]">
            This device has no compass sensor — use the bearing above with a compass app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 px-4 pb-3">
      <div className="bg-[var(--color-card)] rounded-lg p-4 flex items-center gap-4">
        <div className="relative flex-shrink-0" style={{ width: 88, height: 88 }}>
          <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
            <circle cx="44" cy="44" r="40" fill="none" stroke="var(--color-border)" strokeWidth="2" />
            {/* Fixed notch marking the top of the phone — the way you're facing */}
            <path d="M44 2 L40 10 L48 10 Z" fill="var(--color-muted)" />
            <g
              style={{
                transform: `rotate(${smoothed}deg)`,
                transformOrigin: '44px 44px',
                transition: 'transform 140ms linear',
              }}
            >
              <path
                d="M44 14 L53 50 L44 44 L35 50 Z"
                fill={accent}
                stroke={accent}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </g>
            <circle cx="44" cy="44" r="3.5" fill="var(--color-muted)" />
          </svg>
        </div>

        <div className="min-w-0">
          <p
            className="text-xl font-semibold truncate"
            style={{ color: accent }}
            role="status"
            aria-live="polite"
          >
            {text}
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            {calibrated
              ? 'Hold the phone flat, top edge away from you'
              : 'Wave the phone in a figure eight to calibrate'}
          </p>
        </div>
      </div>
    </div>
  );
}

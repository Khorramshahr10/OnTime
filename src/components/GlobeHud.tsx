import { PRAYER_ACCENTS } from '../utils/prayerColors';
import { sunnahSummary } from '../utils/sunnah';
import { formatTime } from '../services/prayerService';
import type { PrayerName, TravelState, DisplaySettings } from '../types';

interface GlobeHudProps {
  currentPrayer: PrayerName | null;
  currentPrayerTime: Date | null;
  nextPrayer: string | null;
  nextPrayerTime: Date | null;
  hours: number;
  minutes: number;
  seconds: number;
  isTraveling?: boolean;
  travelState?: TravelState;
  display: DisplaySettings;
}

const INK = 'rgba(245,246,248,0.96)';
const MUTED = 'rgba(245,246,248,0.55)';
const URGENT = '#ff8a75';
const SHADOW = '0 2px 20px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9)';
/**
 * The countdown warms up only inside the last 20 minutes. The list view's rule
 * (60% through the prayer window) suits a card border but not a 40px number —
 * it turned the digits red with well over an hour still to go.
 */
const URGENT_WITHIN_MIN = 20;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n: number) => n.toString().padStart(2, '0');

/**
 * The prayer HUD for the home globe: what is next, how long, and one quiet
 * line of context. Deliberately three lines rather than the list view's three
 * cards — every row here is drawn over a live earth, so the globe keeps the
 * space and the countdown carries the weight. The accent rule takes the
 * prayer's own colour from the solar lines on the globe.
 */
export function GlobeHud({
  currentPrayer, currentPrayerTime, nextPrayer, nextPrayerTime,
  hours, minutes, seconds, isTraveling = false, travelState, display,
}: GlobeHudProps) {
  let nextLabel = nextPrayer ? capitalize(nextPrayer) : null;
  if (travelState?.isTraveling && nextPrayer) {
    if (nextPrayer === 'dhuhr' && travelState.jamaDhuhrAsr) nextLabel = 'Dhuhr + Asr';
    if (nextPrayer === 'maghrib' && travelState.jamaMaghribIsha) nextLabel = 'Maghrib + Isha';
  }

  // Elapsed since the current prayer began. Derived from the countdown rather
  // than read off the clock: the parent already ticks these props every second,
  // and reading Date.now() here would make the render impure.
  const nowMs = nextPrayerTime
    ? nextPrayerTime.getTime() - (hours * 3600 + minutes * 60 + seconds) * 1000
    : null;
  const isUrgent = hours === 0 && minutes < URGENT_WITHIN_MIN;

  const showNext = !!(display.showNextPrayer && nextLabel);
  // With the next prayer hidden the current one takes the hero slot, so the HUD
  // never collapses to an orphaned context line — but only if the user asked to
  // see the current prayer at all.
  const currentIsHero = !showNext && display.showCurrentPrayer && !!currentPrayer;
  const heroName = showNext ? nextLabel : (currentIsHero ? capitalize(currentPrayer!) : null);
  const heroTime = showNext ? nextPrayerTime : currentPrayerTime;

  // The light weight: this rule sits on the HUD's dark scrim, where the deeper
  // shade the globe's lines use would disappear.
  const accentKey = showNext ? nextPrayer : currentPrayer;
  const accent = accentKey && accentKey in PRAYER_ACCENTS
    ? PRAYER_ACCENTS[accentKey as PrayerName]
    : MUTED;

  let sinceText: string | null = null;
  if (display.showCurrentPrayer && currentPrayer && currentPrayerTime && nowMs !== null) {
    const mins = Math.max(0, Math.floor((nowMs - currentPrayerTime.getTime()) / 60000));
    const h = Math.floor(mins / 60);
    const ago = `${h > 0 ? `${h}h ` : ''}${mins % 60}m ago`;
    // Don't repeat the name when the current prayer is already the headline.
    sinceText = currentIsHero ? `began ${ago}` : `${capitalize(currentPrayer)} began ${ago}`;
  }

  const sunnah = display.showSunnahCard && currentPrayer
    ? sunnahSummary(currentPrayer, isTraveling) : null;
  const context = [sinceText, sunnah].filter(Boolean).join(' · ');

  if (!heroName && !context) return null;

  return (
    <div className="relative">
      {heroName && (
        <div className="flex items-stretch gap-3">
          <div aria-hidden="true" className="w-[3px] rounded-full shrink-0" style={{ background: accent, opacity: 0.9 }} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-medium" style={{ color: INK, textShadow: SHADOW }}>{heroName}</span>
              {heroTime && (
                <span className="text-base" style={{ color: MUTED, textShadow: SHADOW }}>{formatTime(heroTime)}</span>
              )}
            </div>
            {showNext && (
              <div
                className="tabular-nums leading-none mt-1"
                style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em',
                  color: isUrgent ? URGENT : INK, textShadow: SHADOW,
                }}
              >
                {hours}:{pad(minutes)}:{pad(seconds)}
              </div>
            )}
          </div>
        </div>
      )}
      {context && (
        <p className="text-[13px] mt-2" style={{ color: MUTED, textShadow: SHADOW }}>{context}</p>
      )}
    </div>
  );
}

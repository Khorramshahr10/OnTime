import { GlobeHud } from './GlobeHud';
import { CountdownTimer } from './CountdownTimer';
import { IslamicCountdownTimer } from './IslamicCountdownTimer';
import { useCountdown } from '../hooks/useCountdown';
import type { DisplaySettings, PrayerName, PrayerTime, TravelState } from '../types';

interface PrayerCountdownPanelProps {
  prayers: PrayerTime[];
  currentPrayer: PrayerName | null;
  nextPrayer: PrayerName | null;
  nextPrayerTime: Date | null;
  travelState: TravelState;
  display: DisplaySettings;
  /** Globe home gets the condensed HUD; the list gets a card. */
  variant: 'globe' | 'islamic' | 'classic';
}

/**
 * Owns the once-a-second countdown, so App does not.
 *
 * The three renderings differ only in chrome — they take the same props — but
 * the ticking state has to live below App or every second re-renders the whole
 * tree, HomeGlobeScreen included.
 */
export function PrayerCountdownPanel({
  prayers,
  currentPrayer,
  nextPrayer,
  nextPrayerTime,
  travelState,
  display,
  variant,
}: PrayerCountdownPanelProps) {
  const countdown = useCountdown(nextPrayerTime);
  const currentPrayerTime = currentPrayer
    ? prayers.find((p) => p.name === currentPrayer)?.time ?? null
    : null;

  const shared = {
    currentPrayer,
    currentPrayerTime,
    nextPrayer,
    nextPrayerTime,
    hours: countdown.hours,
    minutes: countdown.minutes,
    seconds: countdown.seconds,
    isTraveling: travelState.isTraveling,
    travelState,
    display,
  };

  if (variant === 'globe') return <GlobeHud {...shared} />;
  if (variant === 'islamic') return <IslamicCountdownTimer {...shared} />;
  return <CountdownTimer {...shared} />;
}

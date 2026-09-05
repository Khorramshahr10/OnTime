import type { PrayerName } from '../types';

/**
 * One colour per prayer, shared by the solar lines drawn on the home globe and
 * the globe HUD's accent. They must agree: the point of the accent is that the
 * pink beside "Asr" and the pink circle on the earth are visibly the same
 * thing, so the HUD teaches what the lines mean.
 */
export const PRAYER_COLORS: Record<PrayerName, string> = {
  fajr: '#818cf8', // indigo (pre-dawn)
  sunrise: '#fb923c', // warm orange (sunrise)
  dhuhr: '#22d3ee', // bright cyan (solar noon)
  asr: '#f472b6', // bright pink (afternoon)
  maghrib: '#f87171', // red-orange (sunset)
  isha: '#a78bfa', // purple (night)
};

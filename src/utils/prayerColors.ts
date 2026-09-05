import type { PrayerName } from '../types';

/**
 * One hue per prayer, in two weights, shared by the solar lines on the home
 * globe and the globe HUD. They must stay in step: the point of the HUD accent
 * is that the colour beside "Asr" and the ring drawn across the earth are
 * visibly the same thing, so the HUD teaches what the lines mean.
 *
 * Two weights because the same colour cannot serve both backgrounds. The lines
 * lie on a sunlit earth — pale cloud and ice — where a light tint washes out,
 * so those are the deeper shade. The HUD accent and the on-globe labels sit on
 * dark sky (or on a dark pill), where the deep shade would disappear.
 */
export const PRAYER_COLORS: Record<PrayerName, string> = {
  fajr: '#4f46e5', // indigo (pre-dawn)
  sunrise: '#ea580c', // burnt orange (sunrise)
  dhuhr: '#0891b2', // deep cyan (solar noon)
  asr: '#16a34a', // green (afternoon)
  maghrib: '#dc2626', // deep red (sunset)
  isha: '#7c3aed', // violet (night)
};

/** The light weight: HUD accents and label text over a dark ground. */
export const PRAYER_ACCENTS: Record<PrayerName, string> = {
  fajr: '#a5b4fc',
  sunrise: '#fdba74',
  dhuhr: '#67e8f9',
  asr: '#86efac',
  maghrib: '#fca5a5',
  isha: '#c4b5fd',
};

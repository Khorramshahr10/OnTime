import { calculatePrayerTimes } from '../services/prayerService';
import type { Coordinates } from '../types';

// These tests reason about specific points in Toronto's solar day — "23:00,
// after Isha" — so the runner's timezone has to agree with the location's.
// Otherwise the same wall-clock reading is a different moment relative to
// Toronto's schedule depending on where the suite happens to run, and adhan
// derives the solar day from the passed Date's *local* components. Node re-reads
// TZ when process.env.TZ is assigned.
process.env.TZ = 'America/Toronto';

// Toronto, Canada
const TORONTO: Coordinates = { latitude: 43.6532, longitude: -79.3832 };
// Mecca, Saudi Arabia
const MECCA: Coordinates = { latitude: 21.4225, longitude: 39.8262 };

describe('User story: I see today\'s prayer times for my location', () => {
  const date = new Date(2026, 3, 24); // April 24, 2026

  it('shows all 6 core prayers plus sunnah times for Toronto using ISNA method', () => {
    const result = calculatePrayerTimes(TORONTO, date, 'NorthAmerica', 'Standard');

    const names = result.prayers.map((p) => p.name);
    expect(names).toContain('fajr');
    expect(names).toContain('sunrise');
    expect(names).toContain('dhuhr');
    expect(names).toContain('asr');
    expect(names).toContain('maghrib');
    expect(names).toContain('isha');
    expect(names).toContain('middleOfNight');
    expect(names).toContain('lastThirdOfNight');
  });

  it('returns prayer times as Date objects in chronological order (fajr through isha)', () => {
    const result = calculatePrayerTimes(TORONTO, date, 'NorthAmerica', 'Standard');

    // Core prayers (excluding sunnah/night) should be in order
    const corePrayers = result.prayers.filter(
      (p) => !['middleOfNight', 'lastThirdOfNight', 'tahajjud'].includes(p.name),
    );
    for (let i = 1; i < corePrayers.length; i++) {
      expect(corePrayers[i].time.getTime()).toBeGreaterThan(
        corePrayers[i - 1].time.getTime(),
      );
    }
  });

  it('identifies one prayer as current at any point during the day', () => {
    const result = calculatePrayerTimes(TORONTO, date, 'NorthAmerica', 'Standard');

    // At least one of currentPrayer or nextPrayer should be set
    const hasActive = result.currentPrayer !== null || result.nextPrayer !== null;
    expect(hasActive).toBe(true);
  });

  it('returns different times for different calculation methods', () => {
    const isna = calculatePrayerTimes(TORONTO, date, 'NorthAmerica', 'Standard');
    const mwl = calculatePrayerTimes(TORONTO, date, 'MuslimWorldLeague', 'Standard');

    const isnaFajr = isna.prayers.find((p) => p.name === 'fajr')!.time;
    const mwlFajr = mwl.prayers.find((p) => p.name === 'fajr')!.time;

    // ISNA and MWL use different Fajr angles, so times should differ
    expect(isnaFajr.getTime()).not.toBe(mwlFajr.getTime());
  });

  it('returns different Asr time for Hanafi vs Standard calculation', () => {
    const standard = calculatePrayerTimes(TORONTO, date, 'NorthAmerica', 'Standard');
    const hanafi = calculatePrayerTimes(TORONTO, date, 'NorthAmerica', 'Hanafi');

    const standardAsr = standard.prayers.find((p) => p.name === 'asr')!.time;
    const hanafiAsr = hanafi.prayers.find((p) => p.name === 'asr')!.time;

    // Hanafi Asr is always later than Standard (Shafi)
    expect(hanafiAsr.getTime()).toBeGreaterThan(standardAsr.getTime());
  });

  it('calculates prayer times for Mecca using Umm Al-Qura method', () => {
    const result = calculatePrayerTimes(MECCA, date, 'UmmAlQura', 'Standard');

    expect(result.prayers.length).toBeGreaterThanOrEqual(6);
    expect(result.nextPrayer).not.toBeNull();
  });

  it('always sets nextPrayer even after Isha (wraps to tomorrow Fajr)', () => {
    // 11 PM — after Isha. adhan's nextPrayer() wraps to Fajr here, but
    // timeForPrayer() then returns *this morning's* Fajr, which is in the past.
    // The service has to notice that and fall through to tomorrow's.
    const lateNight = new Date(2026, 3, 24, 23, 0, 0);
    const result = calculatePrayerTimes(TORONTO, lateNight, 'NorthAmerica', 'Standard');

    expect(result.currentPrayer).toBe('isha');
    expect(result.nextPrayer).toBe('fajr');
    expect(result.nextPrayerTime).not.toBeNull();
    expect(result.nextPrayerTime!.getTime()).toBeGreaterThan(lateNight.getTime());
    expect(result.nextPrayerTime!.getDate()).toBe(25);
  });

  it('shows Fajr as next prayer after midnight before Fajr', () => {
    // 2 AM — after midnight, before Fajr. Nothing is "current" yet, but the
    // next prayer is today's Fajr, not tomorrow's.
    const earlyMorning = new Date(2026, 3, 24, 2, 0, 0);
    const result = calculatePrayerTimes(TORONTO, earlyMorning, 'NorthAmerica', 'Standard');

    expect(result.currentPrayer).toBeNull();
    expect(result.nextPrayer).toBe('fajr');
    expect(result.nextPrayerTime).not.toBeNull();
    expect(result.nextPrayerTime!.getTime()).toBeGreaterThan(earlyMorning.getTime());
    expect(result.nextPrayerTime!.getDate()).toBe(24);
  });

  it('resolves current and next against the date argument, not the wall clock', () => {
    // The two used to be read from `new Date()` inside adhan while the rest of
    // the function used the passed-in date, so a caller passing anything other
    // than "now" could get a self-contradictory pair.
    const morning = new Date(2026, 3, 24, 9, 0, 0);
    const evening = new Date(2026, 3, 24, 20, 0, 0);

    const am = calculatePrayerTimes(TORONTO, morning, 'NorthAmerica', 'Standard');
    const pm = calculatePrayerTimes(TORONTO, evening, 'NorthAmerica', 'Standard');

    // Same wall clock for both calls, so any difference comes from `date`.
    expect(am.currentPrayer).not.toBe(pm.currentPrayer);
    expect(am.nextPrayerTime!.getTime()).toBeLessThan(pm.nextPrayerTime!.getTime());

    // The self-contradiction this guards against: a "current" prayer that is
    // actually later than the "next" one.
    for (const result of [am, pm]) {
      const currentTime = result.prayers.find((p) => p.name === result.currentPrayer)?.time;
      expect(currentTime, result.currentPrayer ?? 'no current prayer').toBeDefined();
      expect(currentTime!.getTime()).toBeLessThanOrEqual(result.nextPrayerTime!.getTime());
    }
  });

  it('includes human-readable labels for all prayers', () => {
    const result = calculatePrayerTimes(TORONTO, date, 'NorthAmerica', 'Standard');

    for (const prayer of result.prayers) {
      expect(prayer.label).toBeTruthy();
      expect(typeof prayer.label).toBe('string');
      expect(prayer.label.length).toBeGreaterThan(0);
    }
  });
});

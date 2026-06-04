import { calculatePrayerTimes, calculateQiblaDirection } from '../services/prayerService';
import type { CalculationMethod as CalcMethodType } from '../types';

// Extreme latitudes
const TROMSO = { latitude: 69.6492, longitude: 18.9553 };   // Arctic Norway
const SYDNEY = { latitude: -33.8688, longitude: 151.2093 }; // Southern hemisphere
const NAIROBI = { latitude: -1.2921, longitude: 36.8219 };  // Equator
const REYKJAVIK = { latitude: 64.1466, longitude: -21.9426 }; // Near-arctic Iceland

describe('User story: I get accurate prayer times no matter where I am', () => {
  it('calculates valid times at extreme northern latitude (Tromso, 69.6N)', () => {
    const winter = new Date(2026, 0, 15); // January — dark season
    const result = calculatePrayerTimes(TROMSO, winter, 'MuslimWorldLeague', 'Standard');

    for (const prayer of result.prayers) {
      expect(prayer.time).toBeInstanceOf(Date);
      expect(prayer.time.getTime()).not.toBeNaN();
    }
  });

  it('calculates valid times at extreme northern latitude in summer (midnight sun)', () => {
    const summer = new Date(2026, 5, 21); // June — midnight sun
    const result = calculatePrayerTimes(TROMSO, summer, 'MuslimWorldLeague', 'Standard');

    // At extreme latitudes during midnight sun, some prayer times (fajr, sunrise, maghrib, isha)
    // may not exist — adhan returns Invalid Date. We only assert the shape is correct.
    for (const prayer of result.prayers) {
      expect(prayer.time).toBeInstanceOf(Date);
    }
    // At minimum, dhuhr and asr should always be calculable
    const dhuhr = result.prayers.find((p) => p.name === 'dhuhr')!;
    const asr = result.prayers.find((p) => p.name === 'asr')!;
    expect(dhuhr.time.getTime()).not.toBeNaN();
    expect(asr.time.getTime()).not.toBeNaN();
  });

  it('calculates valid times in the southern hemisphere (Sydney)', () => {
    const date = new Date(2026, 6, 15); // July — winter in southern hemisphere
    const result = calculatePrayerTimes(SYDNEY, date, 'MuslimWorldLeague', 'Standard');

    const names = result.prayers.map((p) => p.name);
    expect(names).toContain('fajr');
    expect(names).toContain('maghrib');

    const fajr = result.prayers.find((p) => p.name === 'fajr')!;
    const maghrib = result.prayers.find((p) => p.name === 'maghrib')!;
    // Times are in UTC; Sydney (UTC+10) fajr UTC ~19-20 h (prev day), maghrib UTC ~7 h
    expect(fajr.time.getUTCHours()).toBeGreaterThanOrEqual(17);
    expect(fajr.time.getUTCHours()).toBeLessThanOrEqual(22);
    expect(maghrib.time.getUTCHours()).toBeGreaterThanOrEqual(5);
    expect(maghrib.time.getUTCHours()).toBeLessThanOrEqual(10);
  });

  it('calculates valid times at the equator (Nairobi)', () => {
    const date = new Date(2026, 3, 24);
    const result = calculatePrayerTimes(NAIROBI, date, 'MuslimWorldLeague', 'Standard');

    const fajr = result.prayers.find((p) => p.name === 'fajr')!;
    const maghrib = result.prayers.find((p) => p.name === 'maghrib')!;
    // Times are in UTC; Nairobi (UTC+3) fajr ~05:18 local = 02:18 UTC, maghrib ~18:33 local = 15:33 UTC
    expect(fajr.time.getUTCHours()).toBeGreaterThanOrEqual(1);
    expect(fajr.time.getUTCHours()).toBeLessThanOrEqual(4);
    expect(maghrib.time.getUTCHours()).toBeGreaterThanOrEqual(14);
    expect(maghrib.time.getUTCHours()).toBeLessThanOrEqual(17);
  });

  it('calculates valid times near the arctic (Reykjavik)', () => {
    const date = new Date(2026, 3, 24);
    const result = calculatePrayerTimes(REYKJAVIK, date, 'MuslimWorldLeague', 'Standard');

    for (const prayer of result.prayers) {
      expect(prayer.time).toBeInstanceOf(Date);
      expect(prayer.time.getTime()).not.toBeNaN();
    }
  });

  it('produces valid results for all 12 calculation methods', () => {
    const toronto = { latitude: 43.6532, longitude: -79.3832 };
    const date = new Date(2026, 3, 24);
    const methods: CalcMethodType[] = [
      'NorthAmerica', 'MuslimWorldLeague', 'Egyptian', 'UmmAlQura',
      'Dubai', 'Karachi', 'Kuwait', 'Qatar', 'Singapore', 'Tehran',
      'Turkey', 'MoonsightingCommittee',
    ];

    for (const method of methods) {
      const result = calculatePrayerTimes(toronto, date, method, 'Standard');
      expect(result.prayers.length).toBeGreaterThanOrEqual(6);

      for (const prayer of result.prayers) {
        expect(prayer.time).toBeInstanceOf(Date);
        expect(prayer.time.getTime()).not.toBeNaN();
      }
    }
  });

  it('calculates consistent prayers across a year boundary (Dec 31 to Jan 1)', () => {
    const toronto = { latitude: 43.6532, longitude: -79.3832 };
    const dec31 = new Date(2026, 11, 31);
    const jan1 = new Date(2027, 0, 1);

    const resultDec = calculatePrayerTimes(toronto, dec31, 'NorthAmerica', 'Standard');
    const resultJan = calculatePrayerTimes(toronto, jan1, 'NorthAmerica', 'Standard');

    expect(resultDec.prayers.length).toBe(resultJan.prayers.length);

    const fajrDec = resultDec.prayers.find((p) => p.name === 'fajr')!.time;
    const fajrJan = resultJan.prayers.find((p) => p.name === 'fajr')!.time;
    const diffMinutes = Math.abs(fajrDec.getMinutes() - fajrJan.getMinutes());
    expect(diffMinutes).toBeLessThanOrEqual(5);
  });

  it('Hanafi Asr is always later than Standard Asr across different locations', () => {
    const locations = [TROMSO, SYDNEY, NAIROBI, REYKJAVIK];
    const date = new Date(2026, 3, 24);

    for (const loc of locations) {
      const standard = calculatePrayerTimes(loc, date, 'MuslimWorldLeague', 'Standard');
      const hanafi = calculatePrayerTimes(loc, date, 'MuslimWorldLeague', 'Hanafi');

      const stdAsr = standard.prayers.find((p) => p.name === 'asr')!.time;
      const hanAsr = hanafi.prayers.find((p) => p.name === 'asr')!.time;

      expect(hanAsr.getTime()).toBeGreaterThan(stdAsr.getTime());
    }
  });
});

// Unmock the tracking service so we test the real implementation
vi.unmock('../services/prayerTrackingService');

import { Preferences } from '@capacitor/preferences';
import {
  trackPrayer,
  getPrayerStatus,
  getDailyRecord,
  getRecentRecords,
  getStats,
  getTodayKey,
} from '../services/prayerTrackingService';

describe('User story: I can track whether I prayed on time', () => {
  let storage: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    storage = {};

    vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
      return { value: storage[key] || null };
    });
    vi.mocked(Preferences.set).mockImplementation(async ({ key, value }) => {
      storage[key] = value;
    });
  });

  it('tracks a prayer as on-time', async () => {
    await trackPrayer('fajr', 'ontime');
    const status = await getPrayerStatus('fajr');
    expect(status).toBe('ontime');
  });

  it('tracks a prayer as missed', async () => {
    await trackPrayer('dhuhr', 'missed');
    const status = await getPrayerStatus('dhuhr');
    expect(status).toBe('missed');
  });

  it('returns untracked for a prayer not yet tracked', async () => {
    const status = await getPrayerStatus('asr');
    expect(status).toBe('untracked');
  });

  it('overwrites a previous tracking for the same prayer and date', async () => {
    await trackPrayer('fajr', 'missed');
    expect(await getPrayerStatus('fajr')).toBe('missed');

    await trackPrayer('fajr', 'ontime');
    expect(await getPrayerStatus('fajr')).toBe('ontime');
  });

  it('removes record when untracking a prayer', async () => {
    await trackPrayer('fajr', 'ontime');
    expect(await getPrayerStatus('fajr')).toBe('ontime');

    await trackPrayer('fajr', 'untracked');
    expect(await getPrayerStatus('fajr')).toBe('untracked');
  });

  it('returns a daily record with all tracked prayers for today', async () => {
    await trackPrayer('fajr', 'ontime');
    await trackPrayer('dhuhr', 'ontime');
    await trackPrayer('asr', 'missed');

    const record = await getDailyRecord();
    expect(record.date).toBe(getTodayKey());
    expect(record.prayers.fajr).toBe('ontime');
    expect(record.prayers.dhuhr).toBe('ontime');
    expect(record.prayers.asr).toBe('missed');
    expect(record.prayers.maghrib).toBeUndefined();
  });

  it('calculates correct stats', async () => {
    await trackPrayer('fajr', 'ontime');
    await trackPrayer('dhuhr', 'ontime');
    await trackPrayer('asr', 'ontime');
    await trackPrayer('maghrib', 'missed');
    await trackPrayer('isha', 'ontime');

    const stats = await getStats(7);
    expect(stats.totalTracked).toBe(5);
    expect(stats.onTime).toBe(4);
    expect(stats.missed).toBe(1);
    expect(stats.percentage).toBe(80);
  });

  it('returns 0% when nothing is tracked', async () => {
    const stats = await getStats(7);
    expect(stats.totalTracked).toBe(0);
    expect(stats.percentage).toBe(0);
  });

  it('returns recent records for N days', async () => {
    await trackPrayer('fajr', 'ontime');

    const records = await getRecentRecords(3);
    expect(records.length).toBe(3);
    expect(records[0].prayers.fajr).toBe('ontime');
    expect(Object.keys(records[1].prayers).length).toBe(0);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTimezone } from '../services/prayerService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getTimezone', () => {
  it('returns the IANA timezone from Intl.DateTimeFormat', () => {
    const tz = getTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  it('reflects the current Intl mock', () => {
    vi.stubGlobal('Intl', {
      ...Intl,
      DateTimeFormat: vi.fn(() => ({
        resolvedOptions: () => ({ timeZone: 'Asia/Riyadh' }),
      })),
    });
    expect(getTimezone()).toBe('Asia/Riyadh');
  });
});
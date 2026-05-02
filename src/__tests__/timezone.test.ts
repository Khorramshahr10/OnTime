import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getTimezone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the IANA timezone from Intl.DateTimeFormat', () => {
    // We can't fully mock Intl.DateTimeFormat across all environments,
    // but we can verify the function returns a string that looks like a timezone.
    const { getTimezone } = require('../services/prayerService');
    const tz = getTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
    // Common IANA timezone patterns contain "/"
    expect(tz).toContain('/');
  });

  it('returns different values when Intl.DateTimeFormat mock is changed', () => {
    // Store original
    const originalDateTimeFormat = Intl.DateTimeFormat;

    // Mock to return a specific timezone
    const mockDateTimeFormat = vi.fn().mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'Asia/Riyadh' }),
      format: () => '',
      formatToParts: () => [],
    })) as unknown as typeof Intl.DateTimeFormat;

    // Replace global
    Object.defineProperty(globalThis, 'Intl', {
      value: {
        ...Intl,
        DateTimeFormat: mockDateTimeFormat,
      },
      writable: true,
      configurable: true,
    });

    // Need to re-import to pick up the mock
    const { getTimezone } = require('../services/prayerService');
    expect(getTimezone()).toBe('Asia/Riyadh');

    // Change mock
    mockDateTimeFormat.mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'Europe/London' }),
      format: () => '',
      formatToParts: () => [],
    }));

    // Still returns cached value from first call in the same module?
    // getTimezone calls Intl.DateTimeFormat() fresh each time, so it should reflect
    expect(getTimezone()).toBe('Europe/London');

    // Restore original
    Object.defineProperty(globalThis, 'Intl', {
      value: { ...Intl, DateTimeFormat: originalDateTimeFormat },
      writable: true,
      configurable: true,
    });
  });
});

describe('usePrayerTimes timezone dependency', () => {
  it('recomputes when timezone changes (verified via useMemo dependency inclusion)', () => {
    // This is a compile-time / logic verification test: we check that the useMemo
    // dependency array in usePrayerTimes includes `timezone` from useTimezone.
    // We verify this by reading the source of usePrayerTimes and confirming
    // 'timezone' appears in the dependency array after the hook call.
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.resolve(__dirname, '../hooks/usePrayerTimes.ts'), 'utf-8');

    // Verify useTimezone is imported and called
    expect(source).toContain('useTimezone');
    expect(source).toContain('const timezone = useTimezone();');

    // Verify timezone is in the useMemo dependency array
    // The useMemo block should include `timezone` in its closing ] array
    const useMemoMatch = source.match(/useMemo\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[([\s\S]*?)\]\s*\)/);
    expect(useMemoMatch).not.toBeNull();
    if (useMemoMatch) {
      expect(useMemoMatch[1]).toContain('timezone');
    }
  });
});
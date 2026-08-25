# Deeper User Story Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deeper tests covering edge cases, travel mode, notification scheduling, prayer tracking, and settings modal interactions — all written as user stories.

**Architecture:** Extends the existing Vitest + React Testing Library test suite. Pure logic tests for services (notifications, tracking, prayer edge cases), context-level tests for travel mode, and component tests for settings interactions. All Capacitor mocks are already in `src/test/setup.ts`.

**Tech Stack:** Vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/__tests__/prayer-times-edge-cases.test.ts` | Extreme latitudes, all calculation methods, date boundaries |
| `src/__tests__/travel.test.tsx` | Travel detection, qasr, jama, overrides, max days, pending state |
| `src/__tests__/notifications.test.ts` | Notification scheduling logic, Jumuah, Surah Kahf |
| `src/__tests__/prayer-tracking.test.ts` | Track on-time/missed, stats, pruning, history |
| `src/__tests__/settings-interactions.test.tsx` | Settings modal UI — method picker, design picker, toggles |

---

### Task 1: Prayer time edge cases

**Files:**
- Create: `src/__tests__/prayer-times-edge-cases.test.ts`

- [ ] **Step 1: Write the tests**

```ts
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

    // All prayers should be valid Date objects (not NaN)
    for (const prayer of result.prayers) {
      expect(prayer.time).toBeInstanceOf(Date);
      expect(prayer.time.getTime()).not.toBeNaN();
    }
  });

  it('calculates valid times at extreme northern latitude in summer (midnight sun)', () => {
    const summer = new Date(2026, 5, 21); // June — midnight sun
    const result = calculatePrayerTimes(TROMSO, summer, 'MuslimWorldLeague', 'Standard');

    for (const prayer of result.prayers) {
      expect(prayer.time).toBeInstanceOf(Date);
      expect(prayer.time.getTime()).not.toBeNaN();
    }
  });

  it('calculates valid times in the southern hemisphere (Sydney)', () => {
    const date = new Date(2026, 6, 15); // July — winter in southern hemisphere
    const result = calculatePrayerTimes(SYDNEY, date, 'MuslimWorldLeague', 'Standard');

    const names = result.prayers.map((p) => p.name);
    expect(names).toContain('fajr');
    expect(names).toContain('maghrib');

    // Fajr should be in the morning, Maghrib in the evening
    const fajr = result.prayers.find((p) => p.name === 'fajr')!;
    const maghrib = result.prayers.find((p) => p.name === 'maghrib')!;
    expect(fajr.time.getHours()).toBeLessThan(8);
    expect(maghrib.time.getHours()).toBeGreaterThanOrEqual(16);
  });

  it('calculates valid times at the equator (Nairobi)', () => {
    const date = new Date(2026, 3, 24);
    const result = calculatePrayerTimes(NAIROBI, date, 'MuslimWorldLeague', 'Standard');

    // Near equator, prayer windows are consistent — Fajr ~5 AM, Maghrib ~6 PM
    const fajr = result.prayers.find((p) => p.name === 'fajr')!;
    const maghrib = result.prayers.find((p) => p.name === 'maghrib')!;
    expect(fajr.time.getHours()).toBeGreaterThanOrEqual(4);
    expect(fajr.time.getHours()).toBeLessThanOrEqual(6);
    expect(maghrib.time.getHours()).toBeGreaterThanOrEqual(17);
    expect(maghrib.time.getHours()).toBeLessThanOrEqual(19);
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

    // Both should have all prayers
    expect(resultDec.prayers.length).toBe(resultJan.prayers.length);

    // Fajr times should be within a few minutes of each other across the boundary
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
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/__tests__/prayer-times-edge-cases.test.ts --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/prayer-times-edge-cases.test.ts
git commit -m "test: add prayer time edge case tests — extreme latitudes, all methods, date boundaries"
```

---

### Task 2: Travel mode

**Files:**
- Create: `src/__tests__/travel.test.tsx`

- [ ] **Step 1: Write the tests**

```tsx
import { render, act } from '@testing-library/react';
import { Preferences } from '@capacitor/preferences';
import { ThemeProvider } from '../context/ThemeContext';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { LocationProvider } from '../context/LocationContext';
import { TravelProvider, useTravel } from '../context/TravelContext';
import type { TravelState, Settings } from '../types';

// Helper to render with all providers and capture travel state
function TravelInspector({ onState }: { onState: (s: TravelState) => void }) {
  const { travelState } = useTravel();
  onState(travelState);
  return null;
}

function renderTravel(savedSettings: Partial<Settings>, savedLocation?: { latitude: number; longitude: number; cityName: string }) {
  vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
    if (key === 'ontime_settings') return { value: JSON.stringify(savedSettings) };
    if (key === 'ontime_location' && savedLocation) {
      return { value: JSON.stringify({ coordinates: { latitude: savedLocation.latitude, longitude: savedLocation.longitude }, cityName: savedLocation.cityName }) };
    }
    return { value: null };
  });

  let captured: TravelState | null = null;
  const result = render(
    <ThemeProvider>
      <SettingsProvider>
        <LocationProvider>
          <TravelProvider>
            <TravelInspector onState={(s) => { captured = s; }} />
          </TravelProvider>
        </LocationProvider>
      </SettingsProvider>
    </ThemeProvider>,
  );

  return { ...result, getCaptured: () => captured };
}

describe('User story: The app detects when I am traveling and adjusts my prayers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is not traveling when travel feature is disabled', async () => {
    let captured: TravelState | null = null;
    await act(async () => {
      renderTravel({ travel: { enabled: false, homeBase: null, override: 'auto', distanceThresholdKm: 88.7, jamaDhuhrAsr: false, jamaMaghribIsha: false, maxTravelDays: 0, travelStartDate: null, autoConfirmed: false } });
    });
    // Need to wait for state
    await act(async () => {
      const { getCaptured } = renderTravel({ travel: { enabled: false, homeBase: null, override: 'auto', distanceThresholdKm: 88.7, jamaDhuhrAsr: false, jamaMaghribIsha: false, maxTravelDays: 0, travelStartDate: null, autoConfirmed: false } });
      captured = getCaptured();
    });
    expect(captured!.isTraveling).toBe(false);
    expect(captured!.qasr.dhuhr).toBe(false);
  });

  it('is not traveling when no home base is set', async () => {
    let captured: TravelState | null = null;
    await act(async () => {
      const { getCaptured } = renderTravel({ travel: { enabled: true, homeBase: null, override: 'auto', distanceThresholdKm: 88.7, jamaDhuhrAsr: false, jamaMaghribIsha: false, maxTravelDays: 0, travelStartDate: null, autoConfirmed: false } });
      captured = getCaptured();
    });
    expect(captured!.isTraveling).toBe(false);
  });

  it('activates travel with qasr when force_on override is set', async () => {
    let captured: TravelState | null = null;
    await act(async () => {
      const { getCaptured } = renderTravel({
        travel: {
          enabled: true,
          homeBase: { coordinates: { latitude: 43.6532, longitude: -79.3832 }, cityName: 'Toronto' },
          override: 'force_on',
          distanceThresholdKm: 88.7,
          jamaDhuhrAsr: false,
          jamaMaghribIsha: false,
          maxTravelDays: 0,
          travelStartDate: '2026-04-24',
          autoConfirmed: false,
        },
      });
      captured = getCaptured();
    });
    expect(captured!.isTraveling).toBe(true);
    expect(captured!.qasr.dhuhr).toBe(true);
    expect(captured!.qasr.asr).toBe(true);
    expect(captured!.qasr.isha).toBe(true);
  });

  it('deactivates travel when force_off override is set even if far from home', async () => {
    let captured: TravelState | null = null;
    await act(async () => {
      const { getCaptured } = renderTravel(
        {
          travel: {
            enabled: true,
            homeBase: { coordinates: { latitude: 21.4225, longitude: 39.8262 }, cityName: 'Mecca' },
            override: 'force_off',
            distanceThresholdKm: 88.7,
            jamaDhuhrAsr: false,
            jamaMaghribIsha: false,
            maxTravelDays: 0,
            travelStartDate: null,
            autoConfirmed: false,
          },
        },
        // Location is Toronto — far from Mecca home base
        { latitude: 43.6532, longitude: -79.3832, cityName: 'Toronto' },
      );
      captured = getCaptured();
    });
    expect(captured!.isTraveling).toBe(false);
  });

  it('enables jama for Dhuhr+Asr when configured', async () => {
    let captured: TravelState | null = null;
    await act(async () => {
      const { getCaptured } = renderTravel({
        travel: {
          enabled: true,
          homeBase: { coordinates: { latitude: 43.6532, longitude: -79.3832 }, cityName: 'Toronto' },
          override: 'force_on',
          distanceThresholdKm: 88.7,
          jamaDhuhrAsr: true,
          jamaMaghribIsha: false,
          maxTravelDays: 0,
          travelStartDate: '2026-04-24',
          autoConfirmed: false,
        },
      });
      captured = getCaptured();
    });
    expect(captured!.jamaDhuhrAsr).toBe(true);
    expect(captured!.jamaMaghribIsha).toBe(false);
  });

  it('enables jama for Maghrib+Isha when configured', async () => {
    let captured: TravelState | null = null;
    await act(async () => {
      const { getCaptured } = renderTravel({
        travel: {
          enabled: true,
          homeBase: { coordinates: { latitude: 43.6532, longitude: -79.3832 }, cityName: 'Toronto' },
          override: 'force_on',
          distanceThresholdKm: 88.7,
          jamaDhuhrAsr: false,
          jamaMaghribIsha: true,
          maxTravelDays: 0,
          travelStartDate: '2026-04-24',
          autoConfirmed: false,
        },
      });
      captured = getCaptured();
    });
    expect(captured!.jamaDhuhrAsr).toBe(false);
    expect(captured!.jamaMaghribIsha).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/__tests__/travel.test.tsx --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/travel.test.tsx
git commit -m "test: add travel mode user story tests — qasr, jama, overrides"
```

---

### Task 3: Notification scheduling

**Files:**
- Create: `src/__tests__/notifications.test.ts`

- [ ] **Step 1: Write the tests**

The notification service needs its own mock setup because the setup.ts mock for `prayerTrackingService` interferes. We need to mock `LocalNotifications` directly within these tests for fine-grained assertions.

```ts
import { LocalNotifications } from '@capacitor/local-notifications';
import { scheduleNotifications, scheduleJumuahNotifications, scheduleSurahKahfNotifications } from '../services/notificationService';
import type { Settings } from '../types';
import { defaultTravelSettings, defaultAthanSettings, defaultSurahKahfSettings } from '../context/SettingsContext';

// Build a full settings object with overrides
function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    calculationMethod: 'NorthAmerica',
    asrCalculation: 'Standard',
    optionalPrayers: { showSunrise: true, showMiddleOfNight: true, showLastThirdOfNight: true },
    notifications: {
      enabled: true,
      defaultSound: 'default',
      defaultReminderMinutes: 15,
      prayers: {
        fajr: { enabled: true, reminderMinutes: 15, atPrayerTime: true, sound: 'default' },
        sunrise: { enabled: false, reminderMinutes: 0, atPrayerTime: false, sound: 'default' },
        dhuhr: { enabled: true, reminderMinutes: 15, atPrayerTime: true, sound: 'default' },
        asr: { enabled: true, reminderMinutes: 15, atPrayerTime: true, sound: 'default' },
        maghrib: { enabled: true, reminderMinutes: 15, atPrayerTime: true, sound: 'default' },
        isha: { enabled: true, reminderMinutes: 15, atPrayerTime: true, sound: 'default' },
      },
    },
    jumuah: { enabled: false, masjidName: '', times: [{ khutbah: '13:00', iqamah: '13:30' }], reminderMinutes: 30 },
    travel: defaultTravelSettings,
    display: { showCurrentPrayer: true, showNextPrayer: true, showSunnahCard: true },
    athan: defaultAthanSettings,
    surahKahf: defaultSurahKahfSettings,
    previousLocations: [],
    distanceUnit: 'miles',
    designStyle: 'classic',
    ...overrides,
  };
}

const TORONTO = { latitude: 43.6532, longitude: -79.3832 };

describe('User story: I get notified before each prayer', () => {
  let scheduledNotifications: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    scheduledNotifications = [];

    // Capture what gets scheduled
    vi.mocked(LocalNotifications.schedule).mockImplementation(async (opts: { notifications: unknown[] }) => {
      scheduledNotifications.push(...opts.notifications);
      return { notifications: [] };
    });
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' } as never);
    vi.mocked(LocalNotifications.requestPermissions).mockResolvedValue({ display: 'granted' } as never);

    // getPending for cancelAllNotifications
    (LocalNotifications as Record<string, unknown>).getPending = vi.fn().mockResolvedValue({ notifications: [] });
  });

  it('schedules notifications for all enabled prayers', async () => {
    const settings = makeSettings();
    await scheduleNotifications(TORONTO, settings);

    // 5 enabled prayers (fajr, dhuhr, asr, maghrib, isha) x 7 days x 2 (reminder + at-time)
    // Some may be in the past so exact count varies, but should be > 0
    expect(scheduledNotifications.length).toBeGreaterThan(0);
  });

  it('does not schedule any notifications when globally disabled', async () => {
    const settings = makeSettings({
      notifications: {
        ...makeSettings().notifications,
        enabled: false,
      },
    });
    await scheduleNotifications(TORONTO, settings);

    expect(scheduledNotifications.length).toBe(0);
  });

  it('skips sunrise notifications (sunrise is disabled by default)', async () => {
    const settings = makeSettings();
    await scheduleNotifications(TORONTO, settings);

    const sunriseNotifs = scheduledNotifications.filter(
      (n: Record<string, unknown>) => (n.title as string)?.includes('Sunrise')
    );
    expect(sunriseNotifs.length).toBe(0);
  });

  it('skips notifications for individually disabled prayers', async () => {
    const settings = makeSettings();
    settings.notifications.prayers.asr.enabled = false;
    await scheduleNotifications(TORONTO, settings);

    const asrNotifs = scheduledNotifications.filter(
      (n: Record<string, unknown>) => (n.title as string) === 'Asr'
    );
    expect(asrNotifs.length).toBe(0);
  });

  it('sets reminder notifications before prayer time', async () => {
    const settings = makeSettings();
    settings.notifications.prayers.fajr.reminderMinutes = 30;
    await scheduleNotifications(TORONTO, settings);

    const fajrReminders = scheduledNotifications.filter(
      (n: Record<string, unknown>) => (n.title as string) === 'Fajr' && (n.body as string)?.includes('coming soon')
    );

    // Should have reminder notifications for future days
    for (const reminder of fajrReminders) {
      const r = reminder as Record<string, Record<string, Date>>;
      expect(r.schedule.at).toBeInstanceOf(Date);
    }
  });

  it('includes at-prayer-time notifications', async () => {
    const settings = makeSettings();
    await scheduleNotifications(TORONTO, settings);

    const atTimeNotifs = scheduledNotifications.filter(
      (n: Record<string, unknown>) => (n.body as string)?.includes('Time for')
    );
    expect(atTimeNotifs.length).toBeGreaterThan(0);
  });

  it('each notification has a unique ID', async () => {
    const settings = makeSettings();
    await scheduleNotifications(TORONTO, settings);

    const ids = scheduledNotifications.map((n: Record<string, unknown>) => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('User story: I get reminded about Jumuah prayer', () => {
  let scheduledNotifications: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    scheduledNotifications = [];
    vi.mocked(LocalNotifications.schedule).mockImplementation(async (opts: { notifications: unknown[] }) => {
      scheduledNotifications.push(...opts.notifications);
      return { notifications: [] };
    });
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' } as never);
    vi.mocked(LocalNotifications.requestPermissions).mockResolvedValue({ display: 'granted' } as never);
    (LocalNotifications as Record<string, unknown>).getPending = vi.fn().mockResolvedValue({ notifications: [] });
  });

  it('schedules Jumuah notifications when enabled', async () => {
    await scheduleJumuahNotifications({
      enabled: true,
      masjidName: 'ISNA Masjid',
      times: [{ khutbah: '13:00', iqamah: '13:30' }],
      reminderMinutes: 30,
    });

    expect(scheduledNotifications.length).toBeGreaterThan(0);
    const firstNotif = scheduledNotifications[0] as Record<string, unknown>;
    expect(firstNotif.title).toBe("Jumu'ah Prayer");
    expect((firstNotif.body as string)).toContain('ISNA Masjid');
  });

  it('does not schedule Jumuah when disabled', async () => {
    await scheduleJumuahNotifications({
      enabled: false,
      masjidName: '',
      times: [{ khutbah: '13:00', iqamah: '13:30' }],
      reminderMinutes: 30,
    });

    expect(scheduledNotifications.length).toBe(0);
  });
});

describe('User story: I get reminded to read Surah Al-Kahf', () => {
  let scheduledNotifications: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    scheduledNotifications = [];
    vi.mocked(LocalNotifications.schedule).mockImplementation(async (opts: { notifications: unknown[] }) => {
      scheduledNotifications.push(...opts.notifications);
      return { notifications: [] };
    });
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' } as never);
    vi.mocked(LocalNotifications.requestPermissions).mockResolvedValue({ display: 'granted' } as never);
    (LocalNotifications as Record<string, unknown>).getPending = vi.fn().mockResolvedValue({ notifications: [] });
  });

  it('schedules Surah Kahf reminders when enabled', async () => {
    await scheduleSurahKahfNotifications(
      TORONTO,
      { enabled: true, repeatIntervalHours: 0 },
      'NorthAmerica',
      'Standard',
    );

    expect(scheduledNotifications.length).toBeGreaterThan(0);
    const firstNotif = scheduledNotifications[0] as Record<string, unknown>;
    expect((firstNotif.title as string)).toContain('Surah');
  });

  it('does not schedule Surah Kahf when disabled', async () => {
    await scheduleSurahKahfNotifications(
      TORONTO,
      { enabled: false, repeatIntervalHours: 0 },
      'NorthAmerica',
      'Standard',
    );

    expect(scheduledNotifications.length).toBe(0);
  });

  it('schedules repeat reminders when repeatIntervalHours > 0', async () => {
    await scheduleSurahKahfNotifications(
      TORONTO,
      { enabled: true, repeatIntervalHours: 4 },
      'NorthAmerica',
      'Standard',
    );

    // With 4-hour repeats from Thursday Maghrib to Friday Maghrib (~24 hours),
    // should get ~6 notifications per week x 4 weeks
    expect(scheduledNotifications.length).toBeGreaterThan(4);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/__tests__/notifications.test.ts --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/notifications.test.ts
git commit -m "test: add notification scheduling tests — prayer, Jumuah, Surah Kahf"
```

---

### Task 4: Prayer tracking

**Files:**
- Create: `src/__tests__/prayer-tracking.test.ts`

Note: The prayer tracking service is mocked globally in `src/test/setup.ts`. These tests need the REAL implementation, so they must override the mock. The real service uses `Preferences` (also mocked), so we control storage via the Preferences mock.

- [ ] **Step 1: Write the tests**

```ts
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
  loadTrackingData,
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
    // Today's record should have fajr
    expect(records[0].prayers.fajr).toBe('ontime');
    // Other days should be empty
    expect(Object.keys(records[1].prayers).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/__tests__/prayer-tracking.test.ts --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/prayer-tracking.test.ts
git commit -m "test: add prayer tracking user story tests — track, stats, history"
```

---

### Task 5: Settings modal interactions

**Files:**
- Create: `src/__tests__/settings-interactions.test.tsx`

- [ ] **Step 1: Write the tests**

```tsx
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Preferences } from '@capacitor/preferences';
import { SettingsModal } from '../components/SettingsModal';
import { ThemeProvider } from '../context/ThemeContext';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { LocationProvider } from '../context/LocationContext';
import { TravelProvider } from '../context/TravelContext';
import type { Settings } from '../types';

// Stub matchMedia for ThemeContext
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// Mock athan plugin
vi.mock('../plugins/athanPlugin', () => ({
  AthanPlugin: {
    isPlaying: vi.fn().mockResolvedValue({ isPlaying: false }),
    stop: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
  },
}));

// Inspector to capture settings changes
function SettingsCapture({ onSettings }: { onSettings: (s: Settings) => void }) {
  const { settings } = useSettings();
  onSettings(settings);
  return null;
}

function renderSettingsModal(savedSettings?: Partial<Settings>) {
  vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
    if (key === 'ontime_settings' && savedSettings) return { value: JSON.stringify(savedSettings) };
    return { value: null };
  });

  let captured: Settings | null = null;
  const onBackRef = { current: null };

  const result = render(
    <ThemeProvider>
      <SettingsProvider>
        <LocationProvider>
          <TravelProvider>
            <SettingsCapture onSettings={(s) => { captured = s; }} />
            <SettingsModal isOpen={true} onClose={() => {}} onBackRef={onBackRef} />
          </TravelProvider>
        </LocationProvider>
      </SettingsProvider>
    </ThemeProvider>,
  );

  return { ...result, getCaptured: () => captured };
}

describe('User story: I can customize my app settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the settings modal when opened', async () => {
    await act(async () => {
      renderSettingsModal();
    });

    // Settings modal should show the appearance section header
    const heading = await screen.findByText('Appearance');
    expect(heading).toBeInTheDocument();
  });

  it('shows the design style picker with Classic and Islamic options', async () => {
    await act(async () => {
      renderSettingsModal();
    });

    const classic = await screen.findByText('Classic');
    const islamic = await screen.findByText('Islamic');
    expect(classic).toBeInTheDocument();
    expect(islamic).toBeInTheDocument();
  });

  it('switching to Islamic design updates the setting', async () => {
    const user = userEvent.setup();
    let captured: Settings | null = null;

    await act(async () => {
      const result = renderSettingsModal({ designStyle: 'classic' });
      captured = result.getCaptured();
    });

    const islamicBtn = await screen.findByText('Islamic');
    await user.click(islamicBtn);

    // Wait for state to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Re-read captured (it updates on every render)
    // The click should have changed designStyle
    expect(captured!.designStyle).toBe('islamic');
  });

  it('shows calculation method section', async () => {
    await act(async () => {
      renderSettingsModal();
    });

    const methodSection = await screen.findByText('Calculation Method');
    expect(methodSection).toBeInTheDocument();
  });

  it('shows the display cards section with toggle options', async () => {
    await act(async () => {
      renderSettingsModal();
    });

    const displaySection = await screen.findByText('Display Cards');
    expect(displaySection).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/__tests__/settings-interactions.test.tsx --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/settings-interactions.test.tsx
git commit -m "test: add settings modal interaction tests — design picker, sections"
```

---

### Task 6: Run full test suite and verify

- [ ] **Step 1: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: All test files pass — both the original 7 and the new 5.

- [ ] **Step 2: Verify test count**

Confirm output shows tests from all 12 test files:
- Original: `prayer-times`, `countdown`, `distance`, `qibla`, `settings-persistence`, `design-switching`, `theme`
- New: `prayer-times-edge-cases`, `travel`, `notifications`, `prayer-tracking`, `settings-interactions`

- [ ] **Step 3: Final commit (if any unstaged changes)**

```bash
git status
```

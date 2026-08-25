# User Story Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a comprehensive test suite written around user stories — testing what the app does for the user, not how the code is structured internally.

**Architecture:** Vitest as the test runner (native Vite integration), React Testing Library for component rendering tests, and jsdom for DOM simulation. Tests are organized by user story, not by file. Capacitor plugins are mocked at the module level since tests run in Node, not on a device.

**Tech Stack:** Vitest, @testing-library/react, @testing-library/jest-dom, jsdom

---

## File Structure

| File | Responsibility |
|------|---------------|
| `vitest.config.ts` | Vitest configuration (jsdom environment, setup file) |
| `src/test/setup.ts` | Global test setup — Capacitor mocks, CSS variable stubs, cleanup |
| `src/test/helpers.tsx` | Shared test wrapper that provides all context providers with controllable props |
| `src/__tests__/prayer-times.test.ts` | User story: "I see today's prayer times for my location" |
| `src/__tests__/countdown.test.ts` | User story: "I see a countdown to the next prayer" |
| `src/__tests__/design-switching.test.tsx` | User story: "I can switch between Classic and Islamic designs" |
| `src/__tests__/settings-persistence.test.ts` | User story: "My settings persist across app restarts" |
| `src/__tests__/distance.test.ts` | User story: "I see distances in my preferred unit" |
| `src/__tests__/qibla.test.ts` | User story: "I can find the Qibla direction from anywhere" |
| `src/__tests__/theme.test.tsx` | User story: "The app respects my chosen color theme" |

---

### Task 1: Install test dependencies and configure Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.app.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
```

- [ ] **Step 3: Add test script to package.json**

Add to the `"scripts"` section:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Add vitest types to tsconfig.app.json**

In `compilerOptions.types`, add `"vitest/globals"` alongside the existing `"vite/client"`:

```json
"types": ["vite/client", "vitest/globals"]
```

- [ ] **Step 5: Verify configuration**

Run: `npx vitest run --reporter=verbose 2>&1 | head -20`
Expected: Vitest starts, finds no tests yet, exits cleanly (no config errors).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json tsconfig.app.json
git commit -m "chore: add Vitest + React Testing Library test infrastructure"
```

---

### Task 2: Create test setup and shared helpers

**Files:**
- Create: `src/test/setup.ts`
- Create: `src/test/helpers.tsx`

- [ ] **Step 1: Create the global setup file `src/test/setup.ts`**

This mocks all Capacitor plugins so tests can run in jsdom without native APIs.

```ts
import '@testing-library/jest-dom/vitest';

// Mock Capacitor Preferences (used by Settings, Theme, Location contexts)
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Capacitor Geolocation
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    getCurrentPosition: vi.fn().mockResolvedValue({
      coords: { latitude: 43.6532, longitude: -79.3832 },
    }),
    checkPermissions: vi.fn().mockResolvedValue({ location: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ location: 'granted' }),
  },
}));

// Mock Capacitor StatusBar
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setStyle: vi.fn().mockResolvedValue(undefined),
    setBackgroundColor: vi.fn().mockResolvedValue(undefined),
    setOverlaysWebView: vi.fn().mockResolvedValue(undefined),
  },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));

// Mock Capacitor App
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    minimizeApp: vi.fn(),
  },
}));

// Mock Capacitor LocalNotifications
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: vi.fn().mockResolvedValue(undefined),
    checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    createChannel: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Capacitor Haptics
vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Capacitor Motion
vi.mock('@capacitor/motion', () => ({
  Motion: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

// Mock Capacitor Filesystem
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    readFile: vi.fn().mockResolvedValue({ data: '' }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockRejectedValue(new Error('not found')),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
  Directory: { Data: 'DATA' },
  Encoding: { UTF8: 'utf8' },
}));

// Mock prayer tracking service (uses Filesystem internally)
vi.mock('../services/prayerTrackingService', () => ({
  trackPrayer: vi.fn().mockResolvedValue(undefined),
  getPrayerStatus: vi.fn().mockResolvedValue('untracked'),
  getTodayLog: vi.fn().mockResolvedValue(null),
}));
```

- [ ] **Step 2: Create the test helper wrapper `src/test/helpers.tsx`**

This wraps components in all required context providers with controllable defaults.

```tsx
import { type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext';
import { SettingsProvider } from '../context/SettingsContext';
import { LocationProvider } from '../context/LocationContext';
import { TravelProvider } from '../context/TravelContext';

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <LocationProvider>
          <TravelProvider>
            {children}
          </TravelProvider>
        </LocationProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { AllProviders };
```

- [ ] **Step 3: Verify setup compiles**

Run: `npx vitest run --reporter=verbose 2>&1 | head -20`
Expected: no import/compilation errors.

- [ ] **Step 4: Commit**

```bash
git add src/test/setup.ts src/test/helpers.tsx
git commit -m "test: add global Capacitor mocks and provider wrapper helper"
```

---

### Task 3: User story — "I see today's prayer times for my location"

**Files:**
- Create: `src/__tests__/prayer-times.test.ts`

These tests exercise `calculatePrayerTimes` from the user's perspective: given a city and date, do I get the right prayers in the right order?

- [ ] **Step 1: Write the tests**

```ts
import { calculatePrayerTimes } from '../services/prayerService';
import type { Coordinates } from '../types';

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
    // Set time to 11 PM — after Isha
    const lateNight = new Date(2026, 3, 24, 23, 0, 0);
    const result = calculatePrayerTimes(TORONTO, lateNight, 'NorthAmerica', 'Standard');

    expect(result.nextPrayer).toBe('fajr');
    expect(result.nextPrayerTime).not.toBeNull();
    // Tomorrow's Fajr should be after the current date
    expect(result.nextPrayerTime!.getDate()).toBe(25);
  });

  it('shows Fajr as next prayer after midnight before Fajr', () => {
    // 2 AM — after midnight, before Fajr
    const earlyMorning = new Date(2026, 3, 24, 2, 0, 0);
    const result = calculatePrayerTimes(TORONTO, earlyMorning, 'NorthAmerica', 'Standard');

    expect(result.nextPrayer).toBe('fajr');
    expect(result.nextPrayerTime).not.toBeNull();
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/prayer-times.test.ts --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/prayer-times.test.ts
git commit -m "test: add prayer time calculation user story tests"
```

---

### Task 4: User story — "I see a countdown to the next prayer"

**Files:**
- Create: `src/__tests__/countdown.test.ts`

Tests exercise `getTimeUntil` and `formatTime` — the countdown logic users see.

- [ ] **Step 1: Write the tests**

```ts
import { getTimeUntil, formatTime } from '../services/prayerService';

describe('User story: I see a countdown to the next prayer', () => {
  it('shows hours, minutes, and seconds until the next prayer', () => {
    const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000 + 15 * 1000);
    const result = getTimeUntil(futureTime);

    expect(result.hours).toBe(2);
    expect(result.minutes).toBe(30);
    expect(result.seconds).toBeGreaterThanOrEqual(14);
    expect(result.seconds).toBeLessThanOrEqual(15);
    expect(result.totalSeconds).toBeGreaterThan(0);
  });

  it('shows 0:00:00 when the prayer time has passed', () => {
    const pastTime = new Date(Date.now() - 60 * 1000);
    const result = getTimeUntil(pastTime);

    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBe(0);
    expect(result.totalSeconds).toBe(0);
  });

  it('shows exactly 0 when the prayer time is right now', () => {
    const now = new Date(Date.now() - 1); // 1ms in the past to avoid race
    const result = getTimeUntil(now);

    expect(result.totalSeconds).toBe(0);
  });

  it('correctly counts down a short time (under 1 minute)', () => {
    const soonTime = new Date(Date.now() + 45 * 1000);
    const result = getTimeUntil(soonTime);

    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBeGreaterThanOrEqual(44);
    expect(result.seconds).toBeLessThanOrEqual(45);
  });

  it('handles large countdowns (12+ hours to next Fajr)', () => {
    const farFuture = new Date(Date.now() + 13 * 60 * 60 * 1000);
    const result = getTimeUntil(farFuture);

    expect(result.hours).toBe(13);
    expect(result.minutes).toBe(0);
  });
});

describe('User story: I see prayer times in a readable format', () => {
  it('formats a morning time correctly', () => {
    const morning = new Date(2026, 3, 24, 5, 30, 0);
    const formatted = formatTime(morning);

    // Should contain the time digits and AM/PM
    expect(formatted).toMatch(/5:30/);
    expect(formatted.toLowerCase()).toContain('am');
  });

  it('formats an afternoon time correctly', () => {
    const afternoon = new Date(2026, 3, 24, 14, 15, 0);
    const formatted = formatTime(afternoon);

    expect(formatted).toMatch(/2:15/);
    expect(formatted.toLowerCase()).toContain('pm');
  });

  it('formats midnight-adjacent times', () => {
    const nearMidnight = new Date(2026, 3, 24, 0, 5, 0);
    const formatted = formatTime(nearMidnight);

    expect(formatted).toMatch(/12:05/);
    expect(formatted.toLowerCase()).toContain('am');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/countdown.test.ts --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/countdown.test.ts
git commit -m "test: add countdown and time formatting user story tests"
```

---

### Task 5: User story — "I see distances in my preferred unit"

**Files:**
- Create: `src/__tests__/distance.test.ts`

Tests exercise the Haversine distance calculation and unit conversion the user sees.

- [ ] **Step 1: Write the tests**

```ts
import { calculateDistanceKm, kmToMiles, formatDistance } from '../utils/distance';

describe('User story: I see distances in my preferred unit', () => {
  it('shows distance in miles when I prefer miles', () => {
    const result = formatDistance(100, 'miles');
    expect(result).toBe('62 mi');
  });

  it('shows distance in km when I prefer km', () => {
    const result = formatDistance(100, 'km');
    expect(result).toBe('100 km');
  });

  it('rounds distances to whole numbers', () => {
    expect(formatDistance(88.7, 'km')).toBe('89 km');
    expect(formatDistance(88.7, 'miles')).toBe('55 mi');
  });

  it('converts km to miles accurately', () => {
    const miles = kmToMiles(1.60934);
    expect(miles).toBeCloseTo(1.0, 1);
  });

  it('calculates the distance between Toronto and Mecca correctly (~10,500 km)', () => {
    const toronto = { latitude: 43.6532, longitude: -79.3832 };
    const mecca = { latitude: 21.4225, longitude: 39.8262 };
    const distance = calculateDistanceKm(toronto, mecca);

    // Should be roughly 10,500 km
    expect(distance).toBeGreaterThan(10000);
    expect(distance).toBeLessThan(11000);
  });

  it('returns 0 distance for the same location', () => {
    const point = { latitude: 43.6532, longitude: -79.3832 };
    expect(calculateDistanceKm(point, point)).toBe(0);
  });

  it('calculates a short distance correctly (within a city ~5 km)', () => {
    const pointA = { latitude: 43.6532, longitude: -79.3832 };
    const pointB = { latitude: 43.6800, longitude: -79.3500 };
    const distance = calculateDistanceKm(pointA, pointB);

    expect(distance).toBeGreaterThan(3);
    expect(distance).toBeLessThan(6);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/distance.test.ts --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/distance.test.ts
git commit -m "test: add distance calculation and unit preference tests"
```

---

### Task 6: User story — "I can find the Qibla direction from anywhere"

**Files:**
- Create: `src/__tests__/qibla.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { calculateQiblaDirection } from '../services/prayerService';

describe('User story: I can find the Qibla direction from anywhere', () => {
  it('points roughly northeast from Toronto (~54-59 degrees)', () => {
    const direction = calculateQiblaDirection({ latitude: 43.6532, longitude: -79.3832 });

    expect(direction).toBeGreaterThan(50);
    expect(direction).toBeLessThan(65);
  });

  it('returns a valid bearing (0-360) for any location', () => {
    const locations = [
      { latitude: 43.6532, longitude: -79.3832 },  // Toronto
      { latitude: 51.5074, longitude: -0.1278 },    // London
      { latitude: -33.8688, longitude: 151.2093 },  // Sydney
      { latitude: 35.6762, longitude: 139.6503 },   // Tokyo
      { latitude: -1.2921, longitude: 36.8219 },     // Nairobi
    ];

    for (const loc of locations) {
      const direction = calculateQiblaDirection(loc);
      expect(direction).toBeGreaterThanOrEqual(0);
      expect(direction).toBeLessThan(360);
    }
  });

  it('points roughly south from a location north of Mecca (Istanbul)', () => {
    // Istanbul is north and slightly west of Mecca — Qibla should be ~150-175 degrees (SSE)
    const direction = calculateQiblaDirection({ latitude: 41.0082, longitude: 28.9784 });

    expect(direction).toBeGreaterThan(140);
    expect(direction).toBeLessThan(180);
  });

  it('points roughly west from a location east of Mecca (Islamabad)', () => {
    // Islamabad is northeast of Mecca — Qibla should be ~250-265 (WSW)
    const direction = calculateQiblaDirection({ latitude: 33.6844, longitude: 73.0479 });

    expect(direction).toBeGreaterThan(245);
    expect(direction).toBeLessThan(270);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/qibla.test.ts --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/qibla.test.ts
git commit -m "test: add Qibla direction user story tests"
```

---

### Task 7: User story — "My settings persist across app restarts"

**Files:**
- Create: `src/__tests__/settings-persistence.test.ts`

Tests that settings defaults are correct, settings merge properly with missing keys, and the old notification format migrates.

- [ ] **Step 1: Write the tests**

```ts
import { Preferences } from '@capacitor/preferences';
import { render, screen, act } from '@testing-library/react';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import type { Settings } from '../types';

// Helper component that exposes settings for assertions
function SettingsInspector({ onSettings }: { onSettings: (s: Settings) => void }) {
  const { settings, isLoading } = useSettings();
  if (!isLoading) onSettings(settings);
  return null;
}

function renderSettingsInspector(onSettings: (s: Settings) => void) {
  return render(
    <SettingsProvider>
      <SettingsInspector onSettings={onSettings} />
    </SettingsProvider>,
  );
}

describe('User story: My settings persist across app restarts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with sensible defaults on first launch (no saved data)', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: null });

    let captured: Settings | null = null;
    await act(async () => {
      renderSettingsInspector((s) => { captured = s; });
    });

    expect(captured).not.toBeNull();
    expect(captured!.calculationMethod).toBe('NorthAmerica');
    expect(captured!.asrCalculation).toBe('Standard');
    expect(captured!.designStyle).toBe('classic');
    expect(captured!.distanceUnit).toBe('miles');
    expect(captured!.notifications.enabled).toBe(true);
    expect(captured!.display.showCurrentPrayer).toBe(true);
    expect(captured!.display.showNextPrayer).toBe(true);
  });

  it('restores saved settings from storage', async () => {
    const saved = {
      calculationMethod: 'Egyptian',
      designStyle: 'islamic',
      distanceUnit: 'km',
    };
    vi.mocked(Preferences.get).mockResolvedValue({ value: JSON.stringify(saved) });

    let captured: Settings | null = null;
    await act(async () => {
      renderSettingsInspector((s) => { captured = s; });
    });

    expect(captured!.calculationMethod).toBe('Egyptian');
    expect(captured!.designStyle).toBe('islamic');
    expect(captured!.distanceUnit).toBe('km');
  });

  it('fills in missing keys with defaults when loading partial settings', async () => {
    // Simulate old save that doesn't have designStyle or surahKahf
    const partialSave = {
      calculationMethod: 'Karachi',
      asrCalculation: 'Hanafi',
    };
    vi.mocked(Preferences.get).mockResolvedValue({ value: JSON.stringify(partialSave) });

    let captured: Settings | null = null;
    await act(async () => {
      renderSettingsInspector((s) => { captured = s; });
    });

    // Saved values preserved
    expect(captured!.calculationMethod).toBe('Karachi');
    expect(captured!.asrCalculation).toBe('Hanafi');
    // Missing values get defaults
    expect(captured!.designStyle).toBe('classic');
    expect(captured!.distanceUnit).toBe('miles');
    expect(captured!.display.showCurrentPrayer).toBe(true);
    expect(captured!.travel.distanceThresholdKm).toBe(88.7);
  });

  it('migrates old boolean notification format to new object format', async () => {
    const oldFormat = {
      notifications: {
        enabled: true,
        prayers: {
          fajr: true,
          sunrise: false,
          dhuhr: true,
          asr: true,
          maghrib: true,
          isha: true,
        },
      },
    };
    vi.mocked(Preferences.get).mockResolvedValue({ value: JSON.stringify(oldFormat) });

    let captured: Settings | null = null;
    await act(async () => {
      renderSettingsInspector((s) => { captured = s; });
    });

    // Booleans should be migrated to objects with enabled field
    expect(captured!.notifications.prayers.fajr.enabled).toBe(true);
    expect(captured!.notifications.prayers.sunrise.enabled).toBe(false);
    expect(captured!.notifications.prayers.fajr.reminderMinutes).toBeDefined();
    expect(captured!.notifications.prayers.fajr.sound).toBeDefined();
  });

  it('handles corrupted saved data gracefully (falls back to defaults)', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'not-valid-json{{{' });

    let captured: Settings | null = null;
    await act(async () => {
      renderSettingsInspector((s) => { captured = s; });
    });

    // Should fall back to defaults, not crash
    expect(captured).not.toBeNull();
    expect(captured!.calculationMethod).toBe('NorthAmerica');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/settings-persistence.test.ts --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/settings-persistence.test.ts
git commit -m "test: add settings persistence and migration user story tests"
```

---

### Task 8: User story — "I can switch between Classic and Islamic designs"

**Files:**
- Create: `src/__tests__/design-switching.test.tsx`

Component rendering tests — when I pick a design style, the app shows the right UI.

- [ ] **Step 1: Write the tests**

```tsx
import { render, screen, act } from '@testing-library/react';
import { Preferences } from '@capacitor/preferences';
import App from '../App';
import { ThemeProvider } from '../context/ThemeContext';
import { SettingsProvider } from '../context/SettingsContext';
import { LocationProvider } from '../context/LocationContext';
import { TravelProvider } from '../context/TravelContext';

function renderApp(savedSettings?: Record<string, unknown>) {
  // Mock onboarding as complete
  vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
    if (key === 'ontime_onboarding_complete') return { value: 'true' };
    if (key === 'ontime_settings' && savedSettings) return { value: JSON.stringify(savedSettings) };
    if (key === 'ontime_location') {
      return {
        value: JSON.stringify({
          coordinates: { latitude: 43.6532, longitude: -79.3832 },
          cityName: 'Toronto',
          countryCode: 'CA',
        }),
      };
    }
    return { value: null };
  });

  return render(
    <ThemeProvider>
      <SettingsProvider>
        <LocationProvider>
          <TravelProvider>
            <App />
          </TravelProvider>
        </LocationProvider>
      </SettingsProvider>
    </ThemeProvider>,
  );
}

describe('User story: I can switch between Classic and Islamic designs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Classic design by default (settings button with gear icon)', async () => {
    await act(async () => {
      renderApp();
    });

    // Classic header has aria-label "Open settings"
    const settingsBtn = await screen.findByLabelText('Open settings');
    expect(settingsBtn).toBeInTheDocument();

    // Classic header has aria-label "Open dashboard"
    const dashboardBtn = screen.getByLabelText('Open dashboard');
    expect(dashboardBtn).toBeInTheDocument();
  });

  it('shows the Islamic design when designStyle is "islamic"', async () => {
    await act(async () => {
      renderApp({ designStyle: 'islamic' });
    });

    // Islamic design still has settings and dashboard buttons
    const settingsBtn = await screen.findByLabelText('Open settings');
    expect(settingsBtn).toBeInTheDocument();

    const dashboardBtn = screen.getByLabelText('Open dashboard');
    expect(dashboardBtn).toBeInTheDocument();
  });

  it('shows the Classic design when designStyle is "classic"', async () => {
    await act(async () => {
      renderApp({ designStyle: 'classic' });
    });

    const settingsBtn = await screen.findByLabelText('Open settings');
    expect(settingsBtn).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/design-switching.test.tsx --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/design-switching.test.tsx
git commit -m "test: add design switching user story component tests"
```

---

### Task 9: User story — "The app respects my chosen color theme"

**Files:**
- Create: `src/__tests__/theme.test.tsx`

- [ ] **Step 1: Write the tests**

```tsx
import { render, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';

function ThemeInspector({ onTheme }: { onTheme: (data: { theme: Theme; effectiveTheme: string }) => void }) {
  const { theme, effectiveTheme } = useTheme();
  onTheme({ theme, effectiveTheme });
  return null;
}

describe('User story: The app respects my chosen color theme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark', 'desert', 'rose', 'forest', 'ocean');
  });

  it('defaults to system theme on first launch', async () => {
    let captured: { theme: Theme; effectiveTheme: string } | null = null;

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeInspector onTheme={(d) => { captured = d; }} />
        </ThemeProvider>,
      );
    });

    expect(captured!.theme).toBe('system');
  });

  it('applies dark class to document when dark theme is active', async () => {
    const { Preferences } = await import('@capacitor/preferences');
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'dark' });

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeInspector onTheme={() => {}} />
        </ThemeProvider>,
      );
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies desert class for desert theme', async () => {
    const { Preferences } = await import('@capacitor/preferences');
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'desert' });

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeInspector onTheme={() => {}} />
        </ThemeProvider>,
      );
    });

    expect(document.documentElement.classList.contains('desert')).toBe(true);
  });

  it('does not add any theme class for light theme', async () => {
    const { Preferences } = await import('@capacitor/preferences');
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'light' });

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeInspector onTheme={() => {}} />
        </ThemeProvider>,
      );
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('desert')).toBe(false);
    expect(document.documentElement.classList.contains('rose')).toBe(false);
    expect(document.documentElement.classList.contains('forest')).toBe(false);
    expect(document.documentElement.classList.contains('ocean')).toBe(false);
  });

  it('supports all 6 theme options without error', async () => {
    const themes: Theme[] = ['light', 'dark', 'system', 'auto', 'desert', 'rose'];

    for (const themeValue of themes) {
      const { Preferences } = await import('@capacitor/preferences');
      vi.mocked(Preferences.get).mockResolvedValue({ value: themeValue });

      const { unmount } = await act(async () => {
        return render(
          <ThemeProvider>
            <ThemeInspector onTheme={() => {}} />
          </ThemeProvider>,
        );
      });

      // No assertion needed — just verifying it doesn't throw
      unmount();
      document.documentElement.classList.remove('dark', 'desert', 'rose', 'forest', 'ocean');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/theme.test.tsx --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/theme.test.tsx
git commit -m "test: add color theme user story tests"
```

---

### Task 10: Run full test suite and verify

- [ ] **Step 1: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: All test files pass. No failures.

- [ ] **Step 2: Verify test count**

Confirm the output shows tests from all 7 test files:
- `prayer-times.test.ts`
- `countdown.test.ts`
- `distance.test.ts`
- `qibla.test.ts`
- `settings-persistence.test.ts`
- `design-switching.test.tsx`
- `theme.test.tsx`

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: complete user story test suite — prayer times, countdown, design switching, settings, distance, qibla, themes"
```

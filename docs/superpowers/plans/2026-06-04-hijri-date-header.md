# Hijri Date Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the current Hijri date as a subtitle under the city name in the main-screen header, in both classic and Islamic design styles, with a user-adjustable ±2-day offset in Settings.

**Architecture:** A pure utility (`src/utils/hijriDate.ts`) wraps `Intl.DateTimeFormat` with `calendar: 'islamic-umalqura'` to produce a formatted string like `"12 Dhul-Hijjah 1447 · Jun 4"`. The `LocationDisplay` component renders it as a subtitle inside its existing button. A new `hijriOffset` field on `DisplaySettings` lets the user nudge the date by ±1 or ±2 days; the existing `updateDisplay()` updater handles persistence with zero new context plumbing.

**Tech Stack:** React 19, TypeScript, Tailwind 4, Vitest, Capacitor 8, `@capacitor/preferences`. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-06-04-hijri-date-header-design.md`

---

## File Structure

**New files:**

- `src/utils/hijriDate.ts` — exports `formatHijriLine(now: Date, offset: number): string | null`. Pure, no React, no I/O.
- `src/__tests__/hijri-date.test.ts` — vitest unit tests for the formatter. Lives in the flat `src/__tests__/` directory per project convention.

**Modified files:**

- `src/types/index.ts` — extend the `DisplaySettings` interface with `hijriOffset: -2 | -1 | 0 | 1 | 2`.
- `src/context/SettingsContext.tsx` — add `hijriOffset: 0` to `defaultDisplaySettings`. Existing deep-merge in `loadSettings()` handles migration automatically — no other change needed.
- `src/components/LocationDisplay.tsx` — render the Hijri subtitle inside the existing button when the formatter returns a non-null string.
- `src/components/SettingsModal.tsx` — append a 5-button segmented control to the Display section (after the existing `Display Cards` block).

---

## Task 1: Extend `DisplaySettings` with `hijriOffset`

**Files:**
- Modify: `src/types/index.ts:123-127`
- Modify: `src/context/SettingsContext.tsx:21-25`

- [ ] **Step 1: Add `hijriOffset` to the `DisplaySettings` type**

Edit `src/types/index.ts`. Replace the existing interface (lines 123–127):

```ts
export interface DisplaySettings {
  showCurrentPrayer: boolean;
  showNextPrayer: boolean;
  showSunnahCard: boolean;
  hijriOffset: -2 | -1 | 0 | 1 | 2;
}
```

- [ ] **Step 2: Add `hijriOffset: 0` to `defaultDisplaySettings`**

Edit `src/context/SettingsContext.tsx`. Replace the existing constant (lines 21–25):

```ts
const defaultDisplaySettings: DisplaySettings = {
  showCurrentPrayer: true,
  showNextPrayer: true,
  showSunnahCard: true,
  hijriOffset: 0,
};
```

- [ ] **Step 3: Verify type-check passes**

Run: `npm run build`
Expected: build succeeds (the `loadSettings()` deep-merge on line ~170 of `SettingsContext.tsx` already spreads `defaultDisplaySettings` over saved values, so existing users transparently inherit `hijriOffset: 0` on first load).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/context/SettingsContext.tsx
git commit -m "feat: add hijriOffset to DisplaySettings type and default"
```

---

## Task 2: Write `formatHijriLine` utility (TDD)

**Files:**
- Create: `src/utils/hijriDate.ts`
- Test: `src/__tests__/hijri-date.test.ts`

### Step 1: Write the failing tests

- [ ] **Step 1.1: Create the test file with all cases**

Create `src/__tests__/hijri-date.test.ts`:

```ts
import { afterEach, beforeEach, vi } from 'vitest';
import { formatHijriLine } from '../utils/hijriDate';

describe('User story: I see the current Hijri date alongside the Gregorian date', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-06-04 local time. This Gregorian date falls inside Dhul-Hijjah 1447 AH
    // under the Umm al-Qura calendar.
    vi.setSystemTime(new Date(2026, 5, 4, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns a "<day> <month> <year> · <gregorian>" string for a normal date', () => {
    const result = formatHijriLine(new Date(), 0);

    expect(result).not.toBeNull();
    // Shape: digits, space, month word(s), space, 4-digit Hijri year, " · ", short Gregorian
    expect(result).toMatch(/^\d{1,2} [A-Za-z' -]+ 14\d{2} · [A-Z][a-z]{2} \d{1,2}$/);
  });

  it('uses the unshifted Gregorian date in the trailing half regardless of offset', () => {
    const zero = formatHijriLine(new Date(), 0);
    const plusTwo = formatHijriLine(new Date(), 2);

    // Both results must end with the same Gregorian segment (after " · ").
    const gregZero = zero!.split(' · ')[1];
    const gregPlusTwo = plusTwo!.split(' · ')[1];
    expect(gregZero).toBe(gregPlusTwo);
  });

  it('shifts the Hijri day forward when offset is +1', () => {
    const zero = formatHijriLine(new Date(), 0)!;
    const plusOne = formatHijriLine(new Date(), 1)!;

    const dayZero = parseInt(zero.split(' ')[0], 10);
    const dayPlusOne = parseInt(plusOne.split(' ')[0], 10);

    // Either the day advanced by 1, or the month rolled over and the new day is 1.
    expect(dayPlusOne === dayZero + 1 || dayPlusOne === 1).toBe(true);
  });

  it('shifts the Hijri day backward when offset is -1', () => {
    const zero = formatHijriLine(new Date(), 0)!;
    const minusOne = formatHijriLine(new Date(), -1)!;

    const dayZero = parseInt(zero.split(' ')[0], 10);
    const dayMinusOne = parseInt(minusOne.split(' ')[0], 10);

    // Either the day retreated by 1, or the month rolled back and the new day is at month-end.
    expect(dayMinusOne === dayZero - 1 || dayMinusOne >= 28).toBe(true);
  });

  it('clamps out-of-range offsets to ±2 defensively', () => {
    const clampedHigh = formatHijriLine(new Date(), 99);
    const expectedHigh = formatHijriLine(new Date(), 2);
    expect(clampedHigh).toBe(expectedHigh);

    const clampedLow = formatHijriLine(new Date(), -99);
    const expectedLow = formatHijriLine(new Date(), -2);
    expect(clampedLow).toBe(expectedLow);
  });

  it('strips the unicode modifier letter from Intl month names', () => {
    const result = formatHijriLine(new Date(), 0);
    // U+02BB MODIFIER LETTER TURNED COMMA — Intl returns "Dhuʻl-Hijjah", we want "Dhul-Hijjah".
    expect(result).not.toContain('ʻ');
  });

  it('returns null when Intl.DateTimeFormat throws', () => {
    const original = Intl.DateTimeFormat;
    // @ts-expect-error — overriding constructor for the test
    Intl.DateTimeFormat = vi.fn(() => {
      throw new Error('unsupported calendar');
    });

    try {
      const result = formatHijriLine(new Date(), 0);
      expect(result).toBeNull();
    } finally {
      Intl.DateTimeFormat = original;
    }
  });

  it('returns null when Intl silently falls back to a Gregorian-looking year', () => {
    const original = Intl.DateTimeFormat;
    // Pretend Intl ignored the calendar tag and returned the Gregorian year.
    // The sanity-check inside formatHijriLine returns null before the
    // Gregorian formatter is ever constructed, so we can fake every call.
    class FakeFormatter {
      formatToParts() {
        return [
          { type: 'day', value: '4' },
          { type: 'literal', value: ' ' },
          { type: 'month', value: 'June' },
          { type: 'literal', value: ' ' },
          { type: 'year', value: '2026' },
        ];
      }
      format() {
        return 'Jun 4';
      }
    }
    // @ts-expect-error — overriding constructor for the test
    Intl.DateTimeFormat = vi.fn(() => new FakeFormatter());

    try {
      const result = formatHijriLine(new Date(), 0);
      expect(result).toBeNull();
    } finally {
      Intl.DateTimeFormat = original;
    }
  });
});
```

- [ ] **Step 1.2: Run the tests to verify they fail**

Run: `npm test -- hijri-date`
Expected: FAIL with `Failed to resolve import "../utils/hijriDate"` (module not yet created).

### Step 2: Implement the minimal utility

- [ ] **Step 2.1: Create `src/utils/hijriDate.ts`**

```ts
const HIJRI_FORMATTER_LOCALE = 'en-u-ca-islamic-umalqura';
const GREGORIAN_FORMATTER_LOCALE = 'en-US';

function clamp(offset: number): number {
  if (offset > 2) return 2;
  if (offset < -2) return -2;
  return offset | 0;
}

export function formatHijriLine(now: Date, offset: number): string | null {
  try {
    const adjusted = new Date(now);
    adjusted.setDate(now.getDate() + clamp(offset));

    const hijriParts = new Intl.DateTimeFormat(HIJRI_FORMATTER_LOCALE, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(adjusted);

    const get = (type: string) =>
      hijriParts.find((p) => p.type === type)?.value;

    const day = get('day');
    const monthRaw = get('month');
    const yearRaw = get('year');

    if (!day || !monthRaw || !yearRaw) return null;

    const year = parseInt(yearRaw, 10);
    if (Number.isNaN(year)) return null;

    // Sanity check: if Intl silently fell back to a Gregorian calendar, the year
    // will be close to the Gregorian year. Hijri years are ~579 less.
    if (Math.abs(year - now.getFullYear()) < 3) return null;

    // U+02BB MODIFIER LETTER TURNED COMMA appears in ICU month names like "Dhuʻl-Hijjah".
    const month = monthRaw.replace(/ʻ/g, '');

    const gregorian = new Intl.DateTimeFormat(GREGORIAN_FORMATTER_LOCALE, {
      month: 'short',
      day: 'numeric',
    }).format(now);

    return `${day} ${month} ${year} · ${gregorian}`;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2.2: Run the tests and verify they pass**

Run: `npm test -- hijri-date`
Expected: all 8 tests PASS.

- [ ] **Step 2.3: Commit**

```bash
git add src/utils/hijriDate.ts src/__tests__/hijri-date.test.ts
git commit -m "feat: add formatHijriLine utility with Umm al-Qura calendar"
```

---

## Task 3: Render Hijri subtitle in `LocationDisplay`

**Files:**
- Modify: `src/components/LocationDisplay.tsx`

- [ ] **Step 1: Update imports**

Edit `src/components/LocationDisplay.tsx`. Replace the existing import block at the top (lines 1–2):

```tsx
import { useMemo, useState } from 'react';
import { useLocation } from '../context/LocationContext';
import { useSettings } from '../context/SettingsContext';
import { formatHijriLine } from '../utils/hijriDate';
```

- [ ] **Step 2: Compute the Hijri line inside the component**

Inside `LocationDisplay`, after the existing `const [showMap, setShowMap] = useState(false);` line, add:

```tsx
const { settings } = useSettings();
const hijriLine = useMemo(
  () => formatHijriLine(new Date(), settings.display.hijriOffset),
  // The toDateString() dep makes the memo recompute when the local calendar day
  // changes. The app's countdown ticker re-renders this component each second,
  // so within one tick of midnight the subtitle advances on its own.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [settings.display.hijriOffset, new Date().toDateString()]
);
```

- [ ] **Step 3: Render the subtitle inside the existing button**

Replace the existing `<button>` block (lines 29–47 in the original file) with a stacked layout:

```tsx
<button
  onClick={handleTap}
  disabled={isLoading}
  className="flex flex-col items-center gap-0.5 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
>
  <div className="flex items-center gap-1.5">
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
    <span className="text-sm font-medium">
      {isLoading ? 'Loading...' : error ? 'Tap to retry' : location.cityName}
    </span>
    {isLoading && (
      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    )}
  </div>
  {hijriLine && !isLoading && !error && (
    <span className="text-[11px] opacity-80 leading-tight">{hijriLine}</span>
  )}
</button>
```

- [ ] **Step 4: Verify the build still type-checks**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Run the existing test suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass (the new Hijri test from Task 2 is included).

- [ ] **Step 6: Commit**

```bash
git add src/components/LocationDisplay.tsx
git commit -m "feat: render hijri date subtitle in LocationDisplay header"
```

---

## Task 4: Add Hijri offset segmented control in `SettingsModal`

**Files:**
- Modify: `src/components/SettingsModal.tsx:699-722`

- [ ] **Step 1: Add the offset control after the Display Cards block**

Edit `src/components/SettingsModal.tsx`. Find the `Display Cards` block ending at line 722 (`</div>` closing the `flex flex-col gap-2` toggles div, followed by `</div>` closing the `Display Cards` section). Immediately after that outer `</div>` (line 722) — before the closing `</div>` of the parent display-tab container on line 723 — insert a new section:

```tsx
            {/* Hijri Date Adjustment */}
            <div>
              <label className="block text-sm text-[var(--color-muted)] mb-2">Hijri Date Adjustment</label>
              <div className="grid grid-cols-5 gap-2">
                {([-2, -1, 0, 1, 2] as const).map((value) => {
                  const isActive = settings.display.hijriOffset === value;
                  const label = value > 0 ? `+${value}` : `${value}`;
                  return (
                    <button
                      key={value}
                      onClick={() => updateDisplay({ hijriOffset: value })}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        isActive
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                          : 'border-[var(--color-border)] bg-[var(--color-card)]'
                      }`}
                    >
                      <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-2">
                Adjust if your local moon-sighting differs from the Saudi (Umm al-Qura) calendar.
              </p>
            </div>
```

- [ ] **Step 2: Verify the build still type-checks**

Run: `npm run build`
Expected: build succeeds. The TypeScript literal-union on `hijriOffset` is satisfied because the array is declared `as const`, so each element narrows to `-2 | -1 | 0 | 1 | 2`.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat: add Hijri offset segmented control in Settings Display"
```

---

## Task 5: Manual smoke check

This task is a verification gate, not code. Do not skip — the test suite covers logic but not visual fit.

**Files:** none

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite reports a local URL (typically `http://localhost:5173`). Open it in a browser.

- [ ] **Step 2: Verify the subtitle appears in the classic header**

Open Settings → Appearance → Design → pick **Classic**. Close Settings.

Expected: header center shows the city name on top with a smaller line below it like `12 Dhul-Hijjah 1447 · Jun 4` (the exact date depends on the day you run this). The subtitle should be one-line, not wrapping, in muted color.

- [ ] **Step 3: Verify the subtitle appears in the Islamic header**

Open Settings → Appearance → Design → pick **Islamic**. Close Settings.

Expected: same subtitle visible in the Islamic-themed header. The styling adapts via existing CSS variables.

- [ ] **Step 4: Verify the offset control works**

Open Settings → Display. Scroll to the new **Hijri Date Adjustment** row. Click each segment in turn (`−2`, `−1`, `0`, `+1`, `+2`) and observe the Hijri portion of the header subtitle shifting by the expected number of days each time. The Gregorian half (after the `·`) must stay the same.

- [ ] **Step 5: Verify persistence**

With the offset set to a non-zero value (e.g. `+1`), reload the page. The selected segment should remain highlighted and the header subtitle should still show the offset Hijri date.

- [ ] **Step 6: Stop the dev server**

`Ctrl-C` in the terminal running `npm run dev`.

- [ ] **Step 7: If everything worked, no commit is needed.**

If something visual needs adjusting (typography size, spacing, copy wording), make a follow-up commit before moving on.

---

## Out of scope

These were excluded during brainstorming and must not be added in this plan:

- A calendar-standard picker (Astronomical / Civil / Tabular). Default to Umm al-Qura only.
- Arabic-script month names or Eastern-Arabic numerals.
- Hijri date rendering anywhere outside `LocationDisplay`.
- A show/hide toggle for the subtitle.
- A region-aware default offset.

If any of those come up during implementation, stop and surface them — they belong to a future spec, not this plan.

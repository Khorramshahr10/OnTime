# Hijri Date in Header — Design Spec

**Date:** 2026-06-04
**Status:** Approved — ready for implementation plan
**Scope:** Display the current Hijri (Islamic) date in the main-screen header, with a user-adjustable ±2-day offset.

---

## Goal

Show the current Hijri date as a subtitle under the city name in the header, in both `classic` and `islamic` design styles, with a per-user offset adjustment in Settings to match local moon-sighting committees.

Example rendering:

```
📍 Lahore, Pakistan
12 Dhul-Hijjah 1447 · Jun 4
```

---

## Decisions

| Decision | Choice |
|---|---|
| Placement | Stacked subtitle under city name inside `LocationDisplay` |
| Format | `{day} {month} {year} · {short Gregorian}` e.g. `12 Dhul-Hijjah 1447 · Jun 4` |
| Calendar standard | Umm al-Qura (`islamic-umalqura` via `Intl.DateTimeFormat`) |
| Offset | User-adjustable −2 / −1 / 0 / +1 / +2 in Settings → Display; default `0` |
| Themes | Both `classic` and `islamic` (single `LocationDisplay` change handles both) |
| Intl fallback | If `Intl.DateTimeFormat` cannot produce a Hijri date, hide the subtitle silently |
| New dependencies | None — `Intl` is built into the Capacitor WebView |

---

## Architecture

### Files

**New (2):**

- `src/utils/hijriDate.ts` — pure formatter
- `src/utils/__tests__/hijriDate.test.ts` — vitest unit tests

**Modified (4):**

- `src/types/index.ts` — add `hijriOffset` to `DisplaySettings`
- `src/context/SettingsContext.tsx` — extend `defaultDisplaySettings` with `hijriOffset: 0`
- `src/components/LocationDisplay.tsx` — render Hijri subtitle under city
- `src/components/SettingsModal.tsx` — add offset segmented control in Display section

### Dependency graph

```
SettingsContext (display.hijriOffset)
        │
        ▼
LocationDisplay  ──▶  hijriDate.formatHijriLine()
                              │
                              ▼
                       Intl.DateTimeFormat
```

No circular dependencies. Util is pure (no React, no context, no I/O), so it tests in isolation.

---

## Component design

### `src/utils/hijriDate.ts`

Single named export:

```ts
export function formatHijriLine(now: Date, offset: number): string | null
```

**Algorithm:**

1. Clamp `offset` into `[-2, 2]` (defensive — settings should already enforce this, but utility should not trust callers).
2. Compute `adjusted = new Date(now)` and `adjusted.setDate(now.getDate() + offset)`.
3. Try `Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(adjusted)`.
4. Extract `day`, `month`, `year` parts. Sanitize the month name by stripping the Unicode modifier letter `ʻ` (U+02BB) so `"Dhuʻl-Hijjah"` becomes `"Dhul-Hijjah"`.
5. **Sanity-check the year:** if the Hijri year is within ±2 of `now.getFullYear()`, treat it as a silent Intl fallback (Gregorian leaking through) and return `null`.
6. Build the Gregorian half from the **unshifted** `now`: `Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(now)` → e.g. `"Jun 4"`.
7. Return `` `${day} ${month} ${year} · ${gregorian}` ``.
8. Wrap the whole flow in `try / catch`. On any throw, return `null`.

**Why offset only shifts the Hijri half:** the Gregorian half is just a quick cross-reference for the actual calendar day on the device. The offset is a *user perception* of which Hijri day they're in based on sighting — the Gregorian date on the device is not in dispute.

### `src/components/LocationDisplay.tsx`

Current layout: single `<button>` with `[pin] [city]`. Change to a vertical stack inside the same button so the whole block keeps the existing map-popup tap target.

```tsx
const hijriLine = useMemo(
  () => formatHijriLine(new Date(), settings.display.hijriOffset),
  [settings.display.hijriOffset, new Date().toDateString()]
);
```

Layout:

```
<button class="flex flex-col items-center gap-0.5 ...">
  <div class="flex items-center gap-1.5">
    <pin-icon /> <span class="text-sm font-medium">{cityName}</span>
  </div>
  {hijriLine && !isLoading && !error && (
    <span class="text-[11px] text-[var(--color-muted)] opacity-80">
      {hijriLine}
    </span>
  )}
</button>
```

Subtitle is hidden during `isLoading` and `error` so the header doesn't flicker during boot or retry. Suppressed when `hijriLine === null` (Intl fallback case).

**Midnight rollover:** the `useMemo` key includes `new Date().toDateString()`. The dep value changes when the date string changes, but `useMemo` only re-evaluates when React re-renders. The app's existing countdown ticker re-renders the tree once per second, so within one tick of midnight the memo recomputes and the subtitle updates. No new timer needed.

### `src/context/SettingsContext.tsx`

Extend `defaultDisplaySettings`:

```ts
const defaultDisplaySettings: DisplaySettings = {
  showCurrentPrayer: true,
  showNextPrayer: true,
  showSunnahCard: true,
  hijriOffset: 0,
};
```

No new updater function — existing `updateDisplay()` already handles partial updates to `DisplaySettings`. Existing `loadSettings()` deep-merges with `defaultDisplaySettings`, so users on previous versions silently inherit `hijriOffset: 0` on first load. Zero migration work.

### `src/types/index.ts`

Extend the existing `DisplaySettings` interface:

```ts
interface DisplaySettings {
  showCurrentPrayer: boolean;
  showNextPrayer: boolean;
  showSunnahCard: boolean;
  hijriOffset: -2 | -1 | 0 | 1 | 2;
}
```

The literal-union type means the segmented control can only emit valid values; no runtime validation needed at the call site.

### `src/components/SettingsModal.tsx`

Add a new row in the Display section, after the existing toggles. Segmented control:

- Five buttons labelled `−2`, `−1`, `0`, `+1`, `+2`.
- Active button uses `bg-[var(--color-primary)]` and white text; inactive use existing muted styling.
- Helper text below: *"Adjust if your local moon-sighting differs from the Saudi (Umm al-Qura) calendar."*
- Click handler: `updateDisplay({ hijriOffset: n })`.

Visual:

```
Display
  Show current prayer card     [ on  ]
  Show next prayer card        [ on  ]
  Show Sunnah card             [ on  ]
  ─────────────────────────────────────
  Hijri date adjustment
  ┌────┬────┬────┬────┬────┐
  │ −2 │ −1 │  0 │ +1 │ +2 │     ← only "0" highlighted by default
  └────┴────┴────┴────┴────┘
  Adjust if your local moon-sighting
  differs from the Saudi calendar.
```

---

## Data flow

```
User opens app
  │
  ▼
SettingsContext loads from Preferences ──▶ display.hijriOffset = 0 (or saved)
  │
  ▼
LocationDisplay renders
  │
  ▼
useMemo → formatHijriLine(new Date(), settings.display.hijriOffset)
  │       └─▶ Intl.DateTimeFormat with calendar: 'islamic-umalqura'
  │       └─▶ "12 Dhul-Hijjah 1447 · Jun 4" or null
  │
  ▼
Render subtitle (or hide if null/loading/error)


User changes offset in Settings
  │
  ▼
updateDisplay({ hijriOffset: -1 })
  │
  ▼
SettingsContext re-renders → LocationDisplay re-runs useMemo → new subtitle

Countdown ticker re-renders LocationDisplay each second
  │
  ▼
useMemo dep (date string) is stable until midnight
  │
  ▼
At local 00:00 the date string changes → memo recomputes → subtitle advances
```

---

## Error handling

| Failure | Behavior |
|---|---|
| `Intl.DateTimeFormat` throws (very old WebView) | Caught; util returns `null`; subtitle hidden |
| Intl silently returns Gregorian-looking year | Sanity check catches it; util returns `null`; subtitle hidden |
| `Intl` returns unexpected month string | Returned as-is — month name comes from ICU and Intl never returns garbage strings for a valid calendar; not worth defensive code |
| Settings load fails | Existing handling in `SettingsContext.loadSettings` already logs and falls back to defaults; we inherit that |
| Hijri offset stored as out-of-range value (corrupt preferences) | Util clamps to `[-2, 2]` defensively |

No new error surfaces created. No new logging or telemetry.

---

## Testing strategy

**Unit tests in `src/utils/__tests__/hijriDate.test.ts`** (vitest, matches existing test style in the repo):

| Test case | Mocked date | Offset | Expected |
|---|---|---|---|
| Normal mid-month date | 2026-06-04 | 0 | matches `/^\d{1,2} [A-Za-z'-]+ 14\d{2} · Jun 4$/` |
| Offset +1 advances Hijri day | 2026-06-04 | 1 | day part is one greater than offset-0 case |
| Offset −1 retreats Hijri day | 2026-06-04 | −1 | day part is one less than offset-0 case |
| Offset shifts across Hijri month boundary | last day of a Hijri month | +1 | month part changes |
| Offset out of range | 2026-06-04 | 99 | clamped to +2 |
| Intl unsupported (mock `Intl.DateTimeFormat` to throw) | any | 0 | returns `null` |
| Intl returns Gregorian year (mock returns year `2026`) | 2026-06-04 | 0 | returns `null` |
| Result format shape | 2026-06-04 | 0 | matches `/^\d+ \S+ \d+ · \w+ \d+$/` |

**Component tests** are optional given the formatter is the interesting logic. If we add one for `LocationDisplay`, the only useful assertion is: when `formatHijriLine` returns `null`, no subtitle is rendered. Skip otherwise.

No e2e / device tests — the Intl fallback path is covered by the unit test and visually verified during manual smoke.

**Manual smoke check (post-merge):**

1. Launch app on test device → header shows city + Hijri+Gregorian subtitle.
2. Open Settings → Display → change offset → subtitle updates immediately.
3. Reload app → offset persisted, subtitle reflects saved value.
4. Switch design style classic ↔ islamic → subtitle appears in both.

---

## Out of scope (deferred)

These were discussed and explicitly excluded from this spec:

- Per-user calendar standard picker (Astronomical / Civil / Tabular) — would add UI clutter; current consensus is Umm al-Qura covers the overwhelming majority.
- Arabic-script month names with Eastern-Arabic numerals — possible future toggle, not requested now.
- Hijri date elsewhere in the app (Dashboard history rows, prayer-time table headers, notifications) — single use site for now.
- "Show/hide Hijri date" toggle — user picked "Both styles (always shown)" over the toggle option.
- Locale-driven default offset based on device region — too magical; explicit user choice is clearer.

---

## Open questions

None — all decisions locked in during brainstorming.

# Islamic History Calendar — Design Spec

**Date:** 2026-08-18
**Status:** Draft — awaiting user review
**Scope:** Surface Islamic historical events on their Hijri anniversary, as a home-screen teaching card, a browsable screen, and an opt-in daily notification.

---

## Goal

Connect the user's ordinary day to Islamic tradition. When today's Hijri date matches a historical event — 17 Ramadan and the Battle of Badr, 10 Muharram and Ashura — the app surfaces it as a short teaching moment, expandable into a fuller account, with an optional notification.

```
Today · Mon, March 9, 2026
17 Ramadan 1447

┌─────────────────────────────┐
│  ON THIS DAY                │
│  The Battle of Badr         │
│  17 Ramadan, 2 AH           │
│                             │
│  313 against roughly 1,000… │
│                     Read →  │
└─────────────────────────────┘
```

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Anniversary basis | Hijri month + day | How the tradition reckons anniversaries; makes Ramadan/Muharram/Dhul-Hijjah feel dense |
| Calendar standard | Umm al-Qura via `Intl` | Same as the Hijri header spec; no new dependency |
| Surfaces | Card + detail + browse screen | User needs somewhere to go on the ~4-in-5 days with no event |
| Dataset shape | One static module, dynamically imported | Mirrors the existing `src/data/cities.ts` pattern; one file is the review unit |
| Dataset size | ~50 events | ~1 card/week; denser in the months that already matter |
| Scripture text | **References only, no quoted text** | Translation licensing is murky; a drifting paraphrase is this feature's worst failure mode |
| Disputed dates | `dateConfidence` field, hedged in UI | Stating a contested date as fact damages the trust this feature exists to build |
| Notifications | Opt-in, default **off** | Matches how `jumuah` and `surahKahf` already default |
| Notification time | User-set clock time, default `09:00` | A prayer anchor would collide with that prayer's own notification |
| Notification volume | `majorOnly` toggle, default **on** | ~monthly rather than ~weekly, on top of ~12 existing daily prayer notifications |
| Hijri utility ownership | Built here; header render left to its own plan | This feature cannot work without it; no scope bleed into `LocationDisplay` |
| Design-style handling | One component branching on `designStyle` | Deviates from the `PrayerTable`/`IslamicPrayerTable` pair convention — see note below |

---

## Architecture

### Files

**New (7):**

- `src/data/islamicEvents.ts` — the dataset
- `src/utils/hijriDate.ts` — Hijri conversion (pure)
- `src/services/islamicEventService.ts` — date matching (pure)
- `src/components/OnThisDayCard.tsx` — home-screen card + empty-day strip
- `src/components/IslamicHistoryScreen.tsx` — browse overlay + detail state
- `src/utils/__tests__/hijriDate.test.ts`
- `src/__tests__/islamic-events.test.ts`

**Modified (6):**

- `src/types/index.ts` — `IslamicEvent`, `IslamicHistorySettings`, `DisplaySettings.hijriOffset`, `NotificationCategory`
- `src/context/SettingsContext.tsx` — defaults for the two new settings blocks
- `src/services/notificationService.ts` — `scheduleIslamicEventNotifications`, category rename
- `src/hooks/useNotifications.ts` — fourth debounced reschedule
- `src/App.tsx` — card slot, overlay, back-button cases
- `src/components/SettingsModal.tsx` — new *Islamic History* section

### Dependency graph

```
islamicEvents.ts (data, lazy chunk)
        │
        ▼
islamicEventService.ts ──▶ hijriDate.ts ──▶ Intl.DateTimeFormat
        │
        ├──▶ OnThisDayCard / IslamicHistoryScreen   (UI)
        └──▶ notificationService                    (scheduling)
```

Both utils are pure — no React, no context, no I/O — so they test in isolation. The data module is a leaf.

---

## Data model

```ts
export type EventTier = 'major' | 'standard';
export type DateConfidence = 'established' | 'commonly-held' | 'disputed';
export type EventCategory = 'seerah' | 'khulafa' | 'worship' | 'later-history';

export interface IslamicEvent {
  id: string;                    // stable slug — notification payload + dedup key
  title: string;
  hijriMonth: number;            // 1–12
  hijriDay: number;              // 1–30
  hijriYear: number | null;      // AH year; null = recurring observance
  gregorianYear: number | null;  // approx CE, display only
  tier: EventTier;
  category: EventCategory;
  dateConfidence: DateConfidence;
  summary: string;               // ~35 words — card body + notification text
  narrative: string;             // ~250 words — detail view
  lesson: string;                // ~50 words — "what it teaches"
  sources: string[];             // ["Ibn Hisham, Sirah", "Sahih al-Bukhari 3951"]
  quranRefs?: string[];          // ["8:5-19"]
}
```

`hijriYear: null` marks recurring observances — Ashura, Day of Arafah, both Eids, 1 Ramadan, the odd nights of the last ten. Not history as such, but the highest-value days in the year, and they anchor dates that would otherwise be empty. `category: 'worship'` keeps them distinguishable.

### Content policy

These are requirements on the dataset, enforced where possible by `islamic-events.test.ts`:

1. **No quoted Qur'an or hadith text.** Only citations, rendered by the UI as pointers (`Qur'an 8:5–19`, `Sahih al-Bukhari 3951`). Revisit only once a licensed translation is chosen.
2. **Every event carries at least one entry in `sources`.** Test-enforced.
3. **`dateConfidence` is honest.** `established` is reserved for dates with broad classical agreement (Badr, Uhud, the Hijrah). Meccan-period events, the mawlid, and the Isra' and Mi'raj are `commonly-held` or `disputed`.
4. **The UI renders confidence, never hides it:**
   - `established` → `17 Ramadan, 2 AH`
   - `commonly-held` → `17 Ramadan, 2 AH`
   - `disputed` → `Commonly dated 27 Rajab · date disputed`

### Dataset scope (~50 events)

| Category | Count | Examples |
|---|---|---|
| `seerah` | ~25 | Hijrah, Badr, Uhud, Khandaq, Hudaybiyyah, Khaybar, Fath Makkah, Tabuk, Farewell Hajj, the Prophet's ﷺ passing |
| `khulafa` | ~12 | Yarmuk, Qadisiyyah, the opening of Jerusalem, the Uthmanic compilation, Karbala |
| `worship` | ~8 | Ashura, Arafah, both Eids, 1 Ramadan, odd nights of the last ten |
| `later-history` | ~8 | Hattin, Ain Jalut, the fall of Baghdad, Constantinople |

Roughly one card every seventh day, clustering in Ramadan, Muharram, Dhul-Hijjah and Rabi' al-Awwal.

---

## Component design

### `src/utils/hijriDate.ts`

```ts
export interface HijriDate { year: number; month: number; day: number }

export function toHijri(date: Date, offset: number): HijriDate | null
export function hijriMonthName(month: number): string
export function monthHasDay30(date: Date, offset: number): boolean
export function formatHijriLine(date: Date, offset: number): string | null
```

`toHijri` clamps `offset` to `[-2, 2]`, shifts the date by that many days, and reads numeric parts from
`Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { numberingSystem: 'latn', day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts()`.

Sanity check carried over from the Hijri header spec: if the returned year is within ±2 of the Gregorian year, Intl silently fell back to Gregorian — return `null`. Whole flow wrapped in `try/catch`; any throw returns `null`.

`monthHasDay30` avoids needing a Hijri→Gregorian inverse: take the date, add `30 - day` days, convert, and check the month number still matches.

`formatHijriLine` is the function the 2026-06-04 header spec already specifies, built here because it is three lines on top of `toHijri`. That plan then shrinks to the `LocationDisplay` render alone.

### `src/services/islamicEventService.ts`

```ts
export function getEventsForDate(
  date: Date, offset: number, events: IslamicEvent[]
): IslamicEvent[]

export function getUpcomingEvents(
  from: Date, offset: number, days: number, events: IslamicEvent[]
): { date: Date; event: IslamicEvent }[]
```

**Matching:** `event.hijriMonth === h.month && event.hijriDay === h.day`, plus the day-30 rule — an event dated day 30 also matches day 29 when `monthHasDay30` is false. Umm al-Qura months run 29 or 30 days, so without this a day-30 event silently never fires in short years.

**Sort:** `major` before `standard`, then observances (`hijriYear === null`) before dated events, then earliest AH year first. On 10 Muharram this puts Ashura above Karbala.

**`getUpcomingEvents`** walks forward one day at a time rather than inverting the calendar. 60 `Intl` formats is imperceptible and avoids a class of conversion bugs.

### Notifications — `src/services/notificationService.ts`

`NotificationCategory` currently declares `'reminder'` with range `1200–1299` and nothing uses it. Rename that dead member to `'history'`; no notification has ever occupied the range, so there is no migration.

```ts
export async function scheduleIslamicEventNotifications(
  settings: Settings
): Promise<void>
```

Follows the shape of the existing Kahf and Jumu'ah schedulers:

1. `cancelByCategory('history')`, then bail if `!settings.islamicHistory.notificationsEnabled`
2. Check permission via the existing `requestNotificationPermission()`
3. Walk the next **30 days**; for each, `getEventsForDate` → top-ranked event → skip when `majorOnly` and `tier === 'standard'`
4. Schedule at the user's clock time on that date; skip if already past
5. `id: 1200 + dayOffset` → 1200–1229, inside the range
6. `extra: { eventId }` so a tap opens the right detail view
7. Title `"On this day"`, body `` `${title} — ${day} ${monthName}, ${year} AH` ``
8. `smallIcon: 'ic_stat_icon'`, `largeIcon: 'ic_launcher'`, matching every other scheduler

Volume: ≤30 added to the ~84 prayer alarms already pending, far under Android's ceiling.

`setupNotificationListeners` gains an **optional second callback** for history taps, reading `extra.eventId`. The existing prayer-ID inference is untouched.

`useNotifications` gains a fourth `rescheduleIslamicEvents` with the same 300ms debounce, keyed on `settings.islamicHistory` and `settings.display.hijriOffset`.

### UI

The app has no router — `Dashboard`, `QiblaCompass` and `SettingsModal` are `React.lazy` overlays driven by `isOpen`. This follows that.

**Entry point.** The header already carries settings on the left and two buttons on the right; a fifth crowds small phones. Instead the card slot itself is the entry:

- Event days → `OnThisDayCard`
- Empty days → a single-line `Islamic History →` strip in the same slot

**`OnThisDayCard.tsx`** — eyebrow `ON THIS DAY`, title, confidence-hedged Hijri line, summary clamped to two lines, `Read →`, and `+N more today` when the date carries several.

> **Convention note:** `PrayerTable`/`IslamicPrayerTable` and `CountdownTimer`/`IslamicCountdownTimer` exist as duplicated pairs per design style. This card is instead **one component branching on `settings.designStyle`**, because it is a fraction of their complexity and duplicating ~150 lines that differ in radius and background is not worth the maintenance. Deliberate deviation.

**`IslamicHistoryScreen.tsx`** — lazy-loaded full-screen overlay with *Today*, *This month* (every event in the current Hijri month with Gregorian dates resolved), and *Upcoming* (next 60 days).

**Detail is a state inside that overlay**, keyed by `selectedEventId` — not a separate component. One lazy chunk, one back path. Renders title, both dates with the confidence hedge, category chip, narrative, *What it teaches*, and sources plus Qur'an references as plain citation text.

The screen accepts an optional `initialEventId`, serving all three routes in: card tap, browse tap, notification tap.

**Back button.** `App.tsx` owns `historyState: { open: boolean; eventId: string | null }`. `handleBackButton` gains two cases ahead of qibla — an open detail pops to the list, then the list closes. Plain state; no `onBackRef` plumbing, since the screen is fully controlled.

### Settings and types

```ts
export interface IslamicHistorySettings {
  notificationsEnabled: boolean;  // default false
  notificationTime: string;       // "HH:MM", default "09:00"
  majorOnly: boolean;             // default true
}
```

Plus `DisplaySettings.hijriOffset: -2 | -1 | 0 | 1 | 2` (default `0`) and `Settings.islamicHistory`.

`SettingsContext.loadSettings` already deep-merges against defaults, so existing users inherit both silently. **Zero migration work.**

New *Islamic History* section in `SettingsModal`: notifications toggle, then time and *Major events only* revealed when enabled, then the −2…+2 Hijri adjustment control from the header spec — it belongs here because event matching depends on it.

> `SettingsModal.tsx` is already 1911 lines and this adds ~80. Added as a self-contained block rather than restructuring; extracting that file is real work unrelated to this feature, but it is the largest file in the repo and deserves its own task.

---

## Data flow

```
App mounts
  │
  ├─▶ SettingsContext loads ──▶ islamicHistory + display.hijriOffset
  │
  ├─▶ OnThisDayCard
  │     └─▶ await import('../data/islamicEvents')
  │           └─▶ getEventsForDate(now, hijriOffset, EVENTS)
  │                 ├─ [] ──────────▶ render "Islamic History →" strip
  │                 └─ [event, …] ──▶ render card, "+N more today"
  │
  └─▶ useNotifications
        └─▶ (300ms debounce) scheduleIslamicEventNotifications(settings)
              └─▶ cancelByCategory('history') → walk 30 days → schedule 1200–1229

User taps card / strip / notification
  │
  ▼
App.historyState = { open: true, eventId }
  │
  ▼
<IslamicHistoryScreen initialEventId={eventId} />
  │
  ├─ eventId set  → detail view
  └─ eventId null → Today / This month / Upcoming lists

User changes hijriOffset
  │
  ▼
updateDisplay({ hijriOffset }) → card re-matches AND notifications reschedule
```

The offset feeding both matching and scheduling is what keeps the card, the browse screen, the notification and (later) the header subtitle all agreeing on what day it is.

---

## Error handling

| Failure | Behavior |
|---|---|
| `Intl` throws, or silently returns Gregorian | `toHijri` returns `null`; card renders the plain strip, scheduler schedules nothing. Feature disappears rather than showing wrong dates. |
| Dataset chunk fails to load | Card renders nothing; caught and logged. Prayer times unaffected. |
| Notification permission denied | Existing `requestNotificationPermission()` path; warn and return, same as the other schedulers. |
| Corrupt `hijriOffset` in Preferences | `toHijri` clamps to `[-2, 2]` defensively. |
| Event date lands on day 30 of a 29-day month | Matches day 29 instead. |
| `notificationTime` unparseable | Fall back to `09:00` rather than skipping the notification. |
| Multiple events on one date | Sorted; card shows the top one plus a count, browse screen lists all. |

No new error surfaces. Every failure degrades to "no card, no notification" and leaves prayer functionality untouched.

---

## Testing strategy

Vitest, matching existing repo style.

**`src/utils/__tests__/hijriDate.test.ts`**

| Case | Expected |
|---|---|
| Known Gregorian date → Hijri | matches the Umm al-Qura value |
| Offset +1 / −1 | day shifts by one |
| Offset across a Hijri month boundary | month number changes |
| Offset out of range (`99`) | clamped to `+2` |
| `Intl.DateTimeFormat` mocked to throw | returns `null` |
| Intl mocked to return a Gregorian-looking year | returns `null` |
| `monthHasDay30` on a 29- and a 30-day month | `false` / `true` |

**`src/__tests__/islamic-events.test.ts`**

| Case | Expected |
|---|---|
| 17 Ramadan | returns Badr |
| Date with no event | returns `[]` |
| Day-30 event in a 29-day month | matches on day 29 |
| Two events on one date | `major` first, then earliest AH |
| 10 Muharram | Ashura above Karbala |
| `getUpcomingEvents(60)` | ascending dates, none before `from` |
| Notification IDs | all within 1200–1299 |
| `majorOnly: true` | no `standard` events scheduled |
| Time already past today | that day skipped, later days still scheduled |
| `cancelByCategory('history')` | leaves prayer/jumuah/kahf IDs pending |
| **Dataset integrity** | unique ids; month 1–12; day 1–30; non-empty `summary`/`narrative`/`lesson`; ≥1 source each; valid `dateConfidence` and `tier` |

The dataset-integrity test is what keeps the content honest as it grows past the initial ~50.

**Manual smoke, post-merge:**

1. Launch → card appears if today has an event, strip if not
2. Tap card → detail; back → list; back → home
3. Settings → enable notifications, set the time a minute out → notification fires, tap opens the right detail
4. Change `hijriOffset` → card re-matches immediately
5. Both design styles render correctly
6. Airplane mode → everything still works (fully offline)

---

## Out of scope

- **Hijri subtitle in `LocationDisplay`** — belongs to the 2026-06-04 header plan. This spec builds the utility it needs, nothing more.
- **Quoted Qur'an or hadith text** — blocked on choosing a licensed translation.
- **Arabic-script titles or month names** — possible later toggle.
- **Remote-updatable content** — would be this app's first network dependency; rejected.
- **User-authored or favorited events** — not requested.
- **Extracting `SettingsModal.tsx`** — real and worth doing, but unrelated to this feature.
- **Multi-day observances as ranges** (all of Ramadan, the last ten nights as a block) — modelled as discrete dated entries for now.

---

## Open questions

None. Two decisions were taken as recommendations rather than explicit picks and are flagged here for the review pass:

1. **References only, no quoted scripture** — stricter than the option originally selected, which permitted quotes carrying exact citations.
2. **One card component branching on `designStyle`** rather than the repo's existing per-style component pairs.

Both are cheap to reverse at this stage; say so during spec review if either should flip.

# Reliability fixes — notification races, silent athan errors, DST/timezone

## Spec

Fix three correctness/reliability issues identified in the production-readiness audit. Each fix should be minimal, well-tested, and not introduce architectural changes beyond what the issue requires.

### Issue 1 — Notification scheduling races

**Problem:** `useNotifications.ts` has 4 separate `useEffect` blocks that each call `cancelAllNotifications()` then schedule their own category. Rapid setting changes (e.g. user toggles a setting that triggers multiple effects in quick succession) can cause one effect's cancel to wipe another's freshly-scheduled notifications.

**Fix:**

1. Stop using a global `cancelAllNotifications()` for category-specific re-scheduling. Replace with category-scoped cancellation:
   - Each notification category (Prayer, Jumu'ah, Surah Kahf, Reminder) gets a deterministic ID range.
   - Add a new exported function in `notificationService.ts`: `cancelByCategory(category: NotificationCategory): Promise<void>` that cancels only IDs in that category's range.
   - Keep `cancelAllNotifications()` for the "user disabled all notifications" case but call it only once when needed.

2. Consolidate the 4 `useEffect` blocks in `useNotifications.ts` into a smaller, less race-prone shape:
   - Keep effects separate by category if their dependency arrays are genuinely different (this is OK).
   - But each effect must call ONLY its category's cancel (`cancelByCategory("prayer")` etc.), not the global cancel.
   - Make sure the debounce (currently 300ms) is per-category, not shared across categories.

3. Add a `NotificationCategory` type:
   ```ts
   export type NotificationCategory = "prayer" | "jumuah" | "kahf" | "reminder";
   ```

4. Document the ID ranges in a comment in `notificationService.ts` so future devs don't reuse them. Suggested ranges:
   - prayer:    1–999 (one per prayer per scheduled day)
   - jumuah:    1000–1099
   - kahf:      1100–1199
   - reminder:  1200–1299

5. Add tests in a new file `src/__tests__/notification-races.test.ts` that verify:
   - `cancelByCategory("prayer")` does not cancel jumuah/kahf notifications
   - rescheduling prayers does not affect other categories
   - the deterministic ID range is enforced (an id outside the prayer range is never used by `schedulePrayerNotifications`)

### Issue 2 — Athan download silent failure

**Problem:** In `athanService.ts`, `Filesystem.writeFile` is called outside any `try/catch`. If the write fails (disk full, permission denied), the promise rejects unhandled and the user has no idea why nothing played.

**Fix:**

1. Wrap the `writeFile` call in a `try/catch` that throws a typed error:
   ```ts
   export class AthanDownloadError extends Error {
     constructor(message: string, public readonly cause?: unknown) {
       super(message);
       this.name = "AthanDownloadError";
     }
   }
   ```

2. The error message should be user-displayable: e.g., `"Could not save athan sound. Your device may be out of storage."` for disk-full, generic message otherwise.

3. Update any caller of the affected `athanService` function (likely in `SettingsModal.tsx` or wherever athan downloads are triggered) to catch `AthanDownloadError` and surface it to the user — at minimum a console.error + a non-blocking on-screen message. **If the existing UI has no error-display mechanism, just use `console.error` AND `alert()` for now**; full toast UI is out of scope for this PR.

4. Add a unit test in `src/__tests__/athan-download.test.ts` that mocks `Filesystem.writeFile` to throw, and asserts that the service throws an `AthanDownloadError` with a sensible message rather than a raw rejection.

### Issue 3 — DST and timezone hazards

**Problem:** `prayerService.ts` uses the device's local timezone implicitly. If DST transitions during a prayer window, or the user travels to another timezone, prayer times will be calculated against the wrong offset until something forces a recalculation.

**Fix:**

1. Add a small `getTimezone()` helper using `Intl.DateTimeFormat().resolvedOptions().timeZone`. Use it in `prayerService.ts` to label the calculation explicitly (the `adhan` library already supports passing a timezone to `CalculationParameters` / `Coordinates` indirectly via `Date` arithmetic, so the fix here is mostly about *recalculating when the timezone changes*, not changing the math).

2. Add a hook `useTimezone()` in `src/hooks/useTimezone.ts` that:
   - Returns the current IANA timezone string.
   - Listens for `Capacitor.App.appStateChange` events and re-reads `Intl.DateTimeFormat().resolvedOptions().timeZone` whenever the app comes to the foreground.
   - Also re-checks once per hour via a `setInterval` to catch DST transitions while the app is open.
   - Calls `setTimezone(...)` if it changed, triggering re-renders for any consumer.

3. Wire `useTimezone()` into `usePrayerTimes.ts` so prayer times are recomputed whenever the timezone changes.

4. Add a Date-based test in `src/__tests__/timezone.test.ts` that:
   - Mocks `Intl.DateTimeFormat().resolvedOptions().timeZone` to return two different values across a re-render.
   - Asserts that `usePrayerTimes` recomputes when timezone changes.

### General rules for this PR

- Keep changes minimal. No drive-by refactors. No new dependencies.
- Match the existing code style (formatting, naming, file organization).
- If a test in `src/__tests__/` already covers a similar area, add to it rather than creating a sibling.
- Don't change unrelated files. If you find a real bug while implementing this, leave a `// TODO(audit-followup):` comment instead of fixing it here.

## Files in scope

- src/services/notificationService.ts
- src/services/athanService.ts
- src/services/prayerService.ts
- src/hooks/useNotifications.ts
- src/hooks/usePrayerTimes.ts
- src/hooks/useTimezone.ts
- src/types/index.ts
- src/__tests__/notification-races.test.ts
- src/__tests__/athan-download.test.ts
- src/__tests__/timezone.test.ts

## Files NOT inlined but available on request via QUESTIONS

- src/components/SettingsModal.tsx (1911 lines — ask in QUESTIONS for the athan-download UI section if you need to wire error display there; otherwise just throw the typed error and a future PR will hook it into the UI)
- src/test/setup.ts, src/test/helpers.tsx (vitest helpers if you need to mock Capacitor)
- any other file you need — ask in QUESTIONS

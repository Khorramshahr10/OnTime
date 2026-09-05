# OnTime — Bug & Performance Log

**Audit date:** 2026-09-02
**Scope:** Full platform bug hunt with a deep-dive on the Home Globe (three.js / globe.gl) functionality and its performance.
**Baseline at audit time:** `tsc -b` clean · `vitest` 243/243 passing · ESLint 28 errors + 3 warnings in the main source tree (see §4).

Severity key: **P1** = fix before next release · **P2** = should fix soon · **P3** = polish / nice-to-have.

> **Fix passes (2026-09-02, same day):**
> 1. Globe pass — G-1, G-2, G-4, G-6 (scratch vectors), C-1, C-2, C-3, C-4 and the §3/§4 hygiene items fixed.
> 2. Platform pass — §5 findings A-1…A-7, A-9…A-13 fixed (12 of 13), including new regression tests for the polar-latitude NaN bug (246 tests total).
>
> Final baseline: `tsc` clean · 246/246 tests pass · lint 19 errors + 1 warning, all rule-friction categories from the §4 table, no runtime bugs.
> **Still open:** G-3 and G-5 (larger refactors, need approval) · A-8 (needs your audio decision) · G-6 remainder (cloud-alpha worker, bundled moon texture) · the "suspicious" list at the end of §5.

---

## 1. Globe performance (headline findings)

### G-1 — `HomeGlobe.update()` rebuilds the entire scene at compass rate in ground view — **P1** — ✅ FIXED

*Fix:* `update()` now fingerprints `now|lat|lng|prayers` (`computeApplyKey`) and skips `applyData()` unless one of them changed — compass events only drive `updateGroundView()`. `useQibla` additionally coalesces sensor events to one `setState` per animation frame, capping React re-renders at display rate.

**Files:** `src/components/three/homeGlobe.ts` (`update()`, `applyData()`, `rebuildPrayerLines()`), `src/components/three/Scenes.tsx`, `src/components/HomeGlobeScreen.tsx`, `src/hooks/useQibla.ts`

The update pipeline fires once per compass event (~50–60 Hz on device):

1. `useQibla` calls `setData(...)` on every native compass/motion event — no throttling or coalescing.
2. Every state change re-renders `HomeGlobeScreen`, which builds a fresh `data={{...}}` object each render.
3. `SceneHost`'s `useEffect(..., [data])` calls `view.update(data)` on every identity change.
4. `HomeGlobe.update()` unconditionally runs `applyData()` → `rebuildPrayerLines()`, which every call:
   - disposes and recreates **4 line geometries** (3 × 129-point circles + a 65-point meridian) and re-uploads them to the GPU,
   - rasterises **6 canvas label sprites** (one per prayer) and uploads 6 new textures,
   - recomputes `subSolarPoint()` **and `subLunarPoint()`** — the Meeus lunar series is ~200 trig terms — even though `data.now` only changes once per minute,
   - …despite `prayerLinesGroup` being **hidden** (`visible = false`) for the whole duration of ground view.

**Failure scenario:** ground (qibla) view on a phone drops frames, runs hot, and drains battery — the single most performance-critical screen does tens of thousands of wasted GPU uploads per minute of use.

**Fix direction:** in `update()`, run `applyData()` only when `now`/`lat`/`lng`/`prayers` actually changed (cheap field compare); keep ground-view updates limited to `updateGroundView()`. Additionally throttle/coalesce compass events in `useQibla` to the animation frame (e.g. store latest event, flush in `requestAnimationFrame`).

### G-2 — Globe fully re-applies every second in normal (orbit) view — **P1** — ✅ FIXED

*Fix:* same `applyKey` gate — the per-second countdown re-renders now reach `update()` but no longer trigger the scene reapply; it runs once per minute (when `now` changes) or on location/prayer changes.

**Files:** `src/hooks/usePrayerTimes.ts`, `src/App.tsx`, `src/components/HomeGlobeScreen.tsx`, `src/components/three/homeGlobe.ts`

`usePrayerTimes` runs a 1-second `setInterval` updating the countdown → `App` re-renders every second → `HomeGlobeScreen` (not memoised) re-renders → new `data` object → `HomeGlobe.update()` → full `applyData()` + `rebuildPrayerLines()` **every second**, even though nothing visually changes between minute ticks. The scene was designed around a per-minute cadence (see the minute-aligned `now` tick in `HomeGlobeScreen`); the per-second countdown silently defeats it.

**Failure scenario:** constant background CPU/GPU churn on the home screen — wasted battery, and the moon's ephemeris is recomputed 60× more often than its input changes.

**Fix direction:** memoise `HomeGlobeScreen` (props rarely change), and/or gate `applyData()` behind real input changes as in G-1. Long-term: move the countdown state below `App` so the whole tree doesn't re-render every second.

### G-3 — Opening any overlay unmounts and re-creates the globe — **P2** — ⏸ NOT FIXED (needs design decision)

*Mitigated indirectly:* with G-1/G-2 fixed the globe is cheap while idle, but a remount still re-downloads all tiles/imagery. Keeping it mounted under overlays is a z-index/pointer-events refactor — flag for approval before doing it.

**File:** `src/App.tsx` (`showGlobeLayer = isGlobeHome && !isQiblaOpen && !isDashboardOpen && !isSettingsOpen`)

Opening Settings, Qibla, or the Dashboard unmounts `HomeGlobeScreen`; closing it remounts and re-runs the entire globe init: Esri surface tiles re-download, the GIBS earth image is re-read from disk and re-processed (`extractCloudAlpha`, a synchronous 2048×1024 pixel loop), the moon texture re-downloads from `threejs.org` (not cached locally), and OWM cloud tiles re-fetch. Toggling in and out of settings churns network + GPU memory each time.

**Fix direction:** keep the globe mounted and cover it with the overlays (it already idles paused when idle/off-screen), or hide it with CSS instead of unmounting.

### G-4 — GPU resources leaked on dispose / per refresh — **P2** — ✅ FIXED

*Fix:* `dispose()` now releases every object `buildExtras()` creates (starfield, night shade, sun/moon + halos, pin, GIBS shell), the cloud patches' geometries **and** materials, the loaded moon texture, and the placeholder texture. The ground group goes through `clearGroundLine()` (which traverses) so the Kaaba model's meshes/materials are freed too. `emptyTexture()` returns one shared placeholder instead of one per patch, and the GIBS swap no longer disposes it. The qiblaGlobe `surveyRing` material leak is fixed as well (`clearRouteGroup` now disposes ring-owned materials).

**File:** `src/components/three/homeGlobe.ts`

- `dispose()` disposes cloud **textures** but never the cloud patch meshes' geometries or `ShaderMaterial`s.
- `dispose()` never explicitly disposes: starfield, night-shade sphere, sun + halo, moon + halo (+ its loaded texture), pin sprite, GIBS cloud shell geometry/materials — it relies on globe.gl's internal `_destructor`/context loss.
- `emptyTexture()` allocates a fresh 1×1 `DataTexture` for every cloud patch and for the moon/GIBS placeholders; the placeholder is replaced without `dispose()`.
- Each mount/unmount cycle (see G-3) therefore accumulates GPU allocations.

**Also:** `src/components/three/qiblaGlobe.ts` — `surveyRing()` creates a new `MeshBasicMaterial` per ring, and `clearRouteGroup()` disposes geometries and sprite materials but not those ring materials (2 leaked materials per route rebuild: theme change, location change).

**Fix direction:** walk `scene()` in `dispose()` and dispose every geometry/material/texture the class owns (Base3D already does exactly this traversal for the other views); reuse a shared placeholder texture instead of one per patch.

### G-5 — Base3D views (SunDome, QiblaGlobe, KaabaMini) never idle-pause — **P2** — ⏸ NOT FIXED (needs design)

Note: KaabaMini auto-rotates and SunDome pulses its halo by design, so a blanket idle-pause isn't right; the sensible version is per-view (pause QiblaGlobe once settled with no compass, pause SunDome when nothing animates). Needs a small state machine in `base3d.ts` — flag for approval.

**File:** `src/components/three/base3d.ts`

`HomeGlobe` pauses its render loop when idle, off-screen, or hidden — the Base3D views only pause when off-screen or the tab is hidden. While any card is visible they render every frame forever: `SunDome` runs `recedeFarSide()` + `separateLabels()` per frame (allocating several `new THREE.Vector3()` per sprite per frame), `KaabaMini` auto-rotates, `QiblaGlobe` keeps rendering after damping settles.

**Failure scenario:** an always-on rAF + full render pass while the home screen sits still — battery drain on the exact screen users leave open.

**Fix direction:** give Base3D the same idle-pause machinery (resume on pointer interaction / data change), or at minimum pause `QiblaGlobe` once controls settle and there is no compass driving it.

### G-6 — Minor globe performance notes — **P3** — ✅ scratch vectors fixed, rest open

- ✅ `applyGroundOrientation()` now reuses five scratch vectors (no per-call allocations at compass rate); `updateGroundView()` also stopped allocating via `v3(getCoords(...))`.
- ⏸ `extractCloudAlpha()` (cloudImagery.ts) is a synchronous 2-megapixel main-thread loop — one visible hitch per day at startup; move to `OffscreenCanvas`/worker or downscale first.
- ⏸ The moon surface texture is fetched at runtime from `https://threejs.org/...` — an external runtime dependency that fails silently offline (Capacitor). Bundle it or cache it.
- ⏸ `updateZoomFades()` is not called while a `pointOfView()` fly animation runs, so the pin size/cloud fade only update after the next zoom event — cosmetic.

---

## 2. Globe & compass correctness bugs

### C-1 — Tap-to-zoom hits the moon *through* the Earth — **P3** — ✅ FIXED

**File:** `src/components/three/homeGlobe.ts` (`handleTap()`)

`raycaster.intersectObject(this.moon)` doesn't test whether the globe occludes the moon, so tapping the Earth's surface where the moon is behind it triggers the moon fly-in.

*Fix:* `handleTap()` now intersects the ray against the radius-100 surface sphere analytically (`Ray.intersectSphere`, no globe.gl API dependency) and ignores the moon hit when the surface is nearer.

### C-2 — `useQibla`: stale declination + listener double-registration race — **P2** — ✅ FIXED

*Fix:* the hook now guards with `startingRef`/`listeningRef` refs (no async race), tears down and re-registers when `startListening` is called while active (fresh magnetic declination + fresh qibla closure on location change), keeps the iOS `Motion` listener handle for targeted removal instead of `removeAllListeners()`, and cancels its pending rAF on unmount.

**File:** `src/hooks/useQibla.ts`

- Android: `startCompass({ latitude, longitude })` is called once with the location at start. If the user's location updates while listening, the effect re-runs but `startListening()` early-returns on `isListening` — the native magnetic-declination correction stays stale, and the listener closure keeps emitting a stale `qiblaDirection` in its payload.
- Race: `startListening` checks `isListening`, then awaits async listener registration before `setIsListening(true)`. Two overlapping calls (e.g. deps churn) can register **two** native listeners; `cleanupRef` is overwritten, so the first one is never removed and keeps firing `setData`. Same shape on iOS (`Motion.addListener`).
- iOS cleanup uses `Motion.removeAllListeners()` — removes every Motion listener app-wide, not just this hook's (coarse; will break any future second consumer of Motion).

**Fix direction:** stop-then-restart when deps change (or update the native declination without re-registering), guard with an `isStartingRef`, and keep the returned handle for targeted removal.

### C-3 — SunDome "next prayer" highlight goes stale — **P3** — ✅ FIXED

**File:** `src/components/three/sunDome.ts` (`rebuildDay()`)

The rebuild key is `latitude|solarNoon|marks…` and deliberately excludes `now`, but the `isNext` accent colour is baked from `now` at build time. When the current time passes a prayer mark, the accent stays on the passed prayer until the next date/location/theme change.

*Fix:* `nextIndex` is computed before the key and included in it, so crossing a prayer time triggers exactly one rebuild with the new accent.

### C-4 — `smoothRot` ref mutated during render — **P3** — ✅ FIXED

**Files:** `src/components/HomeGlobeScreen.tsx` (lines ~70–75), flagged by `react-hooks/refs`

The heading smoothing writes `smoothRot.current` in the render body — impure under React 19 / StrictMode double-render and breaks the new compiler lint rules.

*Fix:* smoothing moved into a `useEffect` on `[groundMode, accuracy, deviceHeading, qiblaDirection]`; the display value is state with a same-value bailout so no extra render fires. `Scenes.tsx`'s `onViewRef.current = onView` render-write got the same treatment. Both `react-hooks/refs` errors are gone.

---

## 3. Baseline health (typecheck / tests / lint / hygiene)

- ✅ `tsc -b` — clean.
- ✅ `vitest` — 27 files, 243 tests, all passing.
- ⚠️ Two modified test files are uncommitted (`src/__tests__/cloud-imagery.test.ts`, `src/__tests__/design-switching.test.tsx`) — they pass; commit or drop them deliberately.
- ⚠️ Untracked working files at repo root to tidy: `athan-audio/`, `docs/qwen-task-log.jsonl`, `docs/qwen-workflow.md`, `scripts/qwen-worker.mjs`, `taskbaricon.png`.

### Hygiene — **P2** — ✅ ESLint side fixed; worktree dirs still on disk

- ✅ **Leftover git worktrees:** `.worktrees/feature/hijri-date-header/` and `.worktrees/home-globe-view/` were being walked by ESLint (inflating raw lint output from 31 to 78 problems and making babel deoptimise `cities.ts` three times). `eslint.config.js` now ignores `.worktrees/` (and `android/`, `ios/`). ⏸ The directories themselves still exist on disk (git-ignored) — delete them once you've confirmed no unmerged work lives in them.
- ✅ **`android/app/build/`** (generated `native-bridge.js`) is no longer linted.
- (`postinstall: patch-package` checked and fine — `patches/three-slippy-map-globe+1.0.6.patch` targets a real transitive dep of `globe.gl` that is present in `node_modules`.)

---

## 4. ESLint findings (main source tree — was 28 errors + 3 warnings, now **19 errors + 1 warning**)

Most are lint-rule friction rather than runtime bugs, but the groups marked ⚠️ overlap with real issues:

| Count | Rule | Where | Notes |
|---|---|---|---|
| 8 | `react-refresh/only-export-components` | context files, `src/test/helpers.tsx` | Fast-refresh breakage only; split non-component exports if you care about HMR. |
| 6 | `react-hooks/immutability` | tests + `LocationContext.tsx:32` + `ThemeContext.tsx:68` | Mostly compiler-lint false positives (hoisted function declarations). |
| ~~5~~ 0 | `react-hooks/refs` | `HomeGlobeScreen.tsx`, `Scenes.tsx` | ✅ Fixed with **C-4**. |
| 5 | `react-hooks/set-state-in-effect` | `usePrayerTimes.ts:27`, `TravelContext.tsx:131`, `PrayerTable.tsx:396`, `IslamicPrayerTable.tsx:380`, `NotificationPermissionDialog.tsx:50` | ⚠️ Cascading-render patterns; the `usePrayerTimes` one forces a `new Date()` re-render on every timezone change — review whether each is derivable without an effect. (Left for the follow-up pass — several sit in files also under review in §5.) |
| ~~3~~ 0 | `@typescript-eslint/no-unused-vars` | two test files | ✅ Dead imports removed. |
| 1 | `react-hooks/exhaustive-deps` | `LocationContext.tsx:33` | Warning. `initializeLocation` missing from deps (benign today — runs once). |
| ~~1~~ 0 | `prefer-const` | `earthTiles.ts:129` | ✅ Fixed. |

---

## 5. Platform-wide bug hunt

Full review of App.tsx, all contexts, all hooks, services (prayer/notification/tracking/athan), utils and non-globe components, cross-checked against the `adhan` library and verified with runtime checks. **Fix pass applied same day** — statuses inline.

### A-1 — Polar latitudes: countdown stuck at `NaN:NaN:NaN`, rows show "Invalid Date" — **High** — ✅ FIXED

**Files:** `src/services/prayerService.ts`, rendering via PrayerTable/IslamicPrayerTable/CountdownTimer

Verified against `adhan` directly: at Tromsø (69.6°N) on 2026-06-21, fajr/sunrise/maghrib/isha come back as **Invalid Date** while `nextPrayer()` still returns `maghrib`. `getTimeUntil` then produced NaN fields (`NaN <= 0` is false, so the countdown could never reset) and the table printed "Invalid Date" four times. Same class of failure in polar winter.

*Fix:* `calculatePrayerTimes` now validates every candidate — current/next are resolved only against prayers with real times, falling back to the first *valid* prayer of tomorrow when needed (and accepting adhan's answer only if it's also in the future — while verifying this, a test caught that adhan wraps to today's already-passed Fajr after Isha). `getTimeUntil` guards non-finite diffs; `formatTime` renders `—` for invalid times. Regression tests added in `prayer-times-edge-cases.test.ts` (polar summer + winter + invalid-date guards).

### A-2 — CitySearch: popular "Medina" resolved to Medina, Ohio; "Mecca" unfindable — **High** — ✅ FIXED

**Files:** `src/components/CitySearch.tsx`, `src/data/cities.ts`

Popular cities resolve by exact name against GeoNames spellings: the dataset has `Makkah`/`Madinah`/`New York City`, so "Mecca" returned nothing, and "Medina" silently matched Medina, Ohio (first `find` hit) — prayer times ~10h off Makkah.

*Fix:* popular list now points at the dataset names, plus a small query-alias map (`mecca→makkah`, `medina→madinah`, `new york→new york city`) so common English spellings work in search too.

### A-3 — Qibla compass ran from app launch, never stopped — **High** — ✅ FIXED

**Files:** `src/hooks/useQiblaHeading.ts`, `src/components/QiblaCompass.tsx`, `src/hooks/useQibla.ts`

QiblaCompass stays mounted for the app's lifetime and its effect started the magnetometer unconditionally — sensor (and a re-render per tick) ran even if the qibla screen was never opened. The cleanup also captured a stale `stopListening` closure whose `isListening` guard made it a no-op.

*Fix:* `useQiblaHeading(enabled)` gates the sensor on `isOpen`. The stale-cleanup half was already cured by the C-2 rewrite of `useQibla` (ref-based teardown instead of closure state).

### A-4 — Travel notification (id 900) cancelled by prayer rescheduling before it fired — **Medium** — ✅ FIXED

**Files:** `src/App.tsx`, `src/services/notificationService.ts`

Id 900 sits inside the documented prayer range (1–999); a location change triggers prayer rescheduling (~300ms debounce) which cancels the whole range, wiping the travel prompt scheduled at +500ms in almost every real case.

*Fix:* travel prompt moved to id 1300, outside every category range; the ID-range comment block in `notificationService.ts` documents it.

### A-5 — Master notifications toggle off→on killed Jumu'ah + Surah Kahf until restart — **Medium** — ✅ FIXED

**Files:** `src/hooks/useNotifications.ts`

Disabling cancels **all** pending notifications; re-enabling only re-ran the prayer schedule because the jumuah/kahf effects depend on their own settings objects, which don't change identity on a master-toggle flip.

*Fix:* the jumuah/kahf effects now also depend on `settings.notifications.enabled` (and skip while disabled), so flipping the master switch back on resurrects them. The prayer effect is gated only on the onboarding flag (see A-9) — it must still run while disabled, because `scheduleNotifications` is what performs the cancel-all.

### A-6 — Prayer-tracking day keys used UTC — wrong-day checkmarks east of UTC — **Medium** — ✅ FIXED

**Files:** `src/services/prayerTrackingService.ts`

`toISOString().split('T')[0]` yields the UTC calendar date; between local midnight and the UTC-offset hour, "today" computed as yesterday (Karachi until 5 AM, Riyadh until 3 AM…), filing last night's Isha under yesterday and showing a ✓ on today's pre-prayer rows.

*Fix:* `getTodayKey`/`getDateKey` build the key from local `getFullYear/getMonth/getDate`. (`TravelContext.travelStartDate` has the same UTC slip — lower impact, still open.)

### A-7 — Jama' (combined prayer) tracking race lost one of the two records — **Medium** — ✅ FIXED

**Files:** `src/components/PrayerTable.tsx`, `src/components/IslamicPrayerTable.tsx`

The combined row fired two unserialized `trackPrayer` calls (each load→mutate→save); both loads resolved from the same snapshot and the second save overwrote the first.

*Fix:* the two writes are now awaited sequentially.

### A-8 — Built-in athan & "Silent" notification sounds don't exist on either platform — **Medium** — ⏸ NOT FIXED (needs your decision)

**Files:** `src/services/notificationService.ts` (`BUILT_IN_SOUNDS`: `adhan.wav`, `adhan_fajr.wav`, `silent.wav`), `android/app/src/main/res/raw/` (verified **empty**)

Capacitor falls back to the system default sound when the resource is missing — so "Adhan (Built-in)" plays the generic tone and "Silent" still makes noise. The repo's `athan-audio/` folder holds four MP3 athans (Abdul-Basit, Al-Aqsa, Makkah, Naghshbandi) but nothing named/mapped for these slots, and no `silent` track.

*Decision needed:* which file maps to `adhan` vs `adhan_fajr`, and whether to generate + ship a true `silent.wav` (Android `res/raw` + iOS bundle), or drop those options from the picker until assets exist.

### A-9 — Notification permission prompt fired 300ms after launch, before onboarding — **Medium** — ✅ FIXED

**Files:** `src/hooks/useNotifications.ts`, `src/App.tsx`

`useNotifications()` ran unconditionally on first render; 300ms later `scheduleNotifications` called `requestNotificationPermission()` — an unexplained OS dialog over the welcome screen, after which the onboarding notification step was pointless.

*Fix:* `useNotifications(enabled)` — App passes `showOnboarding === false`, so nothing schedules (and no prompt fires) until onboarding is done.

### A-10 — Surah Kahf enabled on a Friday missed the Friday already in progress — **Low** — ✅ FIXED

**File:** `src/services/notificationService.ts`

`(4 - now.getDay() + 7) % 7` yields 6 on Friday, jumping to next Thursday, while the Kahf window (Thursday Maghrib → Friday Maghrib) was live. *Fix:* on Fridays anchor to the previous day's Thursday; past notifications in the window are already filtered by the `> now` guards.

### A-11 — "Separate Fajr Athan" toggle initialized from not-yet-loaded settings — **Low** — ✅ FIXED

**File:** `src/components/SettingsModal.tsx`

SettingsModal mounts at app start while persisted settings are still loading, so the toggle's `useState` initializer captured defaults and showed OFF despite a configured Fajr athan. *Fix:* an effect resyncs the toggle from `settings.athan.selectedFajrAthanId/selectedAthanId` whenever they change.

### A-12 — Suspense fallbacks used undefined CSS variable `--color-bg` — **Low** — ✅ FIXED

**File:** `src/App.tsx` — three lazy-modal fallback overlays had transparent backgrounds; now `var(--color-background)`.

### A-13 — Prayer-table checkmarks went stale across midnight — **Low** — ✅ FIXED

**Files:** `src/components/PrayerTable.tsx`, `src/components/IslamicPrayerTable.tsx`

Tracking status loaded once at mount (`[]` deps) while the component stays memoized; after local midnight the new day's rows showed yesterday's marks. *Fix:* the load effect depends on `prayers` (identity changes on the day rollover and on location/method changes).

### Suspicious but unconfirmed (not fixed — review if you touch these areas)

- `isPassed` in prayer rows is computed from `new Date()` at render; rows are memoized, so "passed" state can lag until the next forced re-render.
- iOS fallback heading (`(360 - alpha) % 360` in `useQibla`) is not true-north-referenced on all devices — accuracy is marked 1, but the bearing could be meaningfully off on that path.
- ThemeContext updates only the first `meta[name=theme-color]`; index.html has two (light/dark variants), so browser chrome color can disagree with the theme.
- `CapApp.minimizeApp()` (web back-button path), `selectAthan`/`deleteChannel` onClick handlers have no `.catch` — unhandled rejections in plain browsers.
- Jumu'ah notification ids collide if a user adds ≥10 times (id formula overlaps across weeks) — unrealistic in practice.
- `window.open('geo:...')` does nothing in desktop browsers.
- TravelContext `maxTravelDays` expiry is evaluated in a `useMemo` keyed on settings/location, so pure passage of time mid-session won't trigger it.
- CitySearch early-exit at 100 combined matches can drop later startsWith matches when "contains" matches fill the quota first (search-quality only; results are population-sorted).

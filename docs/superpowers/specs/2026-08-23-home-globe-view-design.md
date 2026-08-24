# Full-Page Home Globe View — Design Spec

**Date:** 2026-08-23
**Status:** Approved — ready for implementation plan
**Scope:** Let the user choose, at onboarding (and later in Settings), between two home screens: the existing prayer **List** or a new full-page, immersive **Globe** — starfield, a real-time day/night earth, and live cloud cover from NASA satellite imagery. Supersedes the small "Today's Sky" dome card, which currently sits awkwardly above the prayer list on every launch.
**Visual reference:** a high-fidelity mockup with a live theme switcher and a HUD-treatment comparison — [Home Globe View](https://claude.ai/code/artifact/2bf49be7-f4bb-44fe-a862-65920ab10820) — informed the header/HUD chrome decision below.

---

## Goal

Today, `SunDomeCard` (a small 3D dome) and the prayer list (`PrayerTable`/`IslamicPrayerTable`) are stacked on the same dashboard screen (`App.tsx:238`, `288-300`). The user wants these separated into two distinct home-screen experiences, chosen once at onboarding and switchable anytime after:

- **List home** — today's dashboard, completely unchanged.
- **Globe home** — a full-bleed 3D scene behind the header: stars, a rotating earth with real coastlines, a live day/night terminator, and a translucent cloud layer refreshed from real satellite data. The current/next prayer countdown floats on top as a HUD; there is no scrollable prayer list in this mode (List is one tap away via a header toggle).

---

## Decisions

| Decision | Choice |
|---|---|
| Onboarding placement | New `'homeView'` step in `OnboardingScreen`, shown right before onboarding completes (after location resolves/skips, before `onComplete`) |
| Settings field | `homeView: 'globe' \| 'list'`, top-level on `Settings` (parallel to `designStyle`), default `'list'` |
| Switching after onboarding | Persistent header icon toggle (next to the existing Qibla/Dashboard buttons) + the same choice exposed in `SettingsModal` |
| Globe layout | Full-bleed background layer (same z-index pattern as the existing `GirihBackground`), with the **existing** header and countdown components rendered on top, given a **glow** style variant only in Globe mode: no card background/border, just light-on-dark text with a soft drop shadow for legibility over the scene. No new HUD components — same `CountdownTimer`/`IslamicCountdownTimer`, just a boxless style variant. Chosen over a frosted-glass alternative after comparing both in the design mockup (see Visual reference) — glow reads as more immersive/cinematic and was preferred |
| List mode | Completely unchanged — `SunDomeCard` + `PrayerTable` stay exactly as they are today. Removing `SunDomeCard` from List mode is explicitly out of scope (see below). |
| Earth base map | Reuses `buildEarthTexture()` from `earthTexture.ts` — same theme-tinted coastline texture already used by `QiblaGlobe` |
| Day/night terminator | New `subSolarPoint(date)` pure function in `solarGeometry.ts`; a custom shader blends the day texture toward a **fixed, theme-independent** dark/cool tone on the night side (not a flat brightness multiply — see Component Design) |
| Cloud data source | **Revised after hands-on verification** (see below) — NASA GIBS' `VIIRS_SNPP_CorrectedReflectance_TrueColor` layer (a real photographic mosaic), with clouds extracted client-side via an HSV brightness/saturation heuristic — **not** a GIBS "cloud fraction" layer as originally assumed (verified to be a discrete scientific color-palette product, not a grayscale mask — see Verified facts) |
| Cloud caching | `@capacitor/filesystem` (already a dependency) caches the raw fetched JPEG (~150KB at 1024×512) on disk; `@capacitor/preferences` stores only the small `{date, path}` metadata. The HSV cloud-extraction pass is cheap and re-run from the cached JPEG each time `HomeGlobe` builds — no separate processed-texture cache needed |
| Cloud fallback chain | fresh fetch → same-day cached file → any-age cached file → procedural animated cloud shader (fully offline-safe) |
| Network fallback | Try `fetch()` first; verified GIBS sends `access-control-allow-origin: *`, so a plain `fetch()` should succeed from the WebView. Keep Capacitor's native HTTP bridge (`@capacitor/core`'s `CapacitorHttp`) as a defensive one-retry fallback for WebView-specific quirks (e.g. mixed-content policy) rather than an expected necessity |
| WebGL exclusivity | `HomeGlobeScreen` is unmounted whenever the Qibla/Dashboard/Settings modal is open — the same rule `SunDomeCard` already follows at `App.tsx:238`, and for the same reason (no hidden live GL context under a modal) |
| Header/HUD chrome in Globe mode | Fixed light-on-dark styling (translucent dark/frosted glass, near-white text) regardless of the user's chosen app theme — the backdrop is always a dark starfield, so theme-driven chrome (e.g. a light theme's dark-on-light header) would be unreadable over it. Only the accent color (toggle active state, seconds digit) still follows the theme's `primary`, so Globe mode still feels like *this* app in *this* theme, not a generic space screen. Validated visually via a Claude Design mockup with a live theme switcher (see below) |
| New dependencies | None — `@capacitor/filesystem` is already installed; no weather/imagery npm package needed |

---

## Architecture

### Files

**New (5):**

- `src/components/three/homeGlobe.ts` — `HomeGlobe extends Base3D<HomeGlobeData>`: starfield, earth sphere, day/night shader, cloud shell
- `src/components/HomeGlobeScreen.tsx` — full-bleed React host; lazy-loads the 3D view, feeds it live data, positions it as a background layer
- `src/services/cloudImagery.ts` — fetch/cache/fallback-chain logic for the cloud texture (pure-ish, no three.js, testable like `solarGeometry.ts`)
- `src/__tests__/cloud-imagery.test.ts` — cache/fallback-chain unit tests
- `src/__tests__/home-view-settings.test.ts` — `homeView` default/persistence/migration tests (extends the pattern in `settings-persistence.test.tsx`)

**Modified (6):**

- `src/types/index.ts` — add `homeView: 'globe' | 'list'` to `Settings`
- `src/context/SettingsContext.tsx` — `defaultSettings.homeView = 'list'`, merge line in `loadSettings`, new `updateHomeView` callback
- `src/components/OnboardingScreen.tsx` — new `'homeView'` step; reroute the 4 existing `onComplete`/`setTimeout(onComplete, …)` call sites to advance to it instead
- `src/components/three/Scenes.tsx` — add `HomeGlobeView` export following the exact `QiblaGlobeView` pattern
- `src/components/SettingsModal.tsx` — add a Globe/List picker near the existing `designStyle` control
- `src/App.tsx` — render `HomeGlobeScreen` as a full-bleed background layer when `homeView === 'globe'`; skip `SunDomeCard`+prayer table in that mode; add the header toggle button; make the header and countdown float (transparent) only in Globe mode
- `src/services/solarGeometry.ts` — add `subSolarPoint(date: Date): { latitude: number; longitude: number }`
- `src/__tests__/solar-geometry.test.ts` — add cases for `subSolarPoint`

### Dependency graph

```
SettingsContext (homeView)
        │
        ▼
   App.tsx ──────────────┬─────────────────────────┐
        │                │                         │
        ▼                ▼                         ▼
OnboardingScreen   HomeGlobeScreen           (header/countdown
 (homeView step)         │                    transparent style
                         ▼                    only in Globe mode)
                  Scenes.tsx: HomeGlobeView
                         │
                         ▼
                  homeGlobe.ts: HomeGlobe extends Base3D
                    │        │              │
                    ▼        ▼              ▼
            earthTexture  solarGeometry  cloudImagery.ts
            .buildEarthTexture  .subSolarPoint   │
                                                  ▼
                                    @capacitor/filesystem + Preferences
                                                  │
                                                  ▼
                                          NASA GIBS (fetch, CapacitorHttp fallback)
```

No circular dependencies. `cloudImagery.ts` and the `subSolarPoint` addition are pure/async logic with no three.js or React import, so both test in isolation — matching how `solarGeometry.ts` already works.

---

## Component design

### `src/services/solarGeometry.ts` — `subSolarPoint`

```ts
/**
 * The lat/lon currently directly under the sun. Ignores the equation of
 * time (±16 min real-world skew) — invisible on a globe this size, and it
 * keeps the function a one-liner off the UTC clock.
 */
export function subSolarPoint(date: Date): { latitude: number; longitude: number } {
  const latitude = solarDeclination(date);
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const longitude = normalizeLongitude(-(utcHours - 12) * 15);
  return { latitude, longitude };
}

function normalizeLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
```

Feeds `latLonToVec3(latitude, longitude)` — the same helper `QiblaGlobe` already uses to place markers — so the sun direction lands in the identical frame `buildEarthTexture`'s UV mapping expects. That alignment is already proven correct in production: it's how `QiblaGlobe`'s home/Kaaba markers land on the right visible coastline today.

### `src/components/three/homeGlobe.ts` — `HomeGlobe`

```ts
export interface HomeGlobeData {
  latitude: number | null;
  longitude: number | null;
  now: Date;
}

export class HomeGlobe extends Base3D<HomeGlobeData> {
  protected build(): void {
    this.buildStarfield();       // large inward-facing point cloud, generated once, no network
    this.buildEarth();           // sphere + buildEarthTexture(), day/night ShaderMaterial
    this.buildCloudShell();      // sphere at ~1.01x radius, transparent, texture filled in async
    this.camera.position.set(0, 0.1, 3.2);
  }

  protected configureControls(): void {
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.15; // slow ambient drift, not the qibla globe's compass-driven spin
  }

  protected tick(): void {
    this.updateSunDirection();   // recompute local-space sun vector from subSolarPoint(this.data.now)
  }

  protected onData(): void {
    this.refreshCloudsIfStale(); // triggers cloudImagery fetch/cache chain, swaps texture in when ready
  }
}
```

**Day/night shading:** one `ShaderMaterial` on the earth sphere, sampling the same `buildEarthTexture()` output. Fragment shader computes `dot(normal, sunDirection)`; day side renders the texture as-is, night side blends toward a **fixed** deep navy (`#0a1020`-ish), not a scaled-down version of the active theme's colors. This is a deliberate deviation from `QiblaGlobe`'s flat-shading comment ("reads the same all over rather than falling into shadow") — that globe is a functional compass tool where uniform lighting matters more than realism; this one is the ambient/immersive home view where day/night *is* the point. Using a fixed night tone (rather than darkening the theme's own land/ocean colors) avoids the light-theme failure mode where a dimmed near-white map would just look like gray mud.

**Cloud shell:** a second sphere, radius ~1.01x the earth, `MeshBasicMaterial({ transparent: true, map: cloudTexture })`, pinned to the same rotation as the earth (no independent drift — cloud position is real data, not decoration). Texture starts fully transparent (alpha 0) and fades in once `cloudImagery.ts` resolves, so the globe never blocks on network.

**Starfield:** a static `THREE.Points` cloud, few thousand points, generated once at `build()` time from random directions at a large radius — no network, cheap.

### `src/services/cloudImagery.ts`

**Verified facts** (checked by hand against the live GIBS service, 2026-08-23): a GIBS `Cloud_Fraction` product exists but renders as a discrete scientific color palette (purple/red/blue/green bins), not a grayscale mask — unsuitable for a simple luminance→alpha conversion. Instead this uses the **TrueColor photographic mosaic**, extracting clouds client-side:

- **Endpoint** (confirmed working, returns `200` + `image/jpeg` + `access-control-allow-origin: *`):
  `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&STYLES=&FORMAT=image/jpeg&HEIGHT=512&WIDTH=1024&SRS=EPSG:4326&BBOX=-180,-90,180,90&TIME=<YYYY-MM-DD>`
- **Date**: the `/best/` path segment is GIBS' "best available" virtual layer — it auto-resolves gaps, so requesting the current UTC date works directly (verified both `TIME=<today>` and `TIME=<yesterday>` return complete `200` responses); no artificial staleness offset needed.
- **Size**: `image/jpeg` at 1024×512 measured ~150KB (vs. ~1.1MB for the same request as `image/png`) — small enough to fetch daily on mobile data and cache without a size concern.
- **Known limitation**: the daily TrueColor mosaic can have a visible swath/compositing gap (a dark wedge where satellite passes didn't overlap) depending on the date. The extraction heuristic below treats a dark gap as "no cloud detected" there — a graceful, non-crashing degradation, not a bug to engineer around. Documented as an accepted minor visual imperfection (this is a decorative feature, not a forecasting tool).

```ts
export interface CloudImageResult {
  jpegBlob: Blob | null;   // raw cached/fetched photo; null only when source is 'procedural'
  date: string;            // YYYY-MM-DD (UTC) of the imagery
  source: 'fresh' | 'cached' | 'procedural';
}

export async function getCloudImagery(now: Date): Promise<CloudImageResult>

/** Extracts a white-RGBA cloud mask from a TrueColor photo via HSV thresholding. */
export function extractCloudAlpha(image: HTMLImageElement): HTMLCanvasElement
```

**Fallback chain**, in order:
1. Cached file dated today (UTC) → return it (`source: 'cached'`).
2. Fetch today's GIBS TrueColor mosaic (`fetch()`, falling back to `CapacitorHttp` on failure) → cache the raw JPEG via `Filesystem.writeFile` (`Directory.Cache`) → store `{date, path}` in `Preferences` → return (`source: 'fresh'`).
3. Fetch fails (offline, CORS, GIBS down) → return any cached file regardless of age (`source: 'cached'`).
4. No cache exists at all (first launch, offline) → return `{jpegBlob: null, source: 'procedural'}`, telling `HomeGlobe` to render the procedural animated cloud shader instead.

**`extractCloudAlpha` algorithm** (verified visually against a real GIBS photo — the extracted mask closely tracked the actual cloud swirls): for each pixel, convert RGB to HSV and compute
`cloudScore = clamp01(max(0, v - 0.55) * max(0, 0.35 - s) * 12)` — bright, low-saturation pixels (clouds) score near 1; darker or more-saturated pixels (ocean, land, vegetation) score near 0. Output a same-size canvas painted white with alpha = `cloudScore * 255`. This runs once per fresh/cached JPEG load (cheap — a single canvas pixel pass), not cached separately; `HomeGlobe` calls it each time it builds the cloud shell.

### `src/components/HomeGlobeScreen.tsx`

Mirrors `SunDomeCard.tsx`'s data-prep pattern (per-minute `now` tick, lazy `three/Scenes` import) but renders full-bleed instead of inside a card:

```tsx
const HomeGlobeView = lazy(() =>
  import('./three/Scenes').then((m) => ({ default: m.HomeGlobeView }))
);

export function HomeGlobeScreen() {
  const { location } = useLocation();
  const [now, setNow] = useState(() => new Date());
  // same per-minute scheduling as SunDomeCard

  const data = useMemo(() => ({
    latitude: location?.coordinates?.latitude ?? null,
    longitude: location?.coordinates?.longitude ?? null,
    now,
  }), [location, now]);

  return (
    <div className="absolute inset-0 z-0" aria-hidden="true">
      <Suspense fallback={null}>
        <HomeGlobeView data={data} style={{ width: '100%', height: '100%' }} />
      </Suspense>
    </div>
  );
}
```

### `src/App.tsx` integration

```tsx
const isGlobeHome = settings.homeView === 'globe';
const showGlobeLayer = isGlobeHome && !isQiblaOpen && !isDashboardOpen && !isSettingsOpen;

// Rendered as a sibling near GirihBackground, before the max-w-lg column:
{showGlobeLayer && <HomeGlobeScreen />}

// Inside the max-w-lg column:
{!isGlobeHome && !isQiblaOpen && !isDashboardOpen && !isSettingsOpen && <SunDomeCard prayers={prayers} />}

// Header: icon buttons keep a subtle translucent circle background (needed as a tap-target affordance
// over the scene) and fixed light-on-dark icon color when isGlobeHome, solid theme colors otherwise.
// Countdown block: a `glow` style variant when isGlobeHome — no card background/border, light-on-dark
// text with a soft drop shadow instead — vs. the normal solid `bg-[var(--color-card)]` card otherwise.
// Prayer table block: only rendered when !isGlobeHome
```

The header toggle button sits next to the existing Qibla/Dashboard icons, calling `updateHomeView(isGlobeHome ? 'list' : 'globe')`.

### `src/components/OnboardingScreen.tsx`

```ts
const [step, setStep] = useState<'welcome' | 'notifications' | 'location' | 'locating' | 'homeView'>('welcome');
```

All four current paths that call `onComplete` (or `setTimeout(onComplete, …)`) from the `'locating'` step and from `skipLocation()` instead advance to `setStep('homeView')`. The new step renders two tappable cards (Globe / List, each with a short preview) whose Continue button does:

```ts
updateHomeView(choice);
onComplete();
```

---

## Data flow

```
App launches → SettingsContext loads → homeView (default 'list' or saved choice)
        │
        ├── New user → OnboardingScreen → 'homeView' step → updateHomeView() → onComplete()
        │
        ▼
App.tsx reads settings.homeView
        │
   ┌────┴─────┐
   │          │
 'list'    'globe'
   │          │
   │          ▼
   │   HomeGlobeScreen mounts (unless a modal is open)
   │          │
   │          ▼
   │   HomeGlobeView → HomeGlobe.build()
   │          │            │
   │          │            ├─ starfield (no I/O)
   │          │            ├─ earth: buildEarthTexture() + day/night shader
   │          │            │        (subSolarPoint(now) each tick)
   │          │            └─ cloud shell: getCloudImagery(now)
   │          │                     │
   │          │                     ├─ cached-today → texture applied immediately
   │          │                     ├─ fetch fresh → cache → texture fades in
   │          │                     └─ offline/no cache → procedural shader fallback
   │          ▼
   │   Header/countdown render on top, transparent style
   ▼
SunDomeCard + PrayerTable render exactly as today (unchanged)

User taps header toggle → updateHomeView(other value) → App.tsx swaps layers instantly
```

---

## Error handling

| Failure | Behavior |
|---|---|
| GIBS fetch fails (offline, DNS, 5xx) | `cloudImagery.ts` falls through to any cached file, then to the procedural shader. Globe never blocks or shows an error state. |
| WebView blocks `fetch()` (CORS/mixed content) | Retry once via `CapacitorHttp`; if that also fails, treat as a fetch failure (see above) |
| `Filesystem.writeFile` fails (disk full, permissions) | Log and skip caching for this session; still render the freshly-fetched texture in memory, just re-fetch next launch |
| WebGL unavailable (locked-down WebView) | `SceneHost`'s existing `fallback` prop covers this — same as `QiblaGlobeView`. `HomeGlobeScreen` should pass a plain CSS starfield-gradient `fallback` so Globe mode still looks intentional, not broken |
| `subSolarPoint` given an invalid `Date` | Not defensively handled — `now` is always `new Date()` from a live ticker, same trust level as the rest of `solarGeometry.ts` |
| User has no location yet (`latitude`/`longitude` null) | Earth still renders (globe doesn't need the user's position, only the sun's) — same graceful-null pattern `SunDomeCard` already uses |
| Onboarding interrupted mid-flow (app killed before `'homeView'` step) | `showOnboarding` stays `true` on relaunch (existing behavior) — user re-enters onboarding from `'welcome'`, no partial-state bug introduced |

---

## Testing strategy

**Unit tests:**

- `src/__tests__/solar-geometry.test.ts` — add cases for `subSolarPoint`: known date/time → expected lat/lon within tolerance; longitude wraps correctly across the ±180° boundary; declination matches `solarDeclination` output exactly (shared code path).
- `src/__tests__/cloud-imagery.test.ts` — mock `fetch`/`Filesystem`/`Preferences`: fresh fetch caches and returns `'fresh'`; same-day cache short-circuits the fetch; fetch failure falls back to stale cache; no cache and fetch failure returns `'procedural'`.
- `src/__tests__/home-view-settings.test.ts` — default is `'list'` for a fresh install; a saved `'globe'` value survives `loadSettings`'s merge; `updateHomeView` persists correctly (same shape as the existing `design-switching.test.tsx` for `designStyle`).

**Manual device smoke (GrapheneOS Pixel 6 Pro):**

1. Fresh install → onboarding → homeView step appears after location → choosing Globe lands on the full-page scene; choosing List lands on the unchanged dashboard.
2. In Globe mode: stars visible, earth rotates slowly, day/night terminator roughly matches real time of day for the device's location, header/countdown remain legible over the scene.
3. Open Qibla / Dashboard / Settings from Globe mode → confirm the globe's WebGL context actually unmounts (check via a frame-rate/battery tool or simply confirm no visible canvas underneath) and remounts cleanly on close.
4. Toggle Globe ↔ List via the header button repeatedly — no crashes, no orphaned GL contexts.
5. Airplane mode + fresh install (no cache yet) → Globe mode still renders with the procedural cloud fallback, no error UI.
6. Force-quit and relaunch → cached cloud imagery reused without a new network fetch (verify via a network log).

No new e2e infrastructure — this project's testing pattern is unit tests plus manual device smoke, matching how the qibla globe and sky dome were verified.

---

## Out of scope (deferred)

- **Removing `SunDomeCard` from List mode.** The user's original complaint (globe-ish card sharing a screen with the list) is only resolved for people who pick Globe home. List-mode users keep seeing `SunDomeCard` above the prayer list exactly as today. Flagged as a known follow-up, not silently dropped.
- **Swipe-gesture switching** between Globe and List — the header-toggle approach was chosen instead (see Decisions).
- **A temperature/conditions weather widget** — "live weather" was clarified to mean cloud cover imagery specifically, not a forecast UI element.
- **Live cloud imagery more frequent than daily** — would require a keyed API (OpenWeatherMap tiles) and tile-stitching; rejected in favor of no-key NASA GIBS.
- **Using TrueColor imagery as the earth's base map itself** — it has no alpha channel and would paint over the theme-tinted vector map if used directly. It's still the cloud data *source*, but only via the client-side HSV extraction in `cloudImagery.ts` (see Decisions) — the earth's base map stays the vector coastline texture.
- **City-lights night texture** — a nice-to-have some "living earth" globes add on the night side; not requested, adds another texture asset to manage.

---

## Open questions

None — the GIBS endpoint, layer, format and CORS behavior were verified by hand against the live service on 2026-08-23 (see `cloudImagery.ts`'s Component design section); all decisions are locked in.

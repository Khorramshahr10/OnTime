# Handoff — Batch 6 not started

**Date:** 2026-09-07
**State:** `main` @ `3a5d747`, pushed, working tree clean. `tsc -b` clean, **320/320 tests pass** (34 files), ESLint **18 errors + 1 warning**, `npm run build` succeeds, suite green under UTC / Asia/Karachi / Pacific/Kiritimati / America/New_York.

Batches **1–5 of the audit are complete and pushed**. Batch 6 was started and then **fully reverted** when the session hit its usage limit — nothing from it is in the tree. `git log` ends at the Batch 5 docs commit.

## What Batch 6 is

The full item list is in `docs/audits/2026-09-07-platform-bug-hunt.md`:

- **§8, "Batch 6"** — the enumerated list of IDs.
- **§5 (P3 tables)** — each finding with file:line, root cause, failure scenario and fix direction.

Roughly thirty small items: listener leaks, dialog state that never resets, the About screen reporting v1.0.0, notification ID collisions at reachable-but-unrealistic input sizes, and several races that are currently unreachable and worth closing before they become reachable.

None are user-critical. They are hygiene and latent traps, which is why they were batched last.

## Two designs already worked out — don't re-derive them

These were written, then reverted with the rest. Recording them so the next session can go straight to the edit.

### GL-13 — `CAMERA_FAR` should be 9000, not 30000

`src/components/three/homeGlobe.ts`, constant near the top (`CAMERA_NEAR = 1`).

The scene reaches no further than ~7600 units: the starfield is at radius 4000 (`STAR_RADIUS`) and the camera backs off to `MAX_DISTANCE` 3500 plus the globe's own radius of 100. At `far = 30000` the resolvable depth step for a 24-bit buffer is ~0.24 units at 2000 units out — coarser than the 0.2-unit gap `BASE_SPHERE_SCALE = 0.998` keeps between the base sphere and the tile shell, so the z-fighting that commit `d6a9bc2` fixed at the default zoom can reappear when pinched right out. 9000 is a free 3.3× precision win and pushes the crossover past `maxDistance`.

Note `three-render-objects` sets `camera.far = skyRadius * 2.5 = 125000`, and the code at ~`:658` resets it to `CAMERA_FAR` — that reset is load-bearing, don't remove it.

### GL-11 — replace the `DefaultLoadingManager` save/restore with a subscriber set

`src/components/three/homeGlobe.ts`: install in `mount()` (~`:530-552`), restore in `dispose()` (~`:1041-1052`), fields `prevManagerOnLoad` / `prevManagerOnProgress` (~`:439-440`).

`three-slippy-map-globe` loads tiles through a bare `TextureLoader`, which reports to `THREE.DefaultLoadingManager` — a single global slot that cannot be injected into. Each `HomeGlobe` currently saves and restores it, which corrupts if two instances ever overlap: A disposing first restores the original and silently discards B's live handler, then B disposing restores its captured "previous" (A's), leaving the global permanently owned by a disposed scene and retaining its whole object graph.

The fix is one module-level interceptor plus a `Set` of subscribers, hooked on first subscribe and unhooked only when the last subscriber leaves:

```ts
interface TileLoadListener {
  onTileProgress: (url: string, loaded: number, total: number) => void;
  onAllLoaded: () => void;
}
const tileLoadListeners = new Set<TileLoadListener>();
```

`mount()` adds a listener object (a class field, so it can be removed); `dispose()` deletes it and unhooks if the set is now empty. This is latent rather than live today — `Scenes.tsx`'s effect deps are stable and StrictMode's double-invoke is sequential — but it is a trap worth closing while the file is open.

**Gotcha that bit this session:** adding the module-level helpers *before* wiring the class to them fails `tsc -b`, because `tsconfig.app.json` sets `noUnusedLocals: true`. Land the helper and its call sites in the same edit.

## Conventions this repo holds that the next session should keep

- **ESLint baseline.** It was 19 errors + 1 warning for months and is now **18 + 1**. Treat any increase as a regression to investigate, not noise. Several are compiler-rule friction (`react-refresh/only-export-components`, `react-hooks/immutability`) that the codebase tolerates.
- **Test files are excluded from `tsc -b`** (`tsconfig.app.json` excludes `src/**/*.test.*` and `src/test`). A type error in a test surfaces only as a runtime failure — check test output, not just `tsc`.
- **Mutation-test behaviour fixes.** Every fix in batches 1–5 was verified by reverting it in place and confirming exactly the intended tests fail. `cp` the file to `/tmp`, mutate with a small script, run, restore.
- **Timezone matrix.** Several suites are timezone-sensitive; `prayer-times.test.ts` pins `process.env.TZ = 'America/Toronto'` because its assertions reason about Toronto's solar day. Run the suite under a few TZs before declaring green.
- **Commit style:** conventional prefix, imperative lowercase subject, and a body that explains *why* with the measured numbers. No `Co-Authored-By` trailer was added by the assistant — the existing history has one naming a different model, and it was deliberately not copied.
- **Never hardcode a fiqh choice.** Polar-circle resolution (`polarCircleResolution`) and the high-latitude rule are still deliberately unset — see the audit's PM-3/PM-8 and the note in the Batch 2 commit. Surface them as settings or show an honest empty state.

## Waiting on the owner, not on code

- **#17** — the Fajr adhan slot. The general adhan ships now; none of the four recordings is an actual Fajr adhan, so that option is still inert.
- **#18** — prayer notifications now pop heads-up banners. Cheaper to decide before the next release than after, because Android fixes a channel's importance at first creation.
- **#19** — on-device verification of the athan sound work. Checklist: `docs/audits/2026-09-07-athan-device-check.md`. **Read its first section before testing** — Android caches a channel's sound from first creation, so an existing install will make a working fix look broken.
- **Privacy policy** — still says Nominatim is "the only external network request". Batch 5 removed Google Fonts and threejs.org, so only Esri and assabile remain to disclose. Detail in the audit's §3.7 / DOC-1a.
- **iOS** — not a shipping target and deliberately parked. §4 of the audit lists what would block it.

## Also noticed, not investigated

`npm audit --omit=dev` reports three pre-existing advisories in transitive build dependencies: `tar` (critical), `minimatch` (high), `@xmldom/xmldom` (high). None come from the `@fontsource` packages added in Batch 5 and none are reachable from shipped app code, but `npm audit fix` has not been run.

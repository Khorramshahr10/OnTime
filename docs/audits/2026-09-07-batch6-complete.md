# Batch 6 — complete

**Date:** 2026-09-07
**State:** `main` @ the commit this file arrived in, **not pushed**. The eleven fix commits below end at `ba47e6f`. `tsc -b` clean, **372/372 tests pass** (46 files), ESLint **18 errors + 1 warning** — the baseline, unmoved — `npm run build` succeeds, suite green under UTC / Asia/Karachi / Pacific/Kiritimati / America/New_York.

This file was written as a "batch 6 not started" handoff. Batch 6 is now done, so it has been rewritten as the record of what happened — including the parts where the plan it carried turned out to be wrong.

Batches **1–6 of the audit are complete**. The full item list and the per-finding detail stay in `docs/audits/2026-09-07-platform-bug-hunt.md`; §8 there now marks batch 6 complete and carries the reasoning that outlived this file.

## The eleven commits

| Commit | What |
|---|---|
| `252a1f6` | homeGlobe/Scenes lifecycle — GL-2, GL-10, GL-11, GL-12, and GL-13's refutation |
| `bb9dba4` | Base3D idle parking (GL-7) and the qibla map-texture leak (GL-6) |
| `2e81da7` | Travel Mode "off" that actually sticks (LQ-11) and home-base trip reset (LQ-12) |
| `30b0cdf` | the DST re-check that could never fire (PM-7) and the leaked listener (MH-3) |
| `29383ca` | the compass: unmount-during-start (LQ-9), stale declination (LQ-14), shared-sensor handover (LQ-13) |
| `b6993a8` | notification ids and volume — NT-12, NT-13, NT-15, NT-17, NT-19 |
| `47db35c` | SettingsModal — ST-3, ST-6, ST-7, ST-8, ST-10, NT-7 |
| `2b59290` | both prayer tables and both countdown timers — PM-11, PM-9, PM-13 |
| `63d1130` | loose ends — ST-9, ST-14, GL-15, GL-16, PM-10 |
| `936c2bc` | startup ordering — NT-16/ST-12, ST-13, NT-11 (mechanical half) |
| `ba47e6f` | MH-8 — App stops re-rendering once a second |

## The design this file used to carry, and what became of it

The previous version recorded two designs "already worked out, so they don't get re-derived from scratch". One held; one did not.

**GL-11 (the `DefaultLoadingManager` subscriber set) was correct and shipped as written** — one module-level interceptor plus a `Set` of subscribers, hooked on first subscribe and unhooked when the last leaves. The gotcha it flagged was real: `tsconfig.app.json` sets `noUnusedLocals`, so helpers and their call sites have to land in the same edit.

**GL-13 (`CAMERA_FAR` 30000 → 9000) was wrong**, and the audit's §8 now explains why at length. In short: depth precision is governed by `near`, not by `far`, and `near` is pinned at 1 by the pinch floor. Lowering `far` buys 0.01%, not 3.3×. The z-fighting risk at full zoom-out stands as a known limitation. **Do not "fix" it again from the old reasoning** — the comment `d6a9bc2` left on `CAMERA_FAR`, and this file's old claim that `ensureBaseSetup`'s camera reset is "load-bearing", both share the same error.

## Conventions this batch kept, and one it added

- **ESLint baseline: 18 errors + 1 warning.** Held exactly across all eleven commits. Three times a new test tripped `react-hooks/immutability` or `no-unused-vars` and was rewritten rather than accepted; treat any increase as a regression to investigate.
- **Test files are excluded from `tsc -b`** (`tsconfig.app.json` excludes `src/**/*.test.*` and `src/test`), so a type error in a test only shows up at runtime. Read the vitest output, not just `tsc`.
- **Mutation testing.** Every fix was verified by reverting it in place and confirming exactly the intended test fails. This caught four tests that passed against the *old* code too — a Jumu'ah id test that the slice already protected, a GL-13 assertion encoding a false claim, a PM-9 test masked by the row's own selection tick, and a PM-13 test that RTL's `act()` flushing made undiscriminating. Three were rewritten; PM-13's was deleted and the reason recorded in the commit.
- **Timezone matrix.** Run the suite under a few TZs before declaring green; `prayer-times.test.ts` pins `America/Toronto` because its assertions reason about Toronto's solar day.
- **Commit style:** conventional prefix, imperative lowercase subject, and a body that explains *why* with the measured numbers.
- **New:** `patches/` now holds a Capacitor patch as well as the two three.js ones. `postinstall` already runs `patch-package`, so nothing else changes — but a Capacitor upgrade now has a third patch to re-apply.

## Two React-testing traps worth knowing before writing more of these tests

Both cost real time in this batch:

1. **Inside one `act()`, React flushes the state update only at the end.** So `act(() => { doThing(); vi.advanceTimersByTime(500); })` runs the clock past a debounce *before* the effect that arms it has re-run. Split it into two `act()` calls.
2. **A failed assertion skips whatever cleanup follows it in the test body.** A globe left mounted keeps its loading-manager subscription and quietly breaks every test after it — the failure then looks like a bug in unrelated code. Track instances and dispose them in `afterEach`.

## Waiting on the owner, not on code

- **Push.** Eleven commits are sitting on `main` unpushed, including a Capacitor plugin patch and a new persisted settings field. Deliberately left for review.
- **#17** — the Fajr adhan slot. None of the four recordings is an actual Fajr adhan, so that option is still inert.
- **#18 / NT-18** — prayer notifications pop heads-up banners, and the athan channel uses `USAGE_NOTIFICATION` where the plugin default uses `USAGE_ALARM`. Untouched on purpose: Android fixes a channel's importance at first creation, so this is cheaper to decide before a release than after.
- **#19** — on-device verification. Checklist: `docs/audits/2026-09-07-athan-device-check.md`; **read its first section before testing**, because Android caches a channel's sound from first creation. Batch 6 adds three items to it: the post-reboot notification stagger (NT-19), the boundary watchdog after a resume (MH-8), and the countdown card's urgency state across a display toggle (PM-13). None can be verified in jsdom.
- **NT-21** — confirm the Play Console declaration forms for `SCHEDULE_EXACT_ALARM` and `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` before the next submission.
- **NT-11's second half** — nothing in the app surfaces a notification denial after onboarding, or deep-links to the system settings screen. That is new UI rather than a fix.
- **Privacy policy** — still says Nominatim is "the only external network request". After batches 5 and 6, only Esri and assabile remain undisclosed. Detail in the audit's §3.7 / DOC-1a.
- **PM-8** — which high-latitude rule to expose, and its default. A fiqh decision; `polarCircleResolution` and the high-latitude rule are still deliberately unset.
- **`.worktrees/feature/hijri-date-header`** — batch 6 deleted the orphaned `DateHeader.tsx` on `main`. The worktree is still there and is yours to land or delete.
- **iOS** — not a shipping target, deliberately parked. §4 of the audit lists what would block it.

## Also noticed, not investigated

`npm audit --omit=dev` still reports three pre-existing advisories in transitive build dependencies: `tar` (critical), `minimatch` (high), `@xmldom/xmldom` (high). None come from anything batch 5 or 6 added and none are reachable from shipped app code, but `npm audit fix` has still not been run.

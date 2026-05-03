# Production Readiness Audit — OnTime

**Date:** 2026-05-02  
**Auditor:** DeepSeek V4 Pro (read-only analysis)  
**Scope:** Full codebase as of the current commit

---

## Executive Summary

OnTime is a well‑structured React+Capacitor app with extensive settings and a polished dual‑theme UI. The biggest **blockers** to store submission are **missing iOS location usage descriptions** (Info.plist lacks `NSLocationWhenInUseUsageDescription`), a **missing Privacy Manifest** (`PrivacyInfo.xcprivacy`), and a **version mismatch** between `package.json` (1.6.0) and the Android build (1.6). The privacy policy omits the athan‑catalog network request, which could cause rejection. Several **high‑severity correctness issues** exist around notification scheduling races, missing error handling, and potential DST/timezone hazards. The **priority order** should be: first fix the platform‑specific store blockers, then correctness (notifications, error handling), then performance (context splitting, code splitting), and finally polish (accessibility, theme‑contrast, reduced motion).

---

## Findings

### 1. Security

#### 1.1 Missing iOS Privacy Manifest
- **Severity:** Blocker
- **Evidence:** No `ios/App/App/PrivacyInfo.xcprivacy` file exists in the tree. The app uses location (`Geolocation`), motion sensors (`Motion`), file system access (`Filesystem`), and user defaults (`Preferences`). Apple requires a privacy manifest for these APIs starting from May 2024 for new apps and May 2025 for updates.
- **Recommendation:** Generate a `PrivacyInfo.xcprivacy` using Capacitor’s tooling or manually, listing all required reason APIs (e.g., `NSPrivacyAccessedAPICategoryUserDefaults`, `NSPrivacyAccessedAPICategoryFileTimestamp`, `NSPrivacyAccessedAPICategorySystemBootTime`, and sensor‑data categories).

#### 1.2 Keystore File Risk
- **Severity:** High
- **Evidence:** `android/app/build.gradle:5-10` falls back to `../ontime-release.keystore` if `keystore.properties` is missing. If the keystore file is accidentally committed to the repo, the signing key is compromised. The `.gitignore` status is unknown from the inlined files.
- **Recommendation:** Ensure `ontime-release.keystore` and `keystore.properties` are listed in `.gitignore`. Remove the hard‑coded default path; the build should fail fast if properties are missing (e.g., throw an error instead of falling back).

#### 1.3 No Content Security Policy
- **Severity:** Low
- **Evidence:** `index.html` contains no `<meta http-equiv="Content-Security-Policy">` and `vite.config.ts` defines no headers. The app loads external fonts from Google Fonts and makes fetch requests to Nominatim and assabile.com.
- **Recommendation:** Add a CSP meta tag that allows fonts from `fonts.googleapis.com`, `fonts.gstatic.com`, connect‑src for `nominatim.openstreetmap.org` and `www.assabile.com`, and restricts script‑src to `'self'`. This protects against XSS even though the app uses Capacitor’s WebView.

---

### 2. Correctness

#### 2.1 iOS Location Usage Description Missing
- **Severity:** Blocker
- **Evidence:** `ios/App/App/Info.plist` does not contain the key `NSLocationWhenInUseUsageDescription`. The `Geolocation` plugin (`@capacitor/geolocation: ^8.0.0`) requires this key; without it, iOS will kill the app when location is requested.
- **Recommendation:** Add `<key>NSLocationWhenInUseUsageDescription</key><string>Your current location is used to calculate accurate prayer times and Qibla direction.</string>` to `Info.plist`.

#### 2.2 Notification Rescheduling Races
- **Severity:** High
- **Evidence:** `notificationService.ts:124` (`cancelAllNotifications`) cancels all pending notifications, including Jumu’ah and Surah Kahf. In `useNotifications.ts:39`, three separate `useEffect` blocks schedule prayer, Jumu’ah, and Kahf notifications with a 300 ms debounce. Rapid setting changes can lead to one schedule cancelling another’s newly‑added notifications.
- **Recommendation:** Combine the three scheduling calls into a single effect or a queue that cancels only its own category (by ID range). Alternatively, make `cancelAllNotifications` accept a filter.

#### 2.3 Unhandled Promise Rejection in Athan Download
- **Severity:** High
- **Evidence:** `athanService.ts:49-55` writes the downloaded file with `Filesystem.writeFile` without a `try/catch`. A write failure (disk full, permission denied) would result in an unhandled promise rejection.
- **Recommendation:** Wrap the `writeFile` call in a try/catch and return a meaningful error (or throw a typed error that the UI can catch). Currently only the directory creation is caught.

#### 2.4 Swallowed Errors in StatusBar and Notification Calls
- **Severity:** Medium
- **Evidence:** `App.tsx:64-66` uses `.catch(() => {})` for `StatusBar.setStyle`, `setBackgroundColor`, and `setOverlaysWebView`. Similarly, `LocalNotifications.schedule` on line 98 has an empty catch. Failures are silently ignored, making debugging difficult.
- **Recommendation:** At minimum, log errors to the console with `console.error`. Even better, record the failure in a non‑persistent state so the UI can show a subtle indicator.

#### 2.5 DST / Timezone Hazards for Prayer Times
- **Severity:** Medium
- **Evidence:** `prayerService.ts` uses the JavaScript `Date` object which relies on the device’s local timezone. If DST begins or ends between prayer windows (e.g., Fajr crosses the 2 AM switch), the times may be off by an hour. Additionally, when the user travels, the device may not auto‑update its timezone, causing prayers to be calculated for the wrong offset.
- **Recommendation:** Pass an explicit timezone offset (or use `Intl.DateTimeFormat().resolvedOptions().timeZone`) and recalculate prayer times whenever the timezone changes. Hook into Capacitor’s `appStateChange` to detect when the user returns to the app after travel.

#### 2.6 Missing Explicit Return Types on Exported Functions
- **Severity:** Low
- **Evidence:** `prayerService.ts` exports `formatTime` and `getTimeUntil` without explicit return type annotations. `notificationService.ts` exports functions with implicit `Promise<void>` but could benefit from explicit typing.
- **Recommendation:** Add return types to all exported functions (e.g., `formatTime(date: Date): string`). This improves maintainability and catches type regressions.

#### 2.7 Untested Core Module: athanService
- **Severity:** Medium
- **Evidence:** The test file list includes coverage for notifications, prayer times, settings, etc., but no test file for `athanService.ts`. This module handles network requests and file I/O, making it high‑risk.
- **Recommendation:** Add unit tests for `fetchAthanCatalog`, `downloadAthan`, `deleteAthanFile`, and `selectAthan`, using mocks for Capacitor plugins.

---

### 3. Performance

#### 3.1 Settings Context Causes Global Re‑renders
- **Severity:** High
- **Evidence:** `SettingsContext.tsx` provides a single `settings` object as context value. Every consumer that calls `useSettings()` re‑renders when **any** setting changes, even if it only reads a deeply nested field (e.g., `designStyle`). The provider state is updated atomically for every individual setting update.
- **Recommendation:** Split the context into multiple focused contexts (e.g., `CalculationContext`, `NotificationContext`, `DisplayContext`) or use a state-management library with selector support. At minimum, wrap components in `React.memo` and use `useMemo` to bail out of re‑renders when the relevant subset hasn’t changed.

#### 3.2 Large Components Could Be Code‑Split
- **Severity:** Medium
- **Evidence:** `SettingsModal.tsx` is ~800 lines and imports heavy sub‑components like `CitySearch` and `AthanCatalogPanel`. `QiblaCompass.tsx` includes an iframe. None are lazy‑loaded; they all ship in the main bundle.
- **Recommendation:** Use `React.lazy` to code‑split `SettingsModal`, `QiblaCompass`, `Dashboard`, and `CitySearch`. This reduces initial JavaScript size and improves first‑load time.

#### 3.3 No Periodic Notification Refresh
- **Severity:** Medium
- **Evidence:** `useNotifications.ts` schedules notifications only when settings or location change. If the app is backgrounded for days, notifications will fire based on stale times (e.g., after DST change or travel). Android’s `AlarmManager` can handle exact scheduling, but the app doesn’t set up a periodic work request.
- **Recommendation:** Add a background task (using Capacitor’s background plugin or a native alarm) to reschedule notifications at least once per day or on timezone change.

#### 3.4 Font Awesome Bundle Optimization
- **Severity:** Low
- **Evidence:** The app imports `FontAwesomeIcon` and only the `faKaaba` icon. Tree‑shaking should work, but ensure that the Vite config enables tree‑shaking for `@fortawesome/free-solid-svg-icons`. The current `vite.config.ts` has no special config.
- **Recommendation:** Verify via `npm run build` that only the used icons are included. Add `@fortawesome/fontawesome-svg-core` optimization if needed.

---

### 4. Accessibility

#### 4.1 Missing Labels on Icon‑Only Buttons
- **Severity:** Medium
- **Evidence:** Several buttons lack `aria-label`, e.g., the close button in `SettingsModal.tsx:791`, the back‑chevron button in `Dashboard.tsx:60`, and the clear search button in `CitySearch.tsx:152`. Screen‑reader users cannot discern their purpose.
- **Recommendation:** Add descriptive `aria-label` attributes to all icon‑only buttons (e.g., `aria-label="Close settings"`, `aria-label="Clear search"`).

#### 4.2 No Focus Management in Modals
- **Severity:** Medium
- **Evidence:** `SettingsModal.tsx`, `Dashboard.tsx`, and `QiblaCompass.tsx` mount full‑screen overlays but do not trap focus, set `aria-modal="true"`, or move focus to the first interactive element when opening.
- **Recommendation:** Implement a simple focus‑trap hook. On mount, focus the first focusable element (e.g., the close button). On unmount, return focus to the triggering element.

#### 4.3 Missing prefers‑reduced‑motion Support
- **Severity:** Medium
- **Evidence:** CSS animations defined in `App.tsx` (`current-prayer-glow`), `CountdownTimer.tsx` (keyframes), `IslamicCountdownTimer.tsx`, and `SettingsModal.tsx` do not respect `prefers‑reduced‑motion`.
- **Recommendation:** Wrap all `@keyframes` and `animation` declarations inside a `@media (prefers‑reduced‑motion: no-preference)` block, or add a global CSS rule that disables transitions/animations when the user prefers reduced motion.

#### 4.4 Form Inputs Missing `<label>` Associations
- **Severity:** Medium
- **Evidence:** `SettingsModal.tsx:400-407` uses plain `<input>` elements with `placeholder` but no associated `<label>`. This reduces accessibility for screen‑reader users.
- **Recommendation:** Either wrap inputs in `<label>` elements or use `aria-labelledby` pointing to a preceding heading/description.

#### 4.5 Arabic Text RTL Handling
- **Severity:** Low
- **Evidence:** `IslamicCountdownTimer.tsx` and `IslamicPrayerTable.tsx` display Arabic prayer names, but no `dir="auto"` or explicit `dir="rtl"` is set on those elements. On RTL‑locale devices, the text may not align correctly.
- **Recommendation:** Add `dir="rtl"` to the containing `<span>` or `<div>` for Arabic text, or use the `Amiri` font with appropriate direction settings.

---

### 5. Store Readiness

#### 5.1 Version Inconsistency
- **Severity:** Blocker
- **Evidence:** `package.json:4` versions the app as `1.6.0`, while `android/app/build.gradle:20` uses `versionName "1.6"` and `versionCode 8`. The iOS version is derived from `MARKETING_VERSION` (not visible). Play Store expects the version name to match the user‑visible version.
- **Recommendation:** Update `android/app/build.gradle` to `versionName "1.6.0"` and ensure `versionCode` is incremented for each submission (currently 8 → should be 9 for next release). Set the same string in `ios/App/App/Info.plist` via project build settings.

#### 5.2 Incomplete Privacy Policy
- **Severity:** High
- **Evidence:** `PRIVACY_POLICY.md:14` states “The only external network request the app makes” is for reverse geocoding, but `athanService.ts:12` fetches a catalog from `https://www.assabile.com/adhan-call-prayer` to download athan audio. The policy does not disclose this third‑party service or its privacy implications.
- **Recommendation:** Update the privacy policy to mention the athan catalog and audio download from assabile.com, and explain that no personal data is sent to that server. Add a link to Assabile’s terms/privacy if available.

#### 5.3 No Splash Screen Configuration
- **Severity:** Medium
- **Evidence:** `capacitor.config.ts` contains no `SplashScreen` plugin configuration. The app depends on `@capacitor/app` but not `@capacitor/splash-screen`. Without a splash screen, users see a white flash on Android and a black screen on iOS during launch.
- **Recommendation:** Add `@capacitor/splash-screen` to the dependencies, configure it in `capacitor.config.ts`, and provide a `splash.png` and `splash-dark.png`.

#### 5.4 Missing iOS PrivacyInfo.xcprivacy
- **Severity:** Blocker
- **Evidence:** (Also listed under Security 1.1) The absence of this file will cause App Store rejection.
- **Recommendation:** Generate a privacy manifest as described in 1.1.

#### 5.5 Android Target SDK Not Explicitly Set
- **Severity:** High
- **Evidence:** `android/app/build.gradle:18` reads `targetSdkVersion rootProject.ext.targetSdkVersion`. The actual value is not visible; it must be 34 or higher to meet Google Play requirements (as of August 2025). If the project’s root `build.gradle` sets an older version, the app will be rejected.
- **Recommendation:** Verify the root project’s `targetSdkVersion` is 34 or higher, and consider hardcoding it in the app’s `build.gradle` to avoid surprises.

#### 5.6 Store Listing Description Length
- **Severity:** Low
- **Evidence:** `store-listing.md:2` shows a short description of 80 characters (within limit) and a long description with markdown headings. The Play Store has a 4000‑character limit for full description; the provided text is well within.
- **Recommendation:** No action required; the description is compliant.

---

## Prioritized Fix List

| Severity | Category          | Finding                                                                 | Estimated Effort | Suggested PR Boundary                        |
|----------|-------------------|-------------------------------------------------------------------------|------------------|---------------------------------------------|
| Blocker  | Store             | Missing iOS location usage description (Info.plist)                    | S                | iOS platform fixes                          |
| Blocker  | Store             | Missing iOS PrivacyInfo.xcprivacy                                      | M                | iOS platform fixes                          |
| Blocker  | Store             | Version mismatch between package.json and Android build                | S                | Version consistency PR                      |
| Blocker  | Correctness       | Unhandled promise rejection in athan download                          | S                | Error‑handling hardening                     |
| High     | Correctness       | Notification scheduling races cancel Jumu’ah/Kahf                      | M                | Notification architecture fix               |
| High     | Security          | Keystore path fallback risk                                            | S                | Build config hardening                      |
| High     | Store             | Incomplete privacy policy (assabile.com)                               | S                | Privacy policy update                       |
| High     | Store             | Android target SDK may be too low                                      | S                | Android build config                        |
| High     | Performance       | Settings context causes global re‑renders                              | L                | Context splitting or memoization            |
| High     | Accessibility     | Missing labels on icon‑only buttons                                    | S                | Accessibility pass                          |
| Medium   | Correctness       | DST / timezone hazards for travel and prayer times                     | M                | Timezone‑aware prayer calculation           |
| Medium   | Correctness       | Untested athanService module                                           | M                | Test coverage improvement                   |
| Medium   | Performance       | No periodic notification refresh                                       | M                | Background scheduling                       |
| Medium   | Performance       | Large components not code‑split                                        | M                | Lazy loading PR                             |
| Medium   | Accessibility     | No focus management in modals                                          | M                | Focus‑trap and aria‑modal                   |
| Medium   | Accessibility     | Missing prefers‑reduced‑motion support                                 | S                | CSS animation guard                         |
| Medium   | Accessibility     | Form inputs missing label associations                                 | S                | Label audit                                 |
| Medium   | Store             | No splash screen plugin                                                | M                | Splash screen integration                   |
| Low      | Security          | No Content Security Policy                                             | S                | CSP meta tag addition                       |
| Low      | Correctness       | Missing explicit return types on some exports                          | S                | Type annotation cleanup                     |
| Low      | Accessibility     | Arabic text lacks RTL direction                                        | S                | RTL styling pass                            |
| Low      | Performance       | Font Awesome tree‑shaking verification                                 | S                | Build analysis                              |

**Key:** S = Small (< 2 hours), M = Medium (2–8 hours), L = Large (1–3 days)
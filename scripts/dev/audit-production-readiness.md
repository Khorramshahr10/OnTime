# Production readiness audit of OnTime

## Spec

You are auditing the OnTime codebase — a Capacitor + Vite + React 19 + TypeScript Islamic prayer-times app, targeted at Android and iOS — for production readiness. Produce a single audit report at `docs/audits/2026-05-02-production-readiness.md` covering, with concrete `path:line` references where applicable, the five categories below.

This is a read-only audit. Do not modify any source code. Do not propose changes to any source file in this PR — write findings only. Subsequent PRs (one per category) will fix issues.

## Repository tree (for navigation)

Files under `src/` you will see inlined below in "Code context":
- src/App.tsx, src/main.tsx
- src/context/{LocationContext, SettingsContext, ThemeContext, TravelContext}.tsx
- src/services/{athanService, notificationService, prayerService, prayerTrackingService}.ts
- src/hooks/{useNotifications, usePrayerTimes, useQibla}.ts
- src/components/{App-level: CitySearch, CountdownTimer, Dashboard, DateHeader, IslamicCountdownTimer, IslamicPatterns, IslamicPrayerTable, LocationDisplay, NotificationPermissionDialog, OnboardingScreen, PrayerTable, QiblaCompass, SettingsModal, TravelPromptDialog}.tsx
- src/types/index.ts
- src/utils/distance.ts
- src/plugins/athanPlugin.ts

Files under `src/` you will NOT see inlined (you can ask for any of them via QUESTIONS if you need to):
- src/data/cities.ts (~33,000 lines — a static city database; only ask for samples if you need to assess data structure)
- src/data/countries.ts (~256 lines)
- src/__tests__/*.{ts,tsx} (10 test files: countdown, design-switching, distance, notifications, prayer-times, prayer-times-edge-cases, prayer-tracking, qibla, settings-interactions, settings-persistence, theme, travel)
- src/test/{helpers.tsx, setup.ts}

Native and config files inlined below: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `capacitor.config.ts`, `index.html`, `README.md`, `PRIVACY_POLICY.md`, `store-listing.md`, `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`, `ios/App/App/Info.plist`.

## Categories

### 1. Security

- Hardcoded secrets, API keys, tokens in source or config (search for: keys, tokens, `Authorization`, `Bearer`, anything resembling `sk-`, `pk-`, base64 blobs).
- Dependency posture — read `package.json` and flag any deps that are outdated by major versions, deprecated, or commonly known to have advisories. Suggest a remediation plan grouped by risk.
- Capacitor / Android / iOS native config issues:
  - excessive permissions in `AndroidManifest.xml` and `Info.plist` vs what the app actually does
  - `android:debuggable="true"` left enabled
  - `usesCleartextTraffic="true"` or missing network security config
  - signing config or keystore committed to repo
  - any `cordova.allow.permissions` / `<allow-navigation>` overly broad
- Web origin / CSP — `index.html` and `vite.config.ts`.

### 2. Correctness

- TypeScript type coverage — count and call out usages of `any`, `as any`, `@ts-ignore`, `@ts-expect-error`, missing return types on exported functions, unsafe casts.
- Test coverage — based on the test file names listed above, identify the highest-risk untested modules among the inlined files.
- Error handling — unhandled promise rejections, missing `try/catch` around async I/O (Capacitor Filesystem, Geolocation, fetch calls), swallowed errors (empty catch blocks, `.catch(() => {})`).
- Time / locale / DST hazards specific to a prayer times app — DST transitions across Fajr boundary, timezone changes when traveling, `Date` vs `Intl` usage, locale-sensitive month/day formatting.
- Race conditions in notification scheduling and athan playback.

### 3. Performance

- Bundle size hot spots — read `package.json` deps and `vite.config.ts`, identify obvious bloat (e.g., Font Awesome with full icon import, large unused libs). The 33K-line `cities.ts` is a strong candidate for code-splitting / lazy loading.
- Audio asset loading strategy (`athan-audio/`) — preloaded vs on-demand, file format efficiency, total payload (you can ask in QUESTIONS for an `ls` of athan-audio if needed).
- Notification scheduling correctness vs battery drain — Capacitor LocalNotifications, how many notifications are scheduled at once, are they rescheduled defensively.
- React render hotspots — large lists, missing memoization on expensive components, context churn (any `useContext` consumers that re-render on unrelated changes).
- Vite build output — dynamic imports for big features.

### 4. Accessibility

- Touch target sizes on interactive elements (icons, toggles, the qibla compass).
- Screen reader labels on icon-only buttons (`aria-label`, `aria-describedby`).
- Color contrast in both Classic and Islamic themes (and dark mode, desert, rose, system, auto).
- Reduced motion handling.
- Focus management in modals (settings modal, city search, onboarding).
- Form labels and input associations.
- RTL/LTR awareness for Arabic content.

### 5. Store readiness

- App icons — sizes present, masking, adaptive icons for Android.
- Splash screen configuration.
- `store-listing.md` and `PRIVACY_POLICY.md` completeness vs what the app actually does (location, notifications, audio download, motion sensors).
- Version consistency: `package.json:version` vs `android/app/build.gradle:versionName/versionCode` vs `ios/App/App/Info.plist:CFBundleShortVersionString/CFBundleVersion`.
- Permissions justification — does each requested permission have a user-visible reason in onboarding or first-use prompt.
- App name, bundle ID, and signing setup.
- iOS App Tracking Transparency (if any tracking) and Privacy Manifest (`PrivacyInfo.xcprivacy`).
- Android target SDK and Play Console requirements.

## Output format

The report MUST be a single file: `docs/audits/2026-05-02-production-readiness.md`.

Structure:

1. **Executive summary** (5-10 lines): top blockers, overall posture, recommended sequence.
2. **Findings**, grouped by the 5 categories above. Each finding has:
   - **Severity:** Blocker / High / Medium / Low
   - **Title:** one short line
   - **Evidence:** specific `path:line` references where applicable, or "no evidence found in repo" if it's a missing-thing finding
   - **Recommendation:** concrete next step
3. **Prioritized fix list**: a markdown table at the bottom — columns: Severity, Category, Finding, Estimated Effort (S/M/L), Suggested PR boundary — ordered by what to ship first.

Do not change any source code. Do not run any commands. Read-only audit producing a single markdown report.

## Files in scope

- README.md
- package.json
- capacitor.config.ts
- vite.config.ts
- vitest.config.ts
- tsconfig.json
- tsconfig.app.json
- tsconfig.node.json
- eslint.config.js
- index.html
- PRIVACY_POLICY.md
- store-listing.md
- src/App.tsx
- src/main.tsx
- src/types/index.ts
- src/utils/distance.ts
- src/plugins/athanPlugin.ts
- src/context/LocationContext.tsx
- src/context/SettingsContext.tsx
- src/context/ThemeContext.tsx
- src/context/TravelContext.tsx
- src/services/athanService.ts
- src/services/notificationService.ts
- src/services/prayerService.ts
- src/services/prayerTrackingService.ts
- src/hooks/useNotifications.ts
- src/hooks/usePrayerTimes.ts
- src/hooks/useQibla.ts
- src/components/CitySearch.tsx
- src/components/CountdownTimer.tsx
- src/components/Dashboard.tsx
- src/components/DateHeader.tsx
- src/components/IslamicCountdownTimer.tsx
- src/components/IslamicPatterns.tsx
- src/components/IslamicPrayerTable.tsx
- src/components/LocationDisplay.tsx
- src/components/NotificationPermissionDialog.tsx
- src/components/OnboardingScreen.tsx
- src/components/PrayerTable.tsx
- src/components/QiblaCompass.tsx
- src/components/SettingsModal.tsx
- src/components/TravelPromptDialog.tsx
- android/app/src/main/AndroidManifest.xml
- android/app/build.gradle
- ios/App/App/Info.plist
- docs/audits/2026-05-02-production-readiness.md

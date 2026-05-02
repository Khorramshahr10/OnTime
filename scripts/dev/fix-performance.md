# Performance fixes — code-splitting and context memoization

## Spec

Two focused performance improvements identified in the production-readiness audit. Cities lazy-loading was flagged but is **already implemented** in `CitySearch.tsx` (it uses dynamic `import('../data/cities')`), so that's not in scope here.

### Improvement 1 — Code-split heavy modal components

`App.tsx` statically imports `SettingsModal`, `QiblaCompass`, and `Dashboard`. Each is large (`SettingsModal` is ~1900 lines, `QiblaCompass` includes an iframe map, `Dashboard` is its own multi-screen surface). They ship in the initial bundle even though they're only shown on user interaction.

**Fix:** convert these three to `React.lazy` + `Suspense` so they're loaded on demand.

In `src/App.tsx`:

1. Replace the static imports:
   ```ts
   import { QiblaCompass } from './components/QiblaCompass';
   import { SettingsModal } from './components/SettingsModal';
   import { Dashboard } from './components/Dashboard';
   ```
   with:
   ```ts
   import { lazy, Suspense } from 'react';
   const QiblaCompass = lazy(() => import('./components/QiblaCompass').then(m => ({ default: m.QiblaCompass })));
   const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
   const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
   ```

2. Wrap each usage of `<QiblaCompass>`, `<SettingsModal>`, `<Dashboard>` with a single `<Suspense fallback={...}>` if they share the same conditional render guard, OR with three separate Suspense boundaries if they render in different places. Use a minimal fallback like:
   ```tsx
   <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-[var(--color-bg)]"><span className="text-[var(--color-muted)]">Loading…</span></div>}>
     {/* the lazy component */}
   </Suspense>
   ```

3. Don't change anything else in `App.tsx`. Don't refactor unrelated logic. If a usage of a lazy component renders inside an existing branch (e.g., `{showSettings && <SettingsModal ... />}`), keep the branch and add Suspense inside it.

### Improvement 2 — Memoize SettingsContext value and stabilize updater references

`SettingsContext.tsx` returns a fresh object literal every render with 18 properties (`settings` + 17 updater functions). Every consumer of `useSettings()` therefore re-renders on every provider render, even if they only read `settings.designStyle`.

**Fix:** wrap each updater function in `useCallback` and the provider value in `useMemo`.

Concretely, in `src/context/SettingsContext.tsx`:

1. Wrap each `updateX` function (there are about 17 — find them all by looking at what's in the value object passed to `<SettingsContext.Provider>`) in `useCallback(..., [...deps])`. Use the smallest dep array possible — typically just `[]` for setters that only call `setSettings(prev => ...)` because React guarantees `setSettings` itself is stable.

2. Replace the inline value object with a `useMemo`:
   ```tsx
   const contextValue = useMemo(() => ({
     settings,
     updateCalculationMethod,
     updateAsrCalculation,
     // ...all the updaters
     isLoading,
   }), [settings, isLoading, updateCalculationMethod, updateAsrCalculation, /* ...all updaters */]);

   return (
     <SettingsContext.Provider value={contextValue}>
       {children}
     </SettingsContext.Provider>
   );
   ```

3. Don't split the context into multiple contexts (that's a bigger refactor for a follow-up PR). Stay focused on memoization.

### Improvement 3 — Add React.memo to two heavy components

`PrayerTable` and `IslamicPrayerTable` re-render on every parent render, but they only depend on a small subset of props. Wrap each export in `React.memo`:

```tsx
export const PrayerTable = React.memo(function PrayerTable(props: PrayerTableProps) { ... });
```

(Use the existing function declaration, just wrap with `React.memo`. Add `React` to the import if not already imported — but React 19 with the new JSX transform may not need it. Check the existing import style in the file and follow it.)

### General rules

- No new dependencies.
- No drive-by changes outside the 5 named files (`App.tsx`, `SettingsContext.tsx`, `PrayerTable.tsx`, `IslamicPrayerTable.tsx`).
- Match existing formatting, indentation, and naming.
- The expected effect is: initial JS bundle smaller (Settings/Qibla/Dashboard chunked), and consumers of `useSettings` re-render fewer times. We're not adding a benchmark; the existing tests must continue to pass.

## Files in scope

- src/App.tsx
- src/context/SettingsContext.tsx
- src/components/PrayerTable.tsx
- src/components/IslamicPrayerTable.tsx

## Files NOT inlined but available on request

- src/components/SettingsModal.tsx (1900+ lines — ask only if you need to verify the named export shape; we already know `SettingsModal` is a named export based on App.tsx's existing import)
- src/components/QiblaCompass.tsx
- src/components/Dashboard.tsx
- any test file under src/__tests__/

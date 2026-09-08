import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { AllProviders } from '../test/helpers';
import { usePrayerTimes } from '../hooks/usePrayerTimes';
import { useCountdown } from '../hooks/useCountdown';

/**
 * MH-8: usePrayerTimes kept the countdown in state and App calls it, so App
 * re-rendered once a second — and with it HomeGlobeScreen, a plain function
 * export, which rebuilt its `data` object and re-ran SceneHost's [data] effect
 * every second for the life of the app. The applyKey gate absorbed the
 * expensive scene work, but none of it needed doing, and v1.8.0 made the globe
 * the default view for everyone.
 *
 * The countdown now lives in useCountdown, next to the components that show
 * it. These two tests are the pair that matters: the hook App calls has to go
 * quiet, and the hook the display calls has to keep ticking.
 */
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 3, 24, 10, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('what App re-renders for (MH-8)', () => {
  it('does not re-render once a second just to keep a countdown', async () => {
    let renders = 0;
    function Probe() {
      usePrayerTimes();
      useEffect(() => { renders++; });
      return null;
    }

    await act(async () => {
      render(<AllProviders><Probe /></AllProviders>);
    });

    renders = 0;
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });

    // Four seconds used to be four renders of the whole tree.
    expect(renders).toBe(0);
  });

  it('still ticks for the component that displays the countdown', async () => {
    const seen: number[] = [];
    // Fixed outside the component: recomputing it per render would move the
    // target with the clock and the remaining time would never fall.
    const target = new Date(Date.now() + 60_000);
    function Probe() {
      const countdown = useCountdown(target);
      useEffect(() => { seen.push(countdown.totalSeconds); });
      return null;
    }

    await act(async () => {
      render(<AllProviders><Probe /></AllProviders>);
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[0]).toBeGreaterThan(seen[seen.length - 1]);
  });
});

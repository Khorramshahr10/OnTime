import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { AllProviders } from '../test/helpers';
import { usePrayerTimes } from '../hooks/usePrayerTimes';
import { getTimeUntil } from '../services/prayerService';

/**
 * Regression guard for the prayer-boundary render storm.
 *
 * `getTimeUntil` floors to whole seconds, so during the *entire* final second
 * before a prayer it reports `totalSeconds: 0` while the target is still ahead.
 * `usePrayerTimes` used to read that as "the countdown finished" and call
 * `setDate(new Date())`, which rebuilt the same instant as a NEW Date object.
 * The countdown effect was keyed on that object's identity, so it tore down,
 * re-registered, ran `updateCountdown()` synchronously, saw 0 again and set the
 * date again — spinning until the wall clock crossed the prayer time (roughly a
 * thousand iterations a second, six times a day). Every iteration also gave
 * `prayers` a new array identity, re-firing the prayer tables' tracking reload.
 *
 * The refresh is now gated on the raw millisecond diff and the effect is keyed
 * on a primitive, so crossing a boundary recalculates exactly once.
 *
 * The per-second countdown has since moved out of usePrayerTimes into
 * useCountdown (MH-8), and the hook now arms a timeout at the boundary with a
 * five-second watchdog behind it rather than polling every second. So the
 * probe reads the remaining time as a pure call instead of subscribing to the
 * countdown: the render count then measures usePrayerTimes alone, which is the
 * quantity the storm inflated.
 */
interface Sample {
  nextMs: number | null;
  totalSeconds: number;
}

function Probe({ onCommit }: { onCommit: (sample: Sample) => void }) {
  const data = usePrayerTimes();
  // No dependency array: this runs after every commit, so the call count is the
  // number of renders that reached the screen — the quantity the storm inflated.
  useEffect(() => {
    onCommit({
      nextMs: data.nextPrayerTime?.getTime() ?? null,
      totalSeconds: data.nextPrayerTime ? getTimeUntil(data.nextPrayerTime).totalSeconds : 0,
    });
  });
  return null;
}

async function mountProbe(onCommit: (sample: Sample) => void) {
  await act(async () => {
    render(
      <AllProviders>
        <Probe onCommit={onCommit} />
      </AllProviders>,
    );
  });
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('countdown behaviour across a prayer boundary (PM-1)', () => {
  // jsdom does not implement window.matchMedia, which ThemeContext needs.
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds still in the final second, then recalculates once when the prayer passes', async () => {
    vi.setSystemTime(new Date(2026, 3, 24, 10, 0, 0));

    const samples: Sample[] = [];
    await mountProbe((s) => samples.push(s));

    // Read the target the hook actually resolved rather than assuming one: the
    // coordinates come from LocationProvider, not from this test.
    const target = samples.at(-1)!.nextMs!;
    expect(target).toBeTruthy();

    // Park inside the final second before it. getTimeUntil already floors to 0
    // from here, which is what used to be mistaken for "finished".
    vi.setSystemTime(new Date(target - 1500));

    // Phase 1: one tick lands at T-500ms. The target has not passed, so the
    // hook must not recalculate. It no longer re-renders here at all — with
    // the countdown moved out there is nothing left in this hook that ticks —
    // so the strongest form of the old "fewer than ten renders" assertion is
    // available: none.
    samples.length = 0;
    await tick(1000);

    expect(samples).toHaveLength(0);

    // Phase 2: cross the boundary. Exactly one recalculation, to the next prayer.
    samples.length = 0;
    await tick(6000);

    expect(samples.length).toBeLessThan(25);
    expect(samples.at(-1)!.nextMs!).toBeGreaterThan(target);
    expect(samples.at(-1)!.totalSeconds).toBeGreaterThan(0);
  });

  it('moves on to the following prayer instead of counting negative', async () => {
    vi.setSystemTime(new Date(2026, 3, 24, 10, 0, 0));

    const samples: Sample[] = [];
    await mountProbe((s) => samples.push(s));
    const target = samples.at(-1)!.nextMs!;
    expect(target).toBeTruthy();

    vi.setSystemTime(new Date(target + 100));
    samples.length = 0;
    await tick(6000);

    expect(samples.at(-1)!.totalSeconds).toBeGreaterThan(0);
    expect(samples.at(-1)!.nextMs!).toBeGreaterThan(target);
    expect(samples.length).toBeLessThan(25);
  });
});

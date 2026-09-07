import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { AllProviders } from '../test/helpers';
import { usePrayerTimes } from '../hooks/usePrayerTimes';

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
      totalSeconds: data.countdown.totalSeconds,
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
    // hook must not recalculate — nextPrayerTime stays the same instant.
    samples.length = 0;
    await tick(1000);

    expect(samples.at(-1)!.nextMs).toBe(target);
    expect(samples.length).toBeLessThan(10);

    // Phase 2: cross the boundary. Exactly one recalculation, to the next prayer.
    samples.length = 0;
    await tick(2000);

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
    await tick(1000);

    expect(samples.at(-1)!.totalSeconds).toBeGreaterThan(0);
    expect(samples.at(-1)!.nextMs!).toBeGreaterThan(target);
    expect(samples.length).toBeLessThan(25);
  });
});

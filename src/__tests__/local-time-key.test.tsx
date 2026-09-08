import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { App } from '@capacitor/app';
import { useLocalTimeKey } from '../hooks/useLocalTimeKey';

/**
 * PM-7 and MH-3. The hook is the app's only DST-specific refresh path, and it
 * used to be a no-op in both halves: it compared a value that cannot change
 * across a transition, and it leaked its native listener when unmounted before
 * the plugin's promise resolved.
 */
let keys: string[] = [];

function Probe() {
  keys.push(useLocalTimeKey());
  return null;
}

let offsetMinutes = 300;

beforeEach(() => {
  keys = [];
  offsetMinutes = 300;
  // The zone id stays "America/New_York" across a transition while the offset
  // moves 300 -> 240. Only the offset can tell the two apart.
  vi.spyOn(Date.prototype, 'getTimezoneOffset').mockImplementation(() => offsetMinutes);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useLocalTimeKey', () => {
  it('changes when the zone steps on or off DST, with the zone id unchanged', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Probe />);
    const before = keys[keys.length - 1];

    offsetMinutes = 240;
    await act(async () => {
      vi.advanceTimersByTime(61 * 60 * 1000);
    });

    const after = keys[keys.length - 1];
    expect(after).not.toBe(before);
    // Both sides still name the same zone — which is exactly why comparing the
    // zone id alone could never notice.
    expect(after.split('|')[0]).toBe(before.split('|')[0]);
  });

  it('holds steady while nothing about local time has changed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Probe />);
    const before = keys[keys.length - 1];

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);
    });

    expect(keys[keys.length - 1]).toBe(before);
  });

  it('removes the native listener that resolves after unmount', async () => {
    const remove = vi.fn();
    let resolveHandle: (h: { remove: () => void }) => void = () => {};
    vi.mocked(App.addListener).mockReturnValue(
      new Promise((res) => { resolveHandle = res as typeof resolveHandle; }) as ReturnType<
        typeof App.addListener
      >
    );

    const view = render(<Probe />);
    // Unmount while addListener is still in flight: cleanup reads a handle
    // that has not been assigned yet, so the old `handle?.remove()` was a
    // silent no-op and the native listener outlived the hook.
    view.unmount();

    await act(async () => {
      resolveHandle({ remove });
    });

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

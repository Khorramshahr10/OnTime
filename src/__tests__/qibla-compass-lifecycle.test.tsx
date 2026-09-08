import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';

/**
 * The native compass is a singleton — one SensorManager registration behind a
 * plugin object — while useQibla is a hook any number of components can call.
 * These tests pin the three ways that went wrong: a start that outlives the
 * component that asked for it (LQ-9), a location change that never reaches the
 * native declination (LQ-14), and two consumers handing the sensor between
 * them (LQ-13).
 */
const native = vi.hoisted(() => ({
  starts: [] as Array<{ latitude: number; longitude: number }>,
  stops: 0,
  listenerAdds: 0,
  listenerRemoves: 0,
  /** Resolves the pending addListener; set while gateAddListener is true. */
  releaseAdd: null as null | (() => void),
  gateAddListener: false,
  /** Makes the next startCompass reject, the way a missing sensor service does. */
  failNextStart: false,
}));

vi.mock('../plugins/athanPlugin', () => ({
  AthanPlugin: {
    addListener: () => {
      native.listenerAdds++;
      const handle = { remove: () => { native.listenerRemoves++; } };
      if (!native.gateAddListener) return Promise.resolve(handle);
      return new Promise((resolve) => {
        native.releaseAdd = () => resolve(handle);
      });
    },
    startCompass: (opts: { latitude: number; longitude: number }) => {
      native.starts.push(opts);
      if (native.failNextStart) {
        native.failNextStart = false;
        return Promise.reject(new Error('Sensor service not available'));
      }
      return Promise.resolve();
    },
    stopCompass: () => {
      native.stops++;
      return Promise.resolve();
    },
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn().mockResolvedValue(undefined) },
  ImpactStyle: { Medium: 'MEDIUM' },
}));

const coords = vi.hoisted(() => ({ latitude: 43.6532, longitude: -79.3832 }));

vi.mock('../context/LocationContext', () => ({
  useLocation: () => ({ location: { coordinates: coords, cityName: 'Toronto' } }),
}));

import { useQibla } from '../hooks/useQibla';
import { useQiblaHeading } from '../hooks/useQiblaHeading';

/**
 * HomeGlobeScreen's shape: start when the condition holds, stop when it does
 * not, and no cleanup function at all — so unmounting leaves the sensor to
 * useQibla's own internal teardown.
 */
function BareConsumer({ on }: { on: boolean }) {
  const { startListening, stopListening } = useQibla();
  useEffect(() => {
    if (on) startListening();
    else stopListening();
  }, [on, startListening, stopListening]);
  return null;
}

/** QiblaCompass's shape, via the real hook that owns the effect. */
function HeadingConsumer({ on }: { on: boolean }) {
  useQiblaHeading(on);
  return null;
}

beforeEach(() => {
  native.starts = [];
  native.stops = 0;
  native.listenerAdds = 0;
  native.listenerRemoves = 0;
  native.releaseAdd = null;
  native.gateAddListener = false;
  native.failNextStart = false;
  coords.latitude = 43.6532;
  coords.longitude = -79.3832;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useQibla start/stop races', () => {
  it('tears down a start that only lands after the component unmounted (LQ-9)', async () => {
    native.gateAddListener = true;
    const view = render(<BareConsumer on />);
    await act(async () => {});
    expect(native.releaseAdd).not.toBeNull();

    // Unmount mid-registration, with no consumer cleanup to call
    // stopListening. useQibla's own unmount effect clears cleanupRef — which
    // is still null during `await addListener(...)` — so nothing it does can
    // reach the listener that is about to exist unless the pending start is
    // told the owner has gone.
    view.unmount();
    await act(async () => { native.releaseAdd!(); });

    expect(native.listenerAdds).toBe(1);
    expect(native.listenerRemoves).toBe(1);
    expect(native.stops).toBeGreaterThan(0);
  });

  it('does not strand the reference count when the native start fails', async () => {
    // startCompass rejects when the sensor service is unavailable. If the
    // count is left incremented, every later start sees "someone else already
    // has it" and skips the native call — turning a transient sensor failure
    // into a compass that stays dead until the process restarts.
    native.failNextStart = true;
    const first = render(<BareConsumer on />);
    await act(async () => {});
    first.unmount();
    await act(async () => {});

    const second = render(<BareConsumer on />);
    await act(async () => {});

    expect(native.starts).toHaveLength(2);
    second.unmount();
    await act(async () => {});
    // And the orphaned JS listener from the failed attempt went with it —
    // nothing is left registered once both consumers are gone.
    expect(native.listenerRemoves).toBe(native.listenerAdds);
  });
});

describe('useQiblaHeading and a moving location (LQ-14)', () => {
  it('restarts the native compass so the declination follows the user', async () => {
    const view = render(<HeadingConsumer on />);
    await act(async () => {});
    expect(native.starts).toHaveLength(1);
    expect(native.starts[0].latitude).toBeCloseTo(43.6532, 4);

    coords.latitude = 51.5074;
    coords.longitude = -0.1278;
    await act(async () => { view.rerender(<HeadingConsumer on />); });

    // Native computes magnetic declination from the coordinates it was started
    // with, and startCompass early-returns while already listening — so
    // without a real restart the declination stays at its first-start value
    // and the heading is out by up to 10-20 degrees.
    expect(native.starts.length).toBeGreaterThan(1);
    expect(native.starts[native.starts.length - 1].latitude).toBeCloseTo(51.5074, 4);
  });
});

describe('two consumers sharing one native compass (LQ-13)', () => {
  /** Ground view and the qibla overlay both drive useQibla; closing the
   *  overlay hands the sensor from one to the other. */
  function Pair({ ground, overlay }: { ground: boolean; overlay: boolean }) {
    return (
      <>
        <BareConsumer on={ground} />
        <HeadingConsumer on={overlay} />
      </>
    );
  }

  it('leaves the sensor running when one consumer takes over from the other', async () => {
    const view = render(<Pair ground={false} overlay />);
    await act(async () => {});
    expect(native.starts).toHaveLength(1);

    // The handover, driven as two commits — the order that actually goes
    // wrong. Within one commit React runs every cleanup before every effect,
    // so the leaving consumer stops first and the arriving one starts after;
    // but `covered` and the overlay's own mount are separate state, so the
    // arriving consumer can equally well start first. stopCompassListener()
    // does a blanket unregisterListener(this), which in that order killed the
    // sensor the other instance had just started.
    await act(async () => { view.rerender(<Pair ground overlay />); });
    await act(async () => { view.rerender(<Pair ground overlay={false} />); });

    expect(native.stops).toBe(0);
    // And no redundant re-registration on the way through.
    expect(native.starts).toHaveLength(1);
  });

  it('stops the sensor once the last consumer lets go', async () => {
    const view = render(<Pair ground={false} overlay />);
    await act(async () => {});
    await act(async () => { view.rerender(<Pair ground overlay />); });
    await act(async () => { view.rerender(<Pair ground overlay={false} />); });
    await act(async () => { view.rerender(<Pair ground={false} overlay={false} />); });

    expect(native.stops).toBe(1);
  });
});

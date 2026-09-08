import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { Geolocation } from '@capacitor/geolocation';
import { LocationProvider, useLocation } from '../context/LocationContext';
import type { LocationData } from '../types';

/**
 * Android 12+ lets the user grant "Approximate location" only. Capacitor
 * reports that as `location: 'denied'` — because that alias needs BOTH coarse
 * and fine — alongside `coarseLocation: 'granted'`. The app read only
 * `location`, treated the grant as a refusal, and stayed on its default city:
 * a dead end on the second step of onboarding, for a fix that is far more
 * accurate than prayer times need.
 */
const COORDS = { latitude: 43.6532, longitude: -79.3832 };

type PermissionResult = Awaited<ReturnType<typeof Geolocation.checkPermissions>>;

const perms = (location: string, coarseLocation: string) =>
  ({ location, coarseLocation }) as unknown as PermissionResult;

function Harness({ onReady }: { onReady: (refresh: () => Promise<LocationData | undefined>) => void }) {
  const { refreshLocation } = useLocation();
  // Captured from an effect rather than during render, so the probe stays pure.
  useEffect(() => {
    onReady(refreshLocation);
  });
  return null;
}

async function mount(): Promise<() => Promise<LocationData | undefined>> {
  let refresh!: () => Promise<LocationData | undefined>;
  await act(async () => {
    render(
      <LocationProvider>
        <Harness onReady={(r) => { refresh = r; }} />
      </LocationProvider>,
    );
  });
  return refresh;
}

describe('location permission handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reverse geocoding would otherwise hit the network.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          display_name: 'Queen Street West, Toronto, ON, Canada',
          address: { city: 'Toronto', country_code: 'ca' },
        }),
      }),
    );
    vi.mocked(Geolocation.getCurrentPosition).mockResolvedValue({ coords: COORDS } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts an "Approximate location" grant instead of treating it as denied', async () => {
    vi.mocked(Geolocation.checkPermissions).mockResolvedValue(perms('denied', 'granted'));
    vi.mocked(Geolocation.requestPermissions).mockResolvedValue(perms('denied', 'granted'));

    const refreshLocation = await mount();
    let result: LocationData | undefined;
    await act(async () => {
      result = await refreshLocation();
    });

    expect(result).toBeDefined();
    expect(result!.coordinates).toEqual(COORDS);
    // High accuracy requires ACCESS_FINE_LOCATION, which this grant lacks — so
    // asking for it would sit until the timeout instead of returning the fix.
    expect(vi.mocked(Geolocation.getCurrentPosition)).toHaveBeenCalledWith(
      expect.objectContaining({ enableHighAccuracy: false }),
    );
  });

  it('does not re-prompt when a usable grant is already held', async () => {
    vi.mocked(Geolocation.checkPermissions).mockResolvedValue(perms('denied', 'granted'));

    const refreshLocation = await mount();
    await act(async () => {
      await refreshLocation();
    });

    expect(Geolocation.requestPermissions).not.toHaveBeenCalled();
  });

  it('still requests high accuracy when fine location is granted', async () => {
    vi.mocked(Geolocation.checkPermissions).mockResolvedValue(perms('granted', 'granted'));

    const refreshLocation = await mount();
    await act(async () => {
      await refreshLocation();
    });

    expect(vi.mocked(Geolocation.getCurrentPosition)).toHaveBeenCalledWith(
      expect.objectContaining({ enableHighAccuracy: true }),
    );
  });

  it('reports a denial only when neither accuracy level is granted', async () => {
    vi.mocked(Geolocation.checkPermissions).mockResolvedValue(perms('denied', 'denied'));
    vi.mocked(Geolocation.requestPermissions).mockResolvedValue(perms('denied', 'denied'));

    const refreshLocation = await mount();
    let result: LocationData | undefined;
    await act(async () => {
      result = await refreshLocation();
    });

    expect(result).toBeUndefined();
    expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe('a stalled reverse geocode does not hold the GPS fix hostage', () => {
  // Coordinates used to be applied only *after* the Nominatim lookup resolved,
  // and that fetch had no timeout. On a captive portal or a dead connection the
  // app sat on "Finding your location…" with a perfectly good fix in memory, and
  // prayer times stayed on the default city indefinitely.

  /** Resolves nothing; rejects if and when the signal aborts, like a real fetch. */
  function stallingFetch() {
    return vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
  }

  let latest: LocationData | undefined;
  let refresh: (() => Promise<LocationData | undefined>) | undefined;

  function Probe({ onSample }: { onSample: (l: LocationData, r: () => Promise<LocationData | undefined>) => void }) {
    const { location, refreshLocation } = useLocation();
    // Captured from an effect so the probe stays pure during render.
    useEffect(() => {
      onSample(location, refreshLocation);
    });
    return null;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    latest = undefined;
    refresh = undefined;
    vi.mocked(Geolocation.checkPermissions).mockResolvedValue(perms('granted', 'granted'));
    vi.mocked(Geolocation.getCurrentPosition).mockResolvedValue({ coords: COORDS } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function mountProbe() {
    const fetchMock = stallingFetch();
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => {
      render(
        <LocationProvider>
          <Probe onSample={(l, r) => { latest = l; refresh = r; }} />
        </LocationProvider>,
      );
    });
    return fetchMock;
  }

  it('applies the coordinates immediately, with the name still pending', async () => {
    await mountProbe();

    // Deliberately not awaited: the lookup never settles.
    await act(async () => {
      void refresh!();
      await Promise.resolve();
    });

    expect(latest!.coordinates).toEqual(COORDS);
    expect(latest!.cityName).toBe('Locating…');
  });

  it('passes an abort signal and gives up after the timeout', async () => {
    const fetchMock = await mountProbe();

    await act(async () => {
      void refresh!();
      await Promise.resolve();
    });

    const init = fetchMock.mock.calls[0]?.[1] as { signal?: AbortSignal } | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    // Five seconds later the lookup is abandoned and the fix keeps a usable name.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(latest!.coordinates).toEqual(COORDS);
    expect(latest!.cityName).toBe('Current Location');
  });
});

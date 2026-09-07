import { render, act, fireEvent } from '@testing-library/react';
import { Preferences } from '@capacitor/preferences';
import { ThemeProvider } from '../context/ThemeContext';
import { SettingsProvider } from '../context/SettingsContext';
import { LocationProvider } from '../context/LocationContext';
import { TravelProvider, useTravel } from '../context/TravelContext';
import type { TravelState } from '../types';

// jsdom does not implement window.matchMedia — provide a minimal stub (needed by ThemeProvider)
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

import { useSettings } from '../context/SettingsContext';

function TravelInspector({ onState }: { onState: (s: TravelState) => void }) {
  const { travelState } = useTravel();
  const { isLoading } = useSettings();
  // Only capture once settings have finished loading from storage
  if (!isLoading) onState(travelState);
  return null;
}

function renderTravel(savedSettings: Record<string, unknown>, savedLocation?: { latitude: number; longitude: number; cityName: string }) {
  vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
    if (key === 'ontime_settings') return { value: JSON.stringify(savedSettings) };
    if (key === 'ontime_location' && savedLocation) {
      return { value: JSON.stringify({ coordinates: { latitude: savedLocation.latitude, longitude: savedLocation.longitude }, cityName: savedLocation.cityName }) };
    }
    return { value: null };
  });

  let captured: TravelState | null = null;

  const result = render(
    <ThemeProvider>
      <SettingsProvider>
        <LocationProvider>
          <TravelProvider>
            <TravelInspector onState={(s) => { captured = s; }} />
          </TravelProvider>
        </LocationProvider>
      </SettingsProvider>
    </ThemeProvider>,
  );

  return { ...result, getCaptured: () => captured };
}

describe('User story: The app detects when I am traveling and adjusts my prayers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is not traveling when travel feature is disabled', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel({
        travel: { enabled: false, homeBase: null, override: 'auto', distanceThresholdKm: 88.7, jamaDhuhrAsr: false, jamaMaghribIsha: false, maxTravelDays: 0, travelStartDate: null, autoConfirmed: false },
      });
    });
    const captured = r.getCaptured();
    expect(captured!.isTraveling).toBe(false);
    expect(captured!.qasr.dhuhr).toBe(false);
  });

  it('is not traveling when no home base is set', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel({
        travel: { enabled: true, homeBase: null, override: 'auto', distanceThresholdKm: 88.7, jamaDhuhrAsr: false, jamaMaghribIsha: false, maxTravelDays: 0, travelStartDate: null, autoConfirmed: false },
      });
    });
    const captured = r.getCaptured();
    expect(captured!.isTraveling).toBe(false);
  });

  it('activates travel with qasr when force_on override is set', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel({
        travel: {
          enabled: true,
          homeBase: { coordinates: { latitude: 43.6532, longitude: -79.3832 }, cityName: 'Toronto' },
          override: 'force_on',
          distanceThresholdKm: 88.7,
          jamaDhuhrAsr: false,
          jamaMaghribIsha: false,
          maxTravelDays: 0,
          travelStartDate: '2026-04-24',
          autoConfirmed: false,
        },
      });
    });
    const captured = r.getCaptured();
    expect(captured!.isTraveling).toBe(true);
    expect(captured!.qasr.dhuhr).toBe(true);
    expect(captured!.qasr.asr).toBe(true);
    expect(captured!.qasr.isha).toBe(true);
  });

  it('deactivates travel when force_off override is set even if far from home', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel(
        {
          travel: {
            enabled: true,
            homeBase: { coordinates: { latitude: 21.4225, longitude: 39.8262 }, cityName: 'Mecca' },
            override: 'force_off',
            distanceThresholdKm: 88.7,
            jamaDhuhrAsr: false,
            jamaMaghribIsha: false,
            maxTravelDays: 0,
            travelStartDate: null,
            autoConfirmed: false,
          },
        },
        { latitude: 43.6532, longitude: -79.3832, cityName: 'Toronto' },
      );
    });
    const captured = r.getCaptured();
    expect(captured!.isTraveling).toBe(false);
  });

  it('enables jama for Dhuhr+Asr when configured', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel({
        travel: {
          enabled: true,
          homeBase: { coordinates: { latitude: 43.6532, longitude: -79.3832 }, cityName: 'Toronto' },
          override: 'force_on',
          distanceThresholdKm: 88.7,
          jamaDhuhrAsr: true,
          jamaMaghribIsha: false,
          maxTravelDays: 0,
          travelStartDate: '2026-04-24',
          autoConfirmed: false,
        },
      });
    });
    const captured = r.getCaptured();
    expect(captured!.jamaDhuhrAsr).toBe(true);
    expect(captured!.jamaMaghribIsha).toBe(false);
  });

  it('enables jama for Maghrib+Isha when configured', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel({
        travel: {
          enabled: true,
          homeBase: { coordinates: { latitude: 43.6532, longitude: -79.3832 }, cityName: 'Toronto' },
          override: 'force_on',
          distanceThresholdKm: 88.7,
          jamaDhuhrAsr: false,
          jamaMaghribIsha: true,
          maxTravelDays: 0,
          travelStartDate: '2026-04-24',
          autoConfirmed: false,
        },
      });
    });
    const captured = r.getCaptured();
    expect(captured!.jamaDhuhrAsr).toBe(false);
    expect(captured!.jamaMaghribIsha).toBe(true);
  });
});

describe('User story: the app offers travel mode when I have gone far from home', () => {
  const TORONTO = { latitude: 43.6532, longitude: -79.3832, cityName: 'Toronto' };
  const homeInMecca = (over: Record<string, unknown> = {}) => ({
    travel: {
      enabled: false,
      homeBase: { coordinates: { latitude: 21.4225, longitude: 39.8262 }, cityName: 'Mecca' },
      override: 'auto',
      distanceThresholdKm: 88.7,
      jamaDhuhrAsr: false,
      jamaMaghribIsha: false,
      maxTravelDays: 0,
      travelStartDate: null,
      autoConfirmed: false,
      ...over,
    },
  });

  it('offers travel when far from home even though the switch was never turned on', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => { r = renderTravel(homeInMecca(), TORONTO); });
    const captured = r.getCaptured()!;
    // The offer is raised by distance alone — this is the case that used to be
    // unreachable, because detection sat behind the Travel Mode switch.
    expect(captured.travelPending).toBe(true);
    // ...but nothing is shortened until it is accepted.
    expect(captured.isTraveling).toBe(false);
    expect(captured.qasr.dhuhr).toBe(false);
  });

  it('does not offer while still near home', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel(homeInMecca(), { latitude: 21.43, longitude: 39.83, cityName: 'Mecca' });
    });
    expect(r.getCaptured()!.travelPending).toBe(false);
  });

  it('stays quiet once the offer has been dismissed', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => { r = renderTravel(homeInMecca({ promptDismissed: true }), TORONTO); });
    const captured = r.getCaptured()!;
    expect(captured.travelPending).toBe(false);
    expect(captured.isTraveling).toBe(false);
  });

  it('stays quiet when travel has been forced off', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => { r = renderTravel(homeInMecca({ override: 'force_off' }), TORONTO); });
    expect(r.getCaptured()!.travelPending).toBe(false);
  });

  it('shortens prayers once the offer has been accepted', async () => {
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel(homeInMecca({ enabled: true, autoConfirmed: true }), TORONTO);
    });
    const captured = r.getCaptured()!;
    expect(captured.isTraveling).toBe(true);
    expect(captured.isAutoDetected).toBe(true);
    expect(captured.qasr.dhuhr).toBe(true);
    expect(captured.travelPending).toBe(false);
  });

  it('does not shorten prayers on a fresh trip from a stale confirmation once home', async () => {
    // Arriving home clears the previous trip's confirmation, so the next
    // journey is offered rather than silently switching qasr on.
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel(
        homeInMecca({ enabled: true, autoConfirmed: true }),
        { latitude: 21.43, longitude: 39.83, cityName: 'Mecca' },
      );
    });
    expect(r.getCaptured()!.isTraveling).toBe(false);
  });

  // A trip that is already away from home and forced on, so the only thing
  // under test is the maxTravelDays expiry. Home base is Toronto while the
  // location defaults to Makkah, which keeps the "arrived home" reset — and so
  // the clearing of travelStartDate — out of the way.
  function awayTrip(overrides: Record<string, unknown> = {}) {
    return {
      travel: {
        enabled: true,
        homeBase: { coordinates: { latitude: 43.6532, longitude: -79.3832 }, cityName: 'Toronto' },
        override: 'force_on',
        distanceThresholdKm: 88.7,
        jamaDhuhrAsr: false,
        jamaMaghribIsha: false,
        maxTravelDays: 4,
        travelStartDate: null,
        autoConfirmed: true,
        promptDismissed: false,
        ...overrides,
      },
    };
  }

  it('treats maxTravelDays as exactly that many 24-hour days', async () => {
    // travelStartDate used to be stored as a bare UTC date, which `new Date()`
    // parsed back as UTC midnight — rounding the start of the trip down by
    // however much of the UTC day had already elapsed. "4 days" then allowed
    // between 3.00 and 4.00 real days depending on the time of day, in every
    // timezone, silently dropping up to a day of a religiously-defined
    // allowance.
    const HOUR = 60 * 60 * 1000;
    const limit = 4 * 24 * HOUR;

    const startedJustUnderLimit = new Date(Date.now() - limit + HOUR).toISOString();
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel(awayTrip({ travelStartDate: startedJustUnderLimit }));
    });
    expect(r.getCaptured()!.isTraveling).toBe(true);

    const startedJustOverLimit = new Date(Date.now() - limit - HOUR).toISOString();
    await act(async () => {
      r = renderTravel(awayTrip({ travelStartDate: startedJustOverLimit }));
    });
    expect(r.getCaptured()!.isTraveling).toBe(false);
    expect(r.getCaptured()!.qasr.dhuhr).toBe(false);
  });

  it('expires a trip mid-session with no settings or location change', async () => {
    // The expiry used to be computed inside a useMemo keyed on settings,
    // location and dismissed. None of those move with the passage of time, so a
    // long-lived session never expired the trip — the limit only took effect on
    // an app restart or the next unrelated settings edit.
    vi.useFakeTimers();
    try {
      const HOUR = 60 * 60 * 1000;
      const startedOneHourAgo = new Date(Date.now() - HOUR).toISOString();

      let r!: ReturnType<typeof renderTravel>;
      await act(async () => {
        r = renderTravel(awayTrip({ travelStartDate: startedOneHourAgo }));
      });
      expect(r.getCaptured()!.isTraveling).toBe(true);

      // Three more days pass. Nothing is touched.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(72 * HOUR);
      });
      expect(r.getCaptured()!.isTraveling).toBe(true);

      // The four-day limit is reached, and the trip ends by itself.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(24 * HOUR);
      });
      expect(r.getCaptured()!.isTraveling).toBe(false);
      expect(r.getCaptured()!.qasr.dhuhr).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still honours a bare-date travelStartDate written by an older build', async () => {
    // The field stayed a string, so pre-existing values have to keep working:
    // "2020-01-01" parses as UTC midnight and is long expired.
    let r!: ReturnType<typeof renderTravel>;
    await act(async () => {
      r = renderTravel(awayTrip({ travelStartDate: '2020-01-01' }));
    });
    expect(r.getCaptured()!.isTraveling).toBe(false);
  });

  it('stores the trip start as a real instant, not a bare UTC date', async () => {
    // The write side of the same bug: `new Date().toISOString().split('T')[0]`
    // stored a UTC calendar date, which `new Date()` then parsed back as UTC
    // midnight — rounding the start of the trip down by up to 24 hours.
    function ConfirmButton() {
      const { confirmTravel } = useTravel();
      return <button onClick={confirmTravel}>confirm trip</button>;
    }

    vi.mocked(Preferences.get).mockImplementation(async ({ key }) =>
      key === 'ontime_settings' ? { value: JSON.stringify(awayTrip()) } : { value: null },
    );
    vi.mocked(Preferences.set).mockResolvedValue(undefined);

    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <ThemeProvider>
          <SettingsProvider>
            <LocationProvider>
              <TravelProvider>
                <ConfirmButton />
              </TravelProvider>
            </LocationProvider>
          </SettingsProvider>
        </ThemeProvider>,
      );
    });

    await act(async () => {
      fireEvent.click(view.getByText('confirm trip'));
    });

    const writes = vi
      .mocked(Preferences.set)
      .mock.calls.map(([arg]) => arg)
      .filter((arg) => arg.key === 'ontime_settings');
    expect(writes.length).toBeGreaterThan(0);

    const saved = JSON.parse(writes[writes.length - 1].value).travel.travelStartDate;
    expect(typeof saved).toBe('string');
    // A full ISO timestamp rather than "YYYY-MM-DD"...
    expect(saved).toContain('T');
    // ...holding the instant the trip was confirmed, not the start of a UTC day.
    expect(Math.abs(Date.now() - new Date(saved).getTime())).toBeLessThan(60_000);
  });
});

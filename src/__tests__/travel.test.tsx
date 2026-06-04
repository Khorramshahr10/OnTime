import { render, act } from '@testing-library/react';
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

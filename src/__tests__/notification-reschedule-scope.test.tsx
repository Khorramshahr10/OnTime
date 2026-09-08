import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Capacitor } from '@capacitor/core';
import { AllProviders } from '../test/helpers';
import { useNotifications } from '../hooks/useNotifications';
import { useSettings } from '../context/SettingsContext';
import { scheduleNotifications } from '../services/notificationService';

/**
 * NT-17: `reschedule` depended on the whole `settings` object, and
 * SettingsContext produces a fresh object on every update. So changing the
 * theme, the distance unit, the design style, the home view or the previous
 * locations tore down and rebuilt all ~80 prayer alarms and re-ran a
 * permission check — two unrelated toggles inside a second meant two full
 * cancel/rebuild cycles.
 */
vi.mock('../services/notificationService', () => ({
  scheduleNotifications: vi.fn().mockResolvedValue(undefined),
  scheduleJumuahNotifications: vi.fn().mockResolvedValue(undefined),
  scheduleSurahKahfNotifications: vi.fn().mockResolvedValue(undefined),
  setupNotificationListeners: vi.fn(() => () => {}),
}));

vi.mock('../plugins/athanPlugin', () => ({
  AthanPlugin: {
    canScheduleExactAlarms: vi.fn().mockResolvedValue({ value: true }),
    isIgnoringBatteryOptimizations: vi.fn().mockResolvedValue({ value: true }),
  },
}));

function useProbe() {
  const notifications = useNotifications(true);
  const settings = useSettings();
  return { notifications, settings };
}

async function mount() {
  const hook = renderHook(useProbe, { wrapper: AllProviders });
  // Twice: the first pass lets the settings and location contexts hydrate,
  // and only then does the schedule debounce start counting.
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  vi.mocked(scheduleNotifications).mockClear();
  return hook;
}

/** Apply a settings change and let the 300ms debounce fall due. */
async function applyAndSettle(fn: () => void) {
  // Two acts on purpose: inside one, React flushes the state update only at
  // the end, so advancing the clock in the same act would run past the
  // debounce before the effect that arms it has re-run.
  await act(async () => { fn(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
}

describe('what a settings change costs the prayer schedule (NT-17)', () => {
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
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('leaves the schedule alone for settings that cannot change it', async () => {
    const hook = await mount();

    await applyAndSettle(() => hook.result.current.settings.updateDistanceUnit('km'));
    await applyAndSettle(() => hook.result.current.settings.updateDesignStyle('islamic'));
    await applyAndSettle(() => hook.result.current.settings.updateHomeView('list'));
    await applyAndSettle(() =>
      hook.result.current.settings.updateDisplay({ showSunnahCard: false })
    );

    expect(scheduleNotifications).not.toHaveBeenCalled();
  });

  it('still rebuilds for the settings that do change it', async () => {
    const hook = await mount();

    await applyAndSettle(() =>
      hook.result.current.settings.updatePrayerNotification('fajr', { reminderMinutes: 25 })
    );
    expect(scheduleNotifications).toHaveBeenCalled();

    vi.mocked(scheduleNotifications).mockClear();
    await applyAndSettle(() =>
      hook.result.current.settings.updateCalculationMethod('MuslimWorldLeague')
    );
    expect(scheduleNotifications).toHaveBeenCalled();

    vi.mocked(scheduleNotifications).mockClear();
    await applyAndSettle(() => hook.result.current.settings.updateAsrCalculation('Hanafi'));
    expect(scheduleNotifications).toHaveBeenCalled();
  });
});

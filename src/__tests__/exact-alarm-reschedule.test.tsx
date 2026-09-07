import { renderHook, act } from '@testing-library/react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { AllProviders } from '../test/helpers';
import { useNotifications } from '../hooks/useNotifications';
import { scheduleNotifications } from '../services/notificationService';
import { AthanPlugin } from '../plugins/athanPlugin';

vi.mock('../services/notificationService', () => ({
  scheduleNotifications: vi.fn().mockResolvedValue(undefined),
  scheduleJumuahNotifications: vi.fn().mockResolvedValue(undefined),
  scheduleSurahKahfNotifications: vi.fn().mockResolvedValue(undefined),
  setupNotificationListeners: vi.fn(() => () => {}),
}));

vi.mock('../plugins/athanPlugin', () => ({
  AthanPlugin: {
    canScheduleExactAlarms: vi.fn(),
    isIgnoringBatteryOptimizations: vi.fn().mockResolvedValue({ value: true }),
  },
}));

/**
 * Android 12+ can deny SCHEDULE_EXACT_ALARM, and on 14+ it is denied by default
 * for a fresh install, so the prayer alarms get armed inexact and can land
 * minutes late. Granting the permission afterwards does NOT upgrade alarms that
 * are already queued — they have to be rebuilt. Nothing did that: the dialog
 * detected the missing permission and sent the user to the system screen, but
 * the return value of `useNotifications()` was discarded and no re-arm ever
 * happened, so the week's notifications stayed inexact until an unrelated
 * settings change or an app restart.
 *
 * The rebuild is gated on the false→true transition rather than on every
 * resume, so a normal foreground does not churn the whole ~80-alarm schedule.
 */
type AppStateListener = (state: { isActive: boolean }) => void;

function fireAppResume() {
  const calls = vi.mocked(CapApp.addListener).mock.calls;
  for (const [event, callback] of calls) {
    if (event === 'appStateChange') (callback as AppStateListener)({ isActive: true });
  }
}

async function mount() {
  const hook = renderHook(() => useNotifications(true), { wrapper: AllProviders });
  // Let the 300ms schedule debounce and the first permission probe settle.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  return hook;
}

describe('rescheduling once exact-alarm permission is granted (NT-9)', () => {
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
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    vi.mocked(CapApp.addListener).mockResolvedValue({ remove: vi.fn() } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rebuilds the schedule when exact alarms go from denied to granted', async () => {
    vi.mocked(AthanPlugin.canScheduleExactAlarms).mockResolvedValue({ value: false } as never);
    await mount();

    // The ordinary startup schedule has already run; isolate the transition.
    vi.mocked(scheduleNotifications).mockClear();

    // The user comes back from the system settings screen having granted it.
    vi.mocked(AthanPlugin.canScheduleExactAlarms).mockResolvedValue({ value: true } as never);
    await act(async () => {
      fireAppResume();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(scheduleNotifications).toHaveBeenCalled();
  });

  it('does not rebuild when the permission is still missing', async () => {
    vi.mocked(AthanPlugin.canScheduleExactAlarms).mockResolvedValue({ value: false } as never);
    await mount();
    vi.mocked(scheduleNotifications).mockClear();

    await act(async () => {
      fireAppResume();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(scheduleNotifications).not.toHaveBeenCalled();
  });

  it('does not rebuild when exact alarms were already granted at startup', async () => {
    // Nothing was armed inexact, so there is nothing to upgrade.
    vi.mocked(AthanPlugin.canScheduleExactAlarms).mockResolvedValue({ value: true } as never);
    await mount();
    vi.mocked(scheduleNotifications).mockClear();

    await act(async () => {
      fireAppResume();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(scheduleNotifications).not.toHaveBeenCalled();
  });

  it('rebuilds only once per transition, not on every resume', async () => {
    vi.mocked(AthanPlugin.canScheduleExactAlarms).mockResolvedValue({ value: false } as never);
    await mount();
    vi.mocked(scheduleNotifications).mockClear();

    vi.mocked(AthanPlugin.canScheduleExactAlarms).mockResolvedValue({ value: true } as never);
    await act(async () => {
      fireAppResume();
      await vi.advanceTimersByTimeAsync(0);
    });
    const afterTransition = vi.mocked(scheduleNotifications).mock.calls.length;
    expect(afterTransition).toBeGreaterThan(0);

    // Further resumes with the permission still granted must be quiet.
    vi.mocked(scheduleNotifications).mockClear();
    await act(async () => {
      fireAppResume();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(scheduleNotifications).not.toHaveBeenCalled();
  });
});

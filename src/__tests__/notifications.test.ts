import { LocalNotifications } from '@capacitor/local-notifications';
import { scheduleNotifications, scheduleJumuahNotifications, scheduleSurahKahfNotifications } from '../services/notificationService';
import type { Settings } from '../types';
import { defaultTravelSettings, defaultAthanSettings, defaultSurahKahfSettings } from '../context/SettingsContext';

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    calculationMethod: 'NorthAmerica',
    asrCalculation: 'Standard',
    optionalPrayers: { showSunrise: true, showMiddleOfNight: true, showLastThirdOfNight: true },
    notifications: {
      enabled: true,
      defaultSound: 'default',
      defaultReminderMinutes: 15,
      prayers: {
        fajr: { enabled: true, reminderMinutes: 15, atPrayerTime: true, sound: 'default' },
        sunrise: { enabled: false, reminderMinutes: 0, atPrayerTime: false, sound: 'default' },
        dhuhr: { enabled: true, reminderMinutes: 15, atPrayerTime: true, sound: 'default' },
        asr: { enabled: true, reminderMinutes: 15, atPrayerTime: true, sound: 'default' },
        maghrib: { enabled: true, reminderMinutes: 15, atPrayerTime: true, sound: 'default' },
        isha: { enabled: true, reminderMinutes: 15, atPrayerTime: true, sound: 'default' },
      },
    },
    jumuah: { enabled: false, masjidName: '', times: [{ khutbah: '13:00', iqamah: '13:30' }], reminderMinutes: 30 },
    travel: defaultTravelSettings,
    display: { showCurrentPrayer: true, showNextPrayer: true, showSunnahCard: true },
    athan: defaultAthanSettings,
    surahKahf: defaultSurahKahfSettings,
    previousLocations: [],
    distanceUnit: 'miles',
    designStyle: 'classic',
    ...overrides,
  };
}

const TORONTO = { latitude: 43.6532, longitude: -79.3832 };

describe('User story: I get notified before each prayer', () => {
  let scheduledNotifications: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    scheduledNotifications = [];

    vi.mocked(LocalNotifications.schedule).mockImplementation(async (opts: { notifications: unknown[] }) => {
      scheduledNotifications.push(...opts.notifications);
      return { notifications: [] };
    });
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' } as never);
    vi.mocked(LocalNotifications.requestPermissions).mockResolvedValue({ display: 'granted' } as never);
    (LocalNotifications as Record<string, unknown>).getPending = vi.fn().mockResolvedValue({ notifications: [] });
  });

  it('schedules notifications for all enabled prayers', async () => {
    const settings = makeSettings();
    await scheduleNotifications(TORONTO, settings);
    expect(scheduledNotifications.length).toBeGreaterThan(0);
  });

  it('does not schedule any notifications when globally disabled', async () => {
    const settings = makeSettings({
      notifications: {
        ...makeSettings().notifications,
        enabled: false,
      },
    });
    await scheduleNotifications(TORONTO, settings);
    expect(scheduledNotifications.length).toBe(0);
  });

  it('skips sunrise notifications (sunrise is disabled by default)', async () => {
    const settings = makeSettings();
    await scheduleNotifications(TORONTO, settings);
    const sunriseNotifs = scheduledNotifications.filter(
      (n: Record<string, unknown>) => (n.title as string)?.includes('Sunrise')
    );
    expect(sunriseNotifs.length).toBe(0);
  });

  it('skips notifications for individually disabled prayers', async () => {
    const settings = makeSettings();
    settings.notifications.prayers.asr.enabled = false;
    await scheduleNotifications(TORONTO, settings);
    const asrNotifs = scheduledNotifications.filter(
      (n: Record<string, unknown>) => (n.title as string) === 'Asr'
    );
    expect(asrNotifs.length).toBe(0);
  });

  it('sets reminder notifications before prayer time', async () => {
    const settings = makeSettings();
    settings.notifications.prayers.fajr.reminderMinutes = 30;
    await scheduleNotifications(TORONTO, settings);
    const fajrReminders = scheduledNotifications.filter(
      (n: Record<string, unknown>) => (n.title as string) === 'Fajr' && (n.body as string)?.includes('coming soon')
    );
    for (const reminder of fajrReminders) {
      const r = reminder as Record<string, Record<string, Date>>;
      expect(r.schedule.at).toBeInstanceOf(Date);
    }
  });

  it('includes at-prayer-time notifications', async () => {
    const settings = makeSettings();
    await scheduleNotifications(TORONTO, settings);
    const atTimeNotifs = scheduledNotifications.filter(
      (n: Record<string, unknown>) => (n.body as string)?.includes('Time for')
    );
    expect(atTimeNotifs.length).toBeGreaterThan(0);
  });

  it('each notification has a unique ID', async () => {
    const settings = makeSettings();
    await scheduleNotifications(TORONTO, settings);
    const ids = scheduledNotifications.map((n: Record<string, unknown>) => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('User story: I get reminded about Jumuah prayer', () => {
  let scheduledNotifications: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    scheduledNotifications = [];
    vi.mocked(LocalNotifications.schedule).mockImplementation(async (opts: { notifications: unknown[] }) => {
      scheduledNotifications.push(...opts.notifications);
      return { notifications: [] };
    });
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' } as never);
    vi.mocked(LocalNotifications.requestPermissions).mockResolvedValue({ display: 'granted' } as never);
    (LocalNotifications as Record<string, unknown>).getPending = vi.fn().mockResolvedValue({ notifications: [] });
  });

  it('schedules Jumuah notifications when enabled', async () => {
    await scheduleJumuahNotifications({
      enabled: true,
      masjidName: 'ISNA Masjid',
      times: [{ khutbah: '13:00', iqamah: '13:30' }],
      reminderMinutes: 30,
    });
    expect(scheduledNotifications.length).toBeGreaterThan(0);
    const firstNotif = scheduledNotifications[0] as Record<string, unknown>;
    expect(firstNotif.title).toBe("Jumu'ah Prayer");
    expect((firstNotif.body as string)).toContain('ISNA Masjid');
  });

  it('does not schedule Jumuah when disabled', async () => {
    await scheduleJumuahNotifications({
      enabled: false,
      masjidName: '',
      times: [{ khutbah: '13:00', iqamah: '13:30' }],
      reminderMinutes: 30,
    });
    expect(scheduledNotifications.length).toBe(0);
  });
});

describe('User story: I get reminded to read Surah Al-Kahf', () => {
  let scheduledNotifications: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    scheduledNotifications = [];
    vi.mocked(LocalNotifications.schedule).mockImplementation(async (opts: { notifications: unknown[] }) => {
      scheduledNotifications.push(...opts.notifications);
      return { notifications: [] };
    });
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' } as never);
    vi.mocked(LocalNotifications.requestPermissions).mockResolvedValue({ display: 'granted' } as never);
    (LocalNotifications as Record<string, unknown>).getPending = vi.fn().mockResolvedValue({ notifications: [] });
  });

  it('schedules Surah Kahf reminders when enabled', async () => {
    await scheduleSurahKahfNotifications(TORONTO, { enabled: true, repeatIntervalHours: 0 }, 'NorthAmerica', 'Standard');
    expect(scheduledNotifications.length).toBeGreaterThan(0);
    const firstNotif = scheduledNotifications[0] as Record<string, unknown>;
    expect((firstNotif.title as string)).toContain('Surah');
  });

  it('does not schedule Surah Kahf when disabled', async () => {
    await scheduleSurahKahfNotifications(TORONTO, { enabled: false, repeatIntervalHours: 0 }, 'NorthAmerica', 'Standard');
    expect(scheduledNotifications.length).toBe(0);
  });

  it('schedules repeat reminders when repeatIntervalHours > 0', async () => {
    await scheduleSurahKahfNotifications(TORONTO, { enabled: true, repeatIntervalHours: 4 }, 'NorthAmerica', 'Standard');
    expect(scheduledNotifications.length).toBeGreaterThan(4);
  });
});

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { Preferences } from '@capacitor/preferences';
import type { Settings, CalculationMethod, AsrCalculation, PrayerName, OptionalPrayersSettings, PrayerNotificationSettings, NotificationSound, JumuahSettings, TravelSettings, DisplaySettings } from '../types';

const SETTINGS_KEY = 'ontime_settings';

const defaultPrayerNotification: PrayerNotificationSettings = {
  enabled: true,
  reminderMinutes: 15,
  atPrayerTime: true,
  sound: 'default',
};

const defaultJumuahSettings: JumuahSettings = {
  enabled: false,
  masjidName: '',
  times: [{ khutbah: '13:00', iqamah: '13:30' }],
  reminderMinutes: 30,
};

const defaultDisplaySettings: DisplaySettings = {
  showCurrentPrayer: true,
  showNextPrayer: true,
  showSunnahCard: true,
};

export const defaultTravelSettings: TravelSettings = {
  enabled: false,
  homeBase: null,
  override: 'auto',
  distanceThresholdKm: 88.7,
  jamaDhuhrAsr: false,
  jamaMaghribIsha: false,
  maxTravelDays: 0,
  travelStartDate: null,
};

const defaultSettings: Settings = {
  calculationMethod: 'NorthAmerica', // ISNA
  asrCalculation: 'Standard',
  optionalPrayers: {
    showSunrise: true,
    showMiddleOfNight: true,
    showLastThirdOfNight: true,
  },
  notifications: {
    enabled: true,
    defaultSound: 'default',
    defaultReminderMinutes: 15,
    prayers: {
      fajr: { ...defaultPrayerNotification, sound: 'adhan_fajr' },
      sunrise: { ...defaultPrayerNotification, enabled: false },
      dhuhr: { ...defaultPrayerNotification },
      asr: { ...defaultPrayerNotification },
      maghrib: { ...defaultPrayerNotification },
      isha: { ...defaultPrayerNotification },
    },
  },
  jumuah: defaultJumuahSettings,
  travel: defaultTravelSettings,
  display: defaultDisplaySettings,
};

interface SettingsContextType {
  settings: Settings;
  updateCalculationMethod: (method: CalculationMethod) => void;
  updateAsrCalculation: (method: AsrCalculation) => void;
  updateOptionalPrayers: (key: keyof OptionalPrayersSettings, value: boolean) => void;
  updateNotifications: (enabled: boolean) => void;
  updateDefaultSound: (sound: NotificationSound) => void;
  updateDefaultReminderMinutes: (minutes: number) => void;
  updatePrayerNotification: (prayer: PrayerName, updates: Partial<PrayerNotificationSettings>) => void;
  updateJumuah: (updates: Partial<JumuahSettings>) => void;
  updateTravel: (updates: Partial<TravelSettings>) => void;
  updateDisplay: (updates: Partial<DisplaySettings>) => void;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Save settings whenever they change
  useEffect(() => {
    if (!isLoading) {
      saveSettings(settings);
    }
  }, [settings, isLoading]);

  async function loadSettings() {
    try {
      const { value } = await Preferences.get({ key: SETTINGS_KEY });
      if (value) {
        const parsed = JSON.parse(value);
        
        // Handle migration from old format (where prayers were booleans)
        const migratedPrayers = { ...defaultSettings.notifications.prayers };
        if (parsed.notifications?.prayers) {
          for (const prayer of Object.keys(defaultSettings.notifications.prayers) as PrayerName[]) {
            const prayerSetting = parsed.notifications.prayers[prayer];
            if (typeof prayerSetting === 'boolean') {
              // Migrate from old boolean format
              migratedPrayers[prayer] = {
                ...defaultSettings.notifications.prayers[prayer],
                enabled: prayerSetting,
              };
            } else if (prayerSetting && typeof prayerSetting === 'object') {
              // New format - merge with defaults
              migratedPrayers[prayer] = {
                ...defaultSettings.notifications.prayers[prayer],
                ...prayerSetting,
              };
            }
          }
        }
        
        // Deep merge to handle new settings fields
        setSettings({
          ...defaultSettings,
          ...parsed,
          optionalPrayers: {
            ...defaultSettings.optionalPrayers,
            ...parsed.optionalPrayers,
          },
          notifications: {
            ...defaultSettings.notifications,
            ...parsed.notifications,
            prayers: migratedPrayers,
          },
          jumuah: {
            ...defaultJumuahSettings,
            ...parsed.jumuah,
          },
          travel: {
            ...defaultTravelSettings,
            ...parsed.travel,
          },
          display: {
            ...defaultDisplaySettings,
            ...parsed.display,
          },
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSettings(newSettings: Settings) {
    try {
      await Preferences.set({
        key: SETTINGS_KEY,
        value: JSON.stringify(newSettings),
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  function updateCalculationMethod(method: CalculationMethod) {
    setSettings((prev) => ({ ...prev, calculationMethod: method }));
  }

  function updateAsrCalculation(method: AsrCalculation) {
    setSettings((prev) => ({ ...prev, asrCalculation: method }));
  }

  function updateOptionalPrayers(key: keyof OptionalPrayersSettings, value: boolean) {
    setSettings((prev) => ({
      ...prev,
      optionalPrayers: { ...prev.optionalPrayers, [key]: value },
    }));
  }

  function updateNotifications(enabled: boolean) {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, enabled },
    }));
  }

  function updateDefaultSound(sound: NotificationSound) {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, defaultSound: sound },
    }));
  }

  function updateDefaultReminderMinutes(minutes: number) {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, defaultReminderMinutes: minutes },
    }));
  }

  function updatePrayerNotification(prayer: PrayerName, updates: Partial<PrayerNotificationSettings>) {
    setSettings((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        prayers: {
          ...prev.notifications.prayers,
          [prayer]: {
            ...prev.notifications.prayers[prayer],
            ...updates,
          },
        },
      },
    }));
  }

  function updateJumuah(updates: Partial<JumuahSettings>) {
    setSettings((prev) => ({
      ...prev,
      jumuah: {
        ...prev.jumuah,
        ...updates,
      },
    }));
  }

  function updateTravel(updates: Partial<TravelSettings>) {
    setSettings((prev) => ({
      ...prev,
      travel: {
        ...prev.travel,
        ...updates,
      },
    }));
  }

  function updateDisplay(updates: Partial<DisplaySettings>) {
    setSettings((prev) => ({
      ...prev,
      display: {
        ...prev.display,
        ...updates,
      },
    }));
  }

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateCalculationMethod,
        updateAsrCalculation,
        updateOptionalPrayers,
        updateNotifications,
        updateDefaultSound,
        updateDefaultReminderMinutes,
        updatePrayerNotification,
        updateJumuah,
        updateTravel,
        updateDisplay,
        isLoading,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

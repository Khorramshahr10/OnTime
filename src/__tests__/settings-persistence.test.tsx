import { Preferences } from '@capacitor/preferences';
import { render, screen, act } from '@testing-library/react';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import type { Settings } from '../types';

// Helper component that exposes settings for assertions
function SettingsInspector({ onSettings }: { onSettings: (s: Settings) => void }) {
  const { settings, isLoading } = useSettings();
  if (!isLoading) onSettings(settings);
  return null;
}

function renderSettingsInspector(onSettings: (s: Settings) => void) {
  return render(
    <SettingsProvider>
      <SettingsInspector onSettings={onSettings} />
    </SettingsProvider>,
  );
}

describe('User story: My settings persist across app restarts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with sensible defaults on first launch (no saved data)', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: null });

    let captured: Settings | null = null;
    await act(async () => {
      renderSettingsInspector((s) => { captured = s; });
    });

    expect(captured).not.toBeNull();
    expect(captured!.calculationMethod).toBe('NorthAmerica');
    expect(captured!.asrCalculation).toBe('Standard');
    expect(captured!.designStyle).toBe('classic');
    expect(captured!.distanceUnit).toBe('miles');
    expect(captured!.notifications.enabled).toBe(true);
    expect(captured!.display.showCurrentPrayer).toBe(true);
    expect(captured!.display.showNextPrayer).toBe(true);
  });

  it('restores saved settings from storage', async () => {
    const saved = {
      calculationMethod: 'Egyptian',
      designStyle: 'islamic',
      distanceUnit: 'km',
    };
    vi.mocked(Preferences.get).mockResolvedValue({ value: JSON.stringify(saved) });

    let captured: Settings | null = null;
    await act(async () => {
      renderSettingsInspector((s) => { captured = s; });
    });

    expect(captured!.calculationMethod).toBe('Egyptian');
    expect(captured!.designStyle).toBe('islamic');
    expect(captured!.distanceUnit).toBe('km');
  });

  it('fills in missing keys with defaults when loading partial settings', async () => {
    // Simulate old save that doesn't have designStyle or surahKahf
    const partialSave = {
      calculationMethod: 'Karachi',
      asrCalculation: 'Hanafi',
    };
    vi.mocked(Preferences.get).mockResolvedValue({ value: JSON.stringify(partialSave) });

    let captured: Settings | null = null;
    await act(async () => {
      renderSettingsInspector((s) => { captured = s; });
    });

    // Saved values preserved
    expect(captured!.calculationMethod).toBe('Karachi');
    expect(captured!.asrCalculation).toBe('Hanafi');
    // Missing values get defaults
    expect(captured!.designStyle).toBe('classic');
    expect(captured!.distanceUnit).toBe('miles');
    expect(captured!.display.showCurrentPrayer).toBe(true);
    expect(captured!.travel.distanceThresholdKm).toBe(88.7);
  });

  it('migrates old boolean notification format to new object format', async () => {
    const oldFormat = {
      notifications: {
        enabled: true,
        prayers: {
          fajr: true,
          sunrise: false,
          dhuhr: true,
          asr: true,
          maghrib: true,
          isha: true,
        },
      },
    };
    vi.mocked(Preferences.get).mockResolvedValue({ value: JSON.stringify(oldFormat) });

    let captured: Settings | null = null;
    await act(async () => {
      renderSettingsInspector((s) => { captured = s; });
    });

    // Booleans should be migrated to objects with enabled field
    expect(captured!.notifications.prayers.fajr.enabled).toBe(true);
    expect(captured!.notifications.prayers.sunrise.enabled).toBe(false);
    expect(captured!.notifications.prayers.fajr.reminderMinutes).toBeDefined();
    expect(captured!.notifications.prayers.fajr.sound).toBeDefined();
  });

  it('handles corrupted saved data gracefully (falls back to defaults)', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'not-valid-json{{{' });

    let captured: Settings | null = null;
    await act(async () => {
      renderSettingsInspector((s) => { captured = s; });
    });

    // Should fall back to defaults, not crash
    expect(captured).not.toBeNull();
    expect(captured!.calculationMethod).toBe('NorthAmerica');
  });
});

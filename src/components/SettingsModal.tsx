import { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../context/LocationContext';
import { useTravel } from '../context/TravelContext';
import { CALCULATION_METHODS } from '../services/prayerService';
import { CitySearch } from './CitySearch';
import type { CalculationMethod, PrayerName, NotificationSound, CityEntry } from '../types';

type SettingsCategory = 'main' | 'location' | 'calculation' | 'appearance' | 'jumuah' | 'notifications' | 'travel' | 'about' | 'travel-home-search';

const PRAYER_LABELS: Record<PrayerName, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

const SOUND_OPTIONS: { value: NotificationSound; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'adhan', label: 'Adhan' },
  { value: 'adhan_fajr', label: 'Adhan (Fajr)' },
  { value: 'silent', label: 'Silent' },
];

const REMINDER_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [category, setCategory] = useState<SettingsCategory>('main');
  
  const { 
    settings, 
    updateCalculationMethod, 
    updateAsrCalculation,
    updateOptionalPrayers,
    updateNotifications,
    updatePrayerNotification,
    updateJumuah,
    updateDisplay,
  } = useSettings();
  const { theme, setTheme } = useTheme();
  const { location, setManualLocation, getGPSLocation, error: locationError } = useLocation();
  const { travelState, setHomeBase, clearHomeBase, setTravelOverride, toggleJama, toggleTravelEnabled } = useTravel();
  const { updateTravel } = useSettings();

  const [locationMethod, setLocationMethod] = useState<'search' | 'gps' | 'manual' | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualCity, setManualCity] = useState('');

  if (!isOpen) return null;

  const handleSaveManualLocation = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      setManualLocation(
        { latitude: lat, longitude: lng },
        manualCity || 'Custom Location'
      );
      setManualLat('');
      setManualLng('');
      setManualCity('');
    }
  };

  const handleBack = () => {
    if (category === 'travel-home-search') {
      setCategory('travel');
      return;
    }
    setCategory('main');
  };

  const handleClose = () => {
    setCategory('main');
    onClose();
  };

  // Get summary text for each category
  const getLocationSummary = () => location.cityName;
  const getCalculationSummary = () => {
    const method = CALCULATION_METHODS.find(m => m.value === settings.calculationMethod);
    return method?.label || settings.calculationMethod;
  };
  const getAppearanceSummary = () => {
    const themeLabels = { light: 'Light', dark: 'Dark', system: 'System', auto: 'Auto (Prayer)' };
    return themeLabels[theme];
  };
  const getJumuahSummary = () => {
    if (!settings.jumuah.enabled) return 'Off';
    return settings.jumuah.masjidName || 'Enabled';
  };
  const getNotificationsSummary = () => {
    if (!settings.notifications.enabled) return 'Off';
    const enabledCount = Object.values(settings.notifications.prayers).filter(p => p.enabled).length;
    return `${enabledCount} prayers`;
  };
  const getTravelSummary = () => {
    if (!settings.travel.enabled) return 'Off';
    if (travelState.isTraveling) return 'Traveling';
    return 'Enabled';
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-background)] safe-area-top safe-area-bottom animate-slide-in">
      <div className="h-full overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-6 pb-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          {category !== 'main' ? (
            <button
              onClick={handleBack}
              className="p-2 -ml-2 rounded-full hover:bg-[var(--color-card)] transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5 text-[var(--color-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-[var(--color-text)] font-medium">Back</span>
            </button>
          ) : (
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Settings</h2>
          )}
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-[var(--color-card)] transition-colors"
          >
            <svg className="w-5 h-5 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Categories List */}
        {category === 'main' && (
          <div className="flex flex-col gap-2">
            <CategoryItem
              icon={<LocationIcon />}
              title="Location"
              summary={getLocationSummary()}
              onClick={() => setCategory('location')}
            />
            <CategoryItem
              icon={<CalculationIcon />}
              title="Prayer Calculation"
              summary={getCalculationSummary()}
              onClick={() => setCategory('calculation')}
            />
            <CategoryItem
              icon={<AppearanceIcon />}
              title="Appearance"
              summary={getAppearanceSummary()}
              onClick={() => setCategory('appearance')}
            />
            <CategoryItem
              icon={<MosqueIcon />}
              title="Jumu'ah"
              summary={getJumuahSummary()}
              onClick={() => setCategory('jumuah')}
            />
            <CategoryItem
              icon={<NotificationIcon />}
              title="Notifications"
              summary={getNotificationsSummary()}
              onClick={() => setCategory('notifications')}
            />
            <CategoryItem
              icon={<TravelIcon />}
              title="Travel Mode"
              summary={getTravelSummary()}
              onClick={() => setCategory('travel')}
            />
            <CategoryItem
              icon={<AboutIcon />}
              title="About"
              summary="v1.0.0"
              onClick={() => setCategory('about')}
            />
          </div>
        )}

        {/* Location Settings */}
        {category === 'location' && (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Location</h3>

            {/* Current Location Display */}
            <div className="p-4 rounded-xl bg-[var(--color-card)]">
              <p className="text-[var(--color-text)] font-medium">{location.cityName}</p>
              <p className="text-sm text-[var(--color-muted)]">
                {location.coordinates.latitude.toFixed(4)}, {location.coordinates.longitude.toFixed(4)}
              </p>
            </div>

            {/* Method Picker */}
            <div className="p-4 rounded-xl bg-[var(--color-card)]">
              <p className="text-sm text-[var(--color-muted)] mb-2">Set Location</p>
              <div className="flex gap-2">
                <ToggleButton
                  active={locationMethod === 'search'}
                  onClick={() => setLocationMethod(locationMethod === 'search' ? null : 'search')}
                >
                  Search City
                </ToggleButton>
                <ToggleButton
                  active={locationMethod === 'gps'}
                  onClick={() => setLocationMethod(locationMethod === 'gps' ? null : 'gps')}
                >
                  Use GPS
                </ToggleButton>
                <ToggleButton
                  active={locationMethod === 'manual'}
                  onClick={() => setLocationMethod(locationMethod === 'manual' ? null : 'manual')}
                >
                  Coordinates
                </ToggleButton>
              </div>
            </div>

            {/* GPS */}
            {locationMethod === 'gps' && (
              <div className="p-4 rounded-xl bg-[var(--color-card)] flex flex-col gap-3">
                <p className="text-sm text-[var(--color-muted)]">Detect your location using GPS</p>
                <button
                  onClick={async () => {
                    setGpsLoading(true);
                    setGpsError(null);
                    try {
                      const loc = await getGPSLocation();
                      setManualLocation(loc.coordinates, loc.cityName, loc.countryCode);
                      setLocationMethod(null);
                    } catch (err) {
                      setGpsError(err instanceof Error ? err.message : 'Failed to get location');
                    } finally {
                      setGpsLoading(false);
                    }
                  }}
                  disabled={gpsLoading}
                  className="w-full py-3 bg-[var(--color-primary)] text-white rounded-xl font-medium disabled:opacity-50"
                >
                  {gpsLoading ? 'Locating...' : 'Detect My Location'}
                </button>
                {gpsError && (
                  <p className="text-sm text-red-500">{gpsError}</p>
                )}
                {locationError && !gpsError && (
                  <p className="text-sm text-red-500">{locationError}</p>
                )}
              </div>
            )}

            {/* Search City */}
            {locationMethod === 'search' && (
              <CitySearch onSelect={(city: CityEntry) => {
                setManualLocation(
                  { latitude: city.lat, longitude: city.lng },
                  city.n,
                  city.c,
                );
                setLocationMethod(null);
              }} />
            )}

            {/* Manual Coordinates */}
            {locationMethod === 'manual' && (
              <div className="p-4 rounded-xl bg-[var(--color-card)] flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="City name (e.g., New York)"
                  value={manualCity}
                  onChange={(e) => setManualCity(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <div className="flex gap-3">
                  <input
                    type="number"
                    placeholder="Latitude"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    step="0.0001"
                    min="-90"
                    max="90"
                    className="flex-1 p-3 rounded-xl bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                  <input
                    type="number"
                    placeholder="Longitude"
                    value={manualLng}
                    onChange={(e) => setManualLng(e.target.value)}
                    step="0.0001"
                    min="-180"
                    max="180"
                    className="flex-1 p-3 rounded-xl bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <button
                  onClick={() => {
                    handleSaveManualLocation();
                    setLocationMethod(null);
                  }}
                  disabled={!manualLat || !manualLng}
                  className="w-full py-3 bg-[var(--color-primary)] text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Location
                </button>
              </div>
            )}
          </div>
        )}

        {/* Calculation Settings */}
        {category === 'calculation' && (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Prayer Calculation</h3>
            
            {/* Calculation Method */}
            <div>
              <label className="block text-sm text-[var(--color-muted)] mb-2">Calculation Method</label>
              <select
                value={settings.calculationMethod}
                onChange={(e) => updateCalculationMethod(e.target.value as CalculationMethod)}
                className="w-full p-3 rounded-xl bg-[var(--color-card)] text-[var(--color-text)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                {CALCULATION_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label} - {method.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Asr Calculation */}
            <div>
              <label className="block text-sm text-[var(--color-muted)] mb-2">Asr Calculation</label>
              <div className="flex gap-2">
                <ToggleButton
                  active={settings.asrCalculation === 'Standard'}
                  onClick={() => updateAsrCalculation('Standard')}
                >
                  Standard (Shafi'i)
                </ToggleButton>
                <ToggleButton
                  active={settings.asrCalculation === 'Hanafi'}
                  onClick={() => updateAsrCalculation('Hanafi')}
                >
                  Hanafi
                </ToggleButton>
              </div>
            </div>

            {/* Additional Times */}
            <div>
              <label className="block text-sm text-[var(--color-muted)] mb-2">Additional Times</label>
              <div className="flex flex-col gap-2">
                <ToggleRow
                  label="Sunrise"
                  description="Ishraq prayer time"
                  checked={settings.optionalPrayers.showSunrise}
                  onChange={(checked) => updateOptionalPrayers('showSunrise', checked)}
                />
                <ToggleRow
                  label="Middle of Night"
                  description="Halfway between Maghrib and Fajr"
                  checked={settings.optionalPrayers.showMiddleOfNight}
                  onChange={(checked) => updateOptionalPrayers('showMiddleOfNight', checked)}
                />
                <ToggleRow
                  label="Last Third of Night"
                  description="Optimal time for Tahajjud/Qiyam"
                  checked={settings.optionalPrayers.showLastThirdOfNight}
                  onChange={(checked) => updateOptionalPrayers('showLastThirdOfNight', checked)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Appearance Settings */}
        {category === 'appearance' && (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Appearance</h3>
            
            <div>
              <label className="block text-sm text-[var(--color-muted)] mb-2">Theme</label>
              <div className="grid grid-cols-2 gap-2">
                <ThemeOption
                  active={theme === 'light'}
                  onClick={() => setTheme('light')}
                  icon={<SunIcon />}
                  label="Light"
                />
                <ThemeOption
                  active={theme === 'dark'}
                  onClick={() => setTheme('dark')}
                  icon={<MoonIcon />}
                  label="Dark"
                />
                <ThemeOption
                  active={theme === 'system'}
                  onClick={() => setTheme('system')}
                  icon={<SystemIcon />}
                  label="System"
                />
                <ThemeOption
                  active={theme === 'auto'}
                  onClick={() => setTheme('auto')}
                  icon={<AutoIcon />}
                  label="Auto"
                  description="Prayer-based"
                />
              </div>
              {theme === 'auto' && (
                <p className="text-sm text-[var(--color-muted)] mt-3">
                  Dark mode activates after Maghrib, light mode returns after Fajr
                </p>
              )}
            </div>

            {/* Display Cards */}
            <div>
              <label className="block text-sm text-[var(--color-muted)] mb-2">Display Cards</label>
              <div className="flex flex-col gap-2">
                <ToggleRow
                  label="Current Prayer"
                  description="Show current prayer with time remaining"
                  checked={settings.display.showCurrentPrayer}
                  onChange={(v) => updateDisplay({ showCurrentPrayer: v })}
                />
                <ToggleRow
                  label="Next Prayer"
                  description="Show next prayer countdown"
                  checked={settings.display.showNextPrayer}
                  onChange={(v) => updateDisplay({ showNextPrayer: v })}
                />
                <ToggleRow
                  label="Sunnah Prayers"
                  description="Show sunnah/rawatib prayer info"
                  checked={settings.display.showSunnahCard}
                  onChange={(v) => updateDisplay({ showSunnahCard: v })}
                />
              </div>
            </div>
          </div>
        )}

        {/* Jumuah Settings */}
        {category === 'jumuah' && (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Jumu'ah (Friday Prayer)</h3>
            
            <ToggleRow
              label="Enable Jumu'ah Reminder"
              description="Get notified before Friday prayer"
              checked={settings.jumuah.enabled}
              onChange={(checked) => updateJumuah({ enabled: checked })}
            />
            
            {settings.jumuah.enabled && (
              <>
                {/* Masjid Name */}
                <div className="p-4 rounded-xl bg-[var(--color-card)]">
                  <label className="block text-sm text-[var(--color-muted)] mb-2">Masjid Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Islamic Center of Example"
                    value={settings.jumuah.masjidName}
                    onChange={(e) => updateJumuah({ masjidName: e.target.value })}
                    className="w-full p-3 rounded-xl bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                {/* Jumuah Times */}
                {settings.jumuah.times.map((time, index) => (
                  <div key={index} className="p-4 rounded-xl bg-[var(--color-card)]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-[var(--color-text)]">
                        {settings.jumuah.times.length > 1 ? `Jumu'ah ${index + 1}` : "Jumu'ah Time"}
                      </span>
                      {settings.jumuah.times.length > 1 && (
                        <button
                          onClick={() => {
                            const newTimes = settings.jumuah.times.filter((_, i) => i !== index);
                            updateJumuah({ times: newTimes });
                          }}
                          className="text-red-500 text-sm font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-[var(--color-muted)] mb-1">Khutbah</label>
                        <input
                          type="time"
                          value={time.khutbah}
                          onChange={(e) => {
                            const newTimes = [...settings.jumuah.times];
                            newTimes[index] = { ...newTimes[index], khutbah: e.target.value };
                            updateJumuah({ times: newTimes });
                          }}
                          className="w-full p-3 rounded-xl bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)]"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-[var(--color-muted)] mb-1">Iqamah</label>
                        <input
                          type="time"
                          value={time.iqamah}
                          onChange={(e) => {
                            const newTimes = [...settings.jumuah.times];
                            newTimes[index] = { ...newTimes[index], iqamah: e.target.value };
                            updateJumuah({ times: newTimes });
                          }}
                          className="w-full p-3 rounded-xl bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)]"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add Another Jumuah */}
                <button
                  onClick={() => {
                    const newTimes = [...settings.jumuah.times, { khutbah: '14:00', iqamah: '14:30' }];
                    updateJumuah({ times: newTimes });
                  }}
                  className="p-4 rounded-xl bg-[var(--color-card)] text-[var(--color-primary)] font-medium hover:bg-[var(--color-border)] transition-colors text-center"
                >
                  + Add Another Jumu'ah Time
                </button>

                {/* Reminder Time */}
                <div className="p-4 rounded-xl bg-[var(--color-card)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[var(--color-text)] font-medium">Reminder</p>
                      <p className="text-sm text-[var(--color-muted)]">Minutes before khutbah</p>
                    </div>
                    <select
                      value={settings.jumuah.reminderMinutes}
                      onChange={(e) => updateJumuah({ reminderMinutes: parseInt(e.target.value) })}
                      className="px-4 py-2 rounded-xl bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)]"
                    >
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>1 hour</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Notifications Settings */}
        {category === 'notifications' && (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Notifications</h3>
            
            <ToggleRow
              label="Enable Notifications"
              description="Get notified for prayer times"
              checked={settings.notifications.enabled}
              onChange={(checked) => updateNotifications(checked)}
            />
            
            {settings.notifications.enabled && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--color-muted)]">
                  Configure notifications for each prayer
                </p>
                {(Object.keys(PRAYER_LABELS) as PrayerName[]).map((prayer) => {
                  const prayerSettings = settings.notifications.prayers[prayer];
                  return (
                    <div 
                      key={prayer}
                      className="p-4 rounded-xl bg-[var(--color-card)]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-[var(--color-text)]">
                          {PRAYER_LABELS[prayer]}
                        </span>
                        <input
                          type="checkbox"
                          checked={prayerSettings.enabled}
                          onChange={(e) => updatePrayerNotification(prayer, { enabled: e.target.checked })}
                          className="w-5 h-5 rounded accent-[var(--color-primary)]"
                        />
                      </div>
                      
                      {prayerSettings.enabled && (
                        <div className="flex flex-col gap-3 pt-3 border-t border-[var(--color-border)]">
                          {/* At Prayer Time */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[var(--color-muted)]">At prayer time</span>
                            <input
                              type="checkbox"
                              checked={prayerSettings.atPrayerTime}
                              onChange={(e) => updatePrayerNotification(prayer, { atPrayerTime: e.target.checked })}
                              className="w-4 h-4 rounded accent-[var(--color-primary)]"
                            />
                          </div>
                          
                          {/* Reminder */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[var(--color-muted)]">Reminder before</span>
                            <select
                              value={prayerSettings.reminderMinutes}
                              onChange={(e) => updatePrayerNotification(prayer, { reminderMinutes: parseInt(e.target.value) })}
                              className="px-3 py-1.5 text-sm rounded-lg bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)]"
                            >
                              {REMINDER_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          
                          {/* Sound */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[var(--color-muted)]">Sound</span>
                            <select
                              value={prayerSettings.sound}
                              onChange={(e) => updatePrayerNotification(prayer, { sound: e.target.value as NotificationSound })}
                              className="px-3 py-1.5 text-sm rounded-lg bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)]"
                            >
                              {SOUND_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Travel Mode Settings */}
        {category === 'travel' && (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Travel Mode</h3>

            {/* Master Toggle */}
            <ToggleRow
              label="Enable Travel Mode"
              description="Detect travel and shorten prayers (Qasr)"
              checked={settings.travel.enabled}
              onChange={() => toggleTravelEnabled()}
            />

            {settings.travel.enabled && (
              <>
                {/* Detection Mode */}
                <div className="p-4 rounded-xl bg-[var(--color-card)]">
                  <p className="text-sm text-[var(--color-muted)] mb-2">Detection Mode</p>
                  <div className="flex gap-2">
                    <ToggleButton
                      active={settings.travel.override === 'auto'}
                      onClick={() => setTravelOverride('auto')}
                    >
                      Auto
                    </ToggleButton>
                    <ToggleButton
                      active={settings.travel.override === 'force_on'}
                      onClick={() => setTravelOverride('force_on')}
                    >
                      Always On
                    </ToggleButton>
                    <ToggleButton
                      active={settings.travel.override === 'force_off'}
                      onClick={() => setTravelOverride('force_off')}
                    >
                      Always Off
                    </ToggleButton>
                  </div>
                </div>

                {/* Home Base */}
                <div className="p-4 rounded-xl bg-[var(--color-card)]">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[var(--color-text)] font-medium">Home Base</p>
                    {settings.travel.homeBase && (
                      <button
                        onClick={() => clearHomeBase()}
                        className="text-red-500 text-sm font-medium"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {settings.travel.homeBase && (
                    <div className="mb-3">
                      <div className="rounded-lg overflow-hidden mb-2">
                        <iframe
                          title="Home base location"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${settings.travel.homeBase.coordinates.longitude - 0.06},${settings.travel.homeBase.coordinates.latitude - 0.04},${settings.travel.homeBase.coordinates.longitude + 0.06},${settings.travel.homeBase.coordinates.latitude + 0.04}&layer=mapnik&marker=${settings.travel.homeBase.coordinates.latitude},${settings.travel.homeBase.coordinates.longitude}`}
                          className="w-full h-36 border-0"
                        />
                      </div>
                      <p className="text-sm text-[var(--color-text)]">{settings.travel.homeBase.cityName}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {settings.travel.homeBase.coordinates.latitude.toFixed(4)}, {settings.travel.homeBase.coordinates.longitude.toFixed(4)}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setGpsLoading(true);
                        setGpsError(null);
                        try {
                          const loc = await getGPSLocation();
                          setHomeBase({
                            coordinates: loc.coordinates,
                            cityName: loc.cityName,
                            countryCode: loc.countryCode,
                          });
                        } catch (err) {
                          setGpsError(err instanceof Error ? err.message : 'Failed to get location');
                        } finally {
                          setGpsLoading(false);
                        }
                      }}
                      disabled={gpsLoading}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {gpsLoading ? 'Locating...' : 'Use GPS Location'}
                    </button>
                    <button
                      onClick={() => setCategory('travel-home-search')}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[var(--color-background)] text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors"
                    >
                      Search City
                    </button>
                  </div>
                  {gpsError && (
                    <p className="text-sm text-red-500 mt-2">{gpsError}</p>
                  )}
                </div>

                {/* Jama Toggles — combined card */}
                <div className="rounded-xl bg-[var(--color-card)] overflow-hidden">
                  <div
                    onClick={() => toggleJama('dhuhrAsr')}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--color-border)] transition-colors"
                  >
                    <div className="mr-4">
                      <p className="text-[var(--color-text)] font-medium">Combine Dhuhr + Asr</p>
                      <p className="text-sm text-[var(--color-muted)]">Jama' — pray both together</p>
                    </div>
                    <div className={`
                      relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200
                      ${settings.travel.jamaDhuhrAsr ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}
                    `}>
                      <div className={`
                        absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                        ${settings.travel.jamaDhuhrAsr ? 'translate-x-5' : 'translate-x-0'}
                      `} />
                    </div>
                  </div>
                  <div className="mx-4 border-t border-[var(--color-border)]" />
                  <div
                    onClick={() => toggleJama('maghribIsha')}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--color-border)] transition-colors"
                  >
                    <div className="mr-4">
                      <p className="text-[var(--color-text)] font-medium">Combine Maghrib + Isha</p>
                      <p className="text-sm text-[var(--color-muted)]">Jama' — pray both together</p>
                    </div>
                    <div className={`
                      relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200
                      ${settings.travel.jamaMaghribIsha ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}
                    `}>
                      <div className={`
                        absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                        ${settings.travel.jamaMaghribIsha ? 'translate-x-5' : 'translate-x-0'}
                      `} />
                    </div>
                  </div>
                </div>

                {/* Max Travel Days + Qasr/Jama Info */}
                <div className="p-4 rounded-xl bg-[var(--color-card)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[var(--color-text)] font-medium">Max Travel Days</p>
                      <p className="text-sm text-[var(--color-muted)]">After this, Qasr stops</p>
                    </div>
                    <select
                      value={settings.travel.maxTravelDays}
                      onChange={(e) => updateTravel({ maxTravelDays: parseInt(e.target.value) })}
                      className="px-4 py-2 rounded-xl bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)]"
                    >
                      <option value={0}>Unlimited</option>
                      <option value={4}>4 days</option>
                      <option value={10}>10 days</option>
                      <option value={15}>15 days</option>
                    </select>
                  </div>

                  <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                    <p className="text-sm font-medium text-[var(--color-text)] mb-1">What is Qasr?</p>
                    <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                      Qasr (shortening) is a concession for travelers to shorten the 4-rak'ah prayers (Dhuhr, Asr, and Isha) to 2 rak'ah each. This applies when you travel approximately 80+ km from your home city. Fajr (2 rak'ah) and Maghrib (3 rak'ah) are not shortened.
                    </p>
                    <p className="text-sm font-medium text-[var(--color-text)] mt-3 mb-1">What is Jama'?</p>
                    <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                      Jama' (combining) allows a traveler to combine Dhuhr with Asr, or Maghrib with Isha, praying them together at the time of either prayer. This is separate from Qasr — you can shorten without combining, or do both.
                    </p>
                    <p className="text-sm font-medium text-[var(--color-text)] mt-3 mb-1">Sunnah prayers while traveling</p>
                    <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                      Most scholars agree that the Sunnah Rawatib (regular sunnah prayers) are dropped while traveling, except for the 2 rak'ah before Fajr and the Witr prayer, which the Prophet (peace be upon him) never left.
                    </p>
                  </div>
                </div>

                {/* Current Status */}
                {travelState.isTraveling && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <p className="text-amber-600 font-medium text-sm">Currently Traveling</p>
                    {travelState.distanceFromHomeKm !== null && (
                      <p className="text-amber-600/70 text-xs mt-1">
                        {Math.round(travelState.distanceFromHomeKm)} km from home
                        {travelState.isAutoDetected && ' (auto-detected)'}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Travel Home City Search */}
        {category === 'travel-home-search' && (
          <CitySearch onSelect={(city: CityEntry) => {
            setHomeBase({
              coordinates: { latitude: city.lat, longitude: city.lng },
              cityName: city.n,
              countryCode: city.c,
            });
            setCategory('travel');
          }} />
        )}

        {/* About */}
        {category === 'about' && (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">About</h3>
            
            <div className="p-6 rounded-xl bg-[var(--color-card)] text-center">
              <img src="/logo.png" alt="OnTime" className="w-20 h-20 mx-auto mb-4 rounded-2xl" />
              <h4 className="text-xl font-semibold text-[var(--color-text)]">OnTime</h4>
              <p className="text-[var(--color-muted)] mt-1">Version 1.0.0</p>
            </div>
            
            <div className="p-4 rounded-xl bg-[var(--color-card)]">
              <p className="text-sm text-[var(--color-muted)]">
                Prayer times calculated using adhan-js library with high precision astronomical algorithms.
              </p>
            </div>
            
            <div className="p-4 rounded-xl bg-[var(--color-card)]">
              <p className="text-sm text-[var(--color-text)] font-medium mb-1">Features</p>
              <ul className="text-sm text-[var(--color-muted)] space-y-1">
                <li>- Accurate prayer times calculation</li>
                <li>- Multiple calculation methods</li>
                <li>- Qibla compass</li>
                <li>- Prayer tracking & statistics</li>
                <li>- Customizable notifications</li>
                <li>- Jumu'ah reminders</li>
              </ul>
            </div>
          </div>
        )}
        </div>
      </div>

      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}

// Category Item Component
function CategoryItem({ 
  icon, 
  title, 
  summary, 
  onClick 
}: { 
  icon: React.ReactNode; 
  title: string; 
  summary: string; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-card)] hover:bg-[var(--color-border)] transition-colors text-left w-full"
    >
      <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[var(--color-text)]">{title}</p>
        <p className="text-sm text-[var(--color-muted)] truncate">{summary}</p>
      </div>
      <svg className="w-5 h-5 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

// Theme Option Component
function ThemeOption({
  active,
  onClick,
  icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        p-4 rounded-xl flex flex-col items-center gap-2 transition-all
        ${active 
          ? 'bg-[var(--color-primary)] text-white' 
          : 'bg-[var(--color-card)] text-[var(--color-text)] hover:bg-[var(--color-border)]'
        }
      `}
    >
      {icon}
      <span className="font-medium">{label}</span>
      {description && (
        <span className={`text-xs ${active ? 'text-white/70' : 'text-[var(--color-muted)]'}`}>
          {description}
        </span>
      )}
    </button>
  );
}

function ToggleButton({ 
  active, 
  onClick, 
  children 
}: { 
  active: boolean; 
  onClick: () => void; 
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all
        ${active 
          ? 'bg-[var(--color-primary)] text-white' 
          : 'bg-[var(--color-card)] text-[var(--color-text)] hover:bg-[var(--color-border)]'
        }
      `}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-card)] cursor-pointer hover:bg-[var(--color-border)] transition-colors"
    >
      <div className="mr-4">
        <p className="text-[var(--color-text)] font-medium">{label}</p>
        <p className="text-sm text-[var(--color-muted)]">{description}</p>
      </div>
      <div className={`
        relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200
        ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}
      `}>
        <div className={`
          absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `} />
      </div>
    </div>
  );
}

// Icons
function LocationIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function CalculationIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}

function AppearanceIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
    </svg>
  );
}

function MosqueIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-1.5 2-3 3.5-3 5.5a3 3 0 106 0c0-2-1.5-3.5-3-5.5zM4 21v-6a8 8 0 0116 0v6M8 21v-4M16 21v-4" />
    </svg>
  );
}

function NotificationIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

function TravelIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

function AboutIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  );
}

function AutoIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

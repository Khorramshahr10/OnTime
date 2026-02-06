import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { Preferences } from '@capacitor/preferences';

// 'auto' = dark after Maghrib, light after Fajr
export type Theme = 'light' | 'dark' | 'system' | 'auto';

const THEME_KEY = 'ontime_theme';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  updatePrayerTimes: (fajrTime: Date | null, maghribTime: Date | null) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

// Determine if current time is in "night" period (between Maghrib and Fajr)
function isNightTime(fajrTime: Date | null, maghribTime: Date | null): boolean {
  if (!fajrTime || !maghribTime) {
    // Fallback: use 6 PM to 6 AM as night
    const now = new Date();
    const hour = now.getHours();
    return hour >= 18 || hour < 6;
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const fajrMinutes = fajrTime.getHours() * 60 + fajrTime.getMinutes();
  const maghribMinutes = maghribTime.getHours() * 60 + maghribTime.getMinutes();

  // Night is from Maghrib until Fajr (next day)
  // If now >= maghrib OR now < fajr, it's night
  return nowMinutes >= maghribMinutes || nowMinutes < fajrMinutes;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);
  const [prayerBasedTheme, setPrayerBasedTheme] = useState<'light' | 'dark'>('light');
  const [fajrTime, setFajrTime] = useState<Date | null>(null);
  const [maghribTime, setMaghribTime] = useState<Date | null>(null);

  // Calculate effective theme based on mode
  const effectiveTheme = 
    theme === 'system' ? systemTheme : 
    theme === 'auto' ? prayerBasedTheme : 
    theme;

  // Update prayer times from the app
  const updatePrayerTimes = useCallback((fajr: Date | null, maghrib: Date | null) => {
    setFajrTime(fajr);
    setMaghribTime(maghrib);
  }, []);

  // Load saved theme on mount
  useEffect(() => {
    loadTheme();
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Update prayer-based theme when times change or periodically
  useEffect(() => {
    const updatePrayerBasedTheme = () => {
      const shouldBeDark = isNightTime(fajrTime, maghribTime);
      setPrayerBasedTheme(shouldBeDark ? 'dark' : 'light');
    };

    // Update immediately
    updatePrayerBasedTheme();

    // Check every minute for theme changes
    const interval = setInterval(updatePrayerBasedTheme, 60000);
    return () => clearInterval(interval);
  }, [fajrTime, maghribTime]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Update theme-color meta tag
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', effectiveTheme === 'dark' ? '#0F0F0F' : '#FAFAFA');
    }
  }, [effectiveTheme]);

  async function loadTheme() {
    try {
      const { value } = await Preferences.get({ key: THEME_KEY });
      if (value && ['light', 'dark', 'system', 'auto'].includes(value)) {
        setThemeState(value as Theme);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  }

  async function setTheme(newTheme: Theme) {
    setThemeState(newTheme);
    try {
      await Preferences.set({ key: THEME_KEY, value: newTheme });
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }

  function toggleTheme() {
    const nextTheme = effectiveTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  }

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme, toggleTheme, updatePrayerTimes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

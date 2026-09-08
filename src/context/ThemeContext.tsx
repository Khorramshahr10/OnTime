import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { Preferences } from '@capacitor/preferences';

// 'auto' = dark after Maghrib, light after Fajr
export type Theme = 'light' | 'dark' | 'system' | 'auto' | 'desert' | 'rose' | 'forest' | 'ocean';

const THEME_KEY = 'ontime_theme';

type EffectiveTheme = 'light' | 'dark' | 'desert' | 'rose' | 'forest' | 'ocean';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: EffectiveTheme;
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
  const effectiveTheme: EffectiveTheme =
    theme === 'system' ? systemTheme :
    theme === 'auto' ? prayerBasedTheme :
    theme;

  // Update prayer times from the app
  const updatePrayerTimes = useCallback((fajr: Date | null, maghrib: Date | null) => {
    // At polar latitudes adhan returns Invalid Date for prayers that don't
    // occur. An Invalid Date is still a truthy object, so isNightTime's
    // `!fajrTime || !maghribTime` fallback never engaged and every comparison
    // against NaN came back false — pinning Auto to light around the clock,
    // including straight through the polar night. Normalising to null here hands
    // those users the clock-based 18:00-06:00 fallback instead.
    const real = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d : null);
    setFajrTime(real(fajr));
    setMaghribTime(real(maghrib));
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

    root.classList.remove('dark', 'desert', 'rose', 'forest', 'ocean');
    if (effectiveTheme !== 'light') {
      root.classList.add(effectiveTheme);
    }

    // Update every theme-color meta tag. index.html declares two, media-scoped
    // to prefers-color-scheme light and dark, so the browser applies whichever
    // matches the OS preference — and querySelector always returned the light
    // one. Under a dark OS preference the applied meta was therefore never
    // written: dark browser chrome over a light app, and Desert/Rose/Forest/
    // Ocean never tinting the chrome at all. Web-only; native drives the
    // StatusBar plugin from the same palette in App.tsx.
    const colors: Record<EffectiveTheme, string> = { light: '#FAFAFA', dark: '#0F0F0F', desert: '#1C1510', rose: '#160D14', forest: '#0C1510', ocean: '#0A1018' };
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute('content', colors[effectiveTheme]);
    }
  }, [effectiveTheme]);

  async function loadTheme() {
    try {
      const { value } = await Preferences.get({ key: THEME_KEY });
      if (value && ['light', 'dark', 'system', 'auto', 'desert', 'rose', 'forest', 'ocean'].includes(value)) {
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

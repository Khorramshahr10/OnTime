import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Preferences } from '@capacitor/preferences';
import type { LocationData, Coordinates } from '../types';

const LOCATION_KEY = 'ontime_location';

// Default to Mecca if no location is available
const defaultLocation: LocationData = {
  coordinates: { latitude: 21.4225, longitude: 39.8262 },
  cityName: 'Mecca',
  countryCode: 'SA',
};

interface LocationContextType {
  location: LocationData;
  isLoading: boolean;
  error: string | null;
  refreshLocation: () => Promise<LocationData | undefined>;
  setManualLocation: (coords: Coordinates, cityName: string, countryCode?: string) => void;
  getGPSLocation: () => Promise<LocationData>;
}

const LocationContext = createContext<LocationContextType | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<LocationData>(defaultLocation);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeLocation();
  }, []);

  async function initializeLocation() {
    // Try to load saved location — onboarding handles initial GPS request
    const savedLocation = await loadSavedLocation();
    if (savedLocation) {
      setLocation(savedLocation);
    }
    setIsLoading(false);
  }

  async function loadSavedLocation(): Promise<LocationData | null> {
    try {
      const { value } = await Preferences.get({ key: LOCATION_KEY });
      if (value) {
        return JSON.parse(value) as LocationData;
      }
    } catch (err) {
      console.error('Failed to load saved location:', err);
    }
    return null;
  }

  async function saveLocation(loc: LocationData) {
    try {
      await Preferences.set({
        key: LOCATION_KEY,
        value: JSON.stringify(loc),
      });
    } catch (err) {
      console.error('Failed to save location:', err);
    }
  }

  async function refreshLocation(): Promise<LocationData | undefined> {
    setError(null);

    try {
      // Check permissions first
      const permStatus = await Geolocation.checkPermissions();

      if (permStatus.location === 'denied') {
        // Request permission
        const requestResult = await Geolocation.requestPermissions();
        if (requestResult.location === 'denied') {
          setError('Location permission denied');
          return undefined;
        }
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });

      const coords: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      // Reverse geocode to get city name
      const { displayName, shortName, countryCode } = await reverseGeocode(coords);

      const newLocation: LocationData = {
        coordinates: coords,
        cityName: displayName,
        shortName,
        countryCode,
      };

      setLocation(newLocation);
      await saveLocation(newLocation);
      return newLocation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get location';
      setError(message);
      console.error('Location error:', err);
      return undefined;
    }
  }

  async function reverseGeocode(
    coords: Coordinates
  ): Promise<{ displayName: string; shortName?: string; countryCode?: string }> {
    try {
      // Using free Nominatim API for reverse geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
        {
          headers: {
            'User-Agent': 'OnTime Prayer App',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const addr = data.address || {};
        const city = addr.city || addr.town || addr.village || addr.county || '';
        const suburb = addr.suburb || addr.neighbourhood || '';
        const road = addr.road || '';
        const state = addr.state || '';
        const countryCode = addr.country_code ? addr.country_code.toUpperCase() : undefined;

        let displayName: string;
        if (suburb && city) {
          displayName = `${suburb}, ${city}`;
        } else if (road && city) {
          displayName = `${road}, ${city}`;
        } else if (city && state) {
          displayName = `${city}, ${state}`;
        } else if (city) {
          displayName = city;
        } else {
          displayName = 'Unknown Location';
        }

        return { displayName, shortName: city || undefined, countryCode };
      }
    } catch (err) {
      console.error('Reverse geocoding failed:', err);
    }

    return { displayName: 'Current Location' };
  }

  function setManualLocation(coords: Coordinates, cityName: string, countryCode?: string) {
    // A manually picked city is already short enough to use as-is.
    const newLocation: LocationData = { coordinates: coords, cityName, shortName: cityName, countryCode };
    setLocation(newLocation);
    saveLocation(newLocation);
    setError(null);
  }

  async function getGPSLocation(): Promise<LocationData> {
    const permStatus = await Geolocation.checkPermissions();

    if (permStatus.location === 'denied') {
      const requestResult = await Geolocation.requestPermissions();
      if (requestResult.location === 'denied') {
        throw new Error('Location permission denied');
      }
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });

    const coords: Coordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    const { displayName, shortName, countryCode } = await reverseGeocode(coords);

    return { coordinates: coords, cityName: displayName, shortName, countryCode };
  }

  return (
    <LocationContext.Provider
      value={{
        location,
        isLoading,
        error,
        refreshLocation,
        setManualLocation,
        getGPSLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}

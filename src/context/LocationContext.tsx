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
  refreshLocation: () => Promise<void>;
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
    // Try to load saved location
    const savedLocation = await loadSavedLocation();
    if (savedLocation) {
      setLocation(savedLocation);
      setIsLoading(false);
      return;
    }

    // No saved location — use Mecca default, let user pick a city or use GPS
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

  async function refreshLocation() {
    setError(null);
    
    try {
      // Check permissions first
      const permStatus = await Geolocation.checkPermissions();
      
      if (permStatus.location === 'denied') {
        // Request permission
        const requestResult = await Geolocation.requestPermissions();
        if (requestResult.location === 'denied') {
          setError('Location permission denied');
          return;
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
      const cityName = await reverseGeocode(coords);

      const newLocation: LocationData = {
        coordinates: coords,
        cityName,
      };

      setLocation(newLocation);
      await saveLocation(newLocation);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get location';
      setError(message);
      console.error('Location error:', err);
    }
  }

  async function reverseGeocode(coords: Coordinates): Promise<string> {
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
        const city = data.address?.city || 
                     data.address?.town || 
                     data.address?.village || 
                     data.address?.county ||
                     'Unknown Location';
        return city;
      }
    } catch (err) {
      console.error('Reverse geocoding failed:', err);
    }
    
    return 'Current Location';
  }

  function setManualLocation(coords: Coordinates, cityName: string, countryCode?: string) {
    const newLocation: LocationData = { coordinates: coords, cityName, countryCode };
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

    const cityName = await reverseGeocode(coords);

    return { coordinates: coords, cityName };
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

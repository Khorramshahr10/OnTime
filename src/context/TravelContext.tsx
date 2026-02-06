import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSettings } from './SettingsContext';
import { useLocation } from './LocationContext';
import { calculateDistanceKm } from '../utils/distance';
import type { TravelState, HomeBaseLocation, TravelSettings } from '../types';

interface TravelContextType {
  travelState: TravelState;
  setHomeBase: (home: HomeBaseLocation) => void;
  clearHomeBase: () => void;
  setTravelOverride: (override: TravelSettings['override']) => void;
  toggleJama: (pair: 'dhuhrAsr' | 'maghribIsha') => void;
  toggleTravelEnabled: () => void;
}

const defaultTravelState: TravelState = {
  isTraveling: false,
  distanceFromHomeKm: null,
  isAutoDetected: false,
  qasr: { dhuhr: false, asr: false, isha: false },
  jamaDhuhrAsr: false,
  jamaMaghribIsha: false,
};

const TravelContext = createContext<TravelContextType | null>(null);

export function TravelProvider({ children }: { children: ReactNode }) {
  const { settings, updateTravel } = useSettings();
  const { location } = useLocation();

  const travelState = useMemo<TravelState>(() => {
    const { travel } = settings;

    if (!travel.enabled || !travel.homeBase) {
      return defaultTravelState;
    }

    // Force overrides
    if (travel.override === 'force_off') {
      return defaultTravelState;
    }

    const distance = calculateDistanceKm(
      travel.homeBase.coordinates,
      location.coordinates,
    );

    let isTraveling = false;
    let isAutoDetected = false;

    if (travel.override === 'force_on') {
      isTraveling = true;
    } else {
      // Auto detection
      isTraveling = distance >= travel.distanceThresholdKm;
      isAutoDetected = isTraveling;
    }

    // Check max travel days expiration
    if (isTraveling && travel.maxTravelDays > 0 && travel.travelStartDate) {
      const startDate = new Date(travel.travelStartDate);
      const now = new Date();
      const daysDiff = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > travel.maxTravelDays) {
        isTraveling = false;
      }
    }

    if (!isTraveling) {
      return {
        ...defaultTravelState,
        distanceFromHomeKm: distance,
      };
    }

    return {
      isTraveling: true,
      distanceFromHomeKm: distance,
      isAutoDetected,
      qasr: { dhuhr: true, asr: true, isha: true },
      jamaDhuhrAsr: travel.jamaDhuhrAsr,
      jamaMaghribIsha: travel.jamaMaghribIsha,
    };
  }, [settings, location]);

  function setHomeBase(home: HomeBaseLocation) {
    updateTravel({ homeBase: home });
  }

  function clearHomeBase() {
    updateTravel({ homeBase: null, travelStartDate: null });
  }

  function setTravelOverride(override: TravelSettings['override']) {
    const updates: Partial<TravelSettings> = { override };
    // When forcing on, set the travel start date if not already set
    if (override === 'force_on' && !settings.travel.travelStartDate) {
      updates.travelStartDate = new Date().toISOString().split('T')[0];
    }
    updateTravel(updates);
  }

  function toggleJama(pair: 'dhuhrAsr' | 'maghribIsha') {
    if (pair === 'dhuhrAsr') {
      updateTravel({ jamaDhuhrAsr: !settings.travel.jamaDhuhrAsr });
    } else {
      updateTravel({ jamaMaghribIsha: !settings.travel.jamaMaghribIsha });
    }
  }

  function toggleTravelEnabled() {
    const newEnabled = !settings.travel.enabled;
    const updates: Partial<TravelSettings> = { enabled: newEnabled };
    if (newEnabled && !settings.travel.travelStartDate) {
      updates.travelStartDate = new Date().toISOString().split('T')[0];
    }
    updateTravel(updates);
  }

  return (
    <TravelContext.Provider
      value={{
        travelState,
        setHomeBase,
        clearHomeBase,
        setTravelOverride,
        toggleJama,
        toggleTravelEnabled,
      }}
    >
      {children}
    </TravelContext.Provider>
  );
}

export function useTravel() {
  const context = useContext(TravelContext);
  if (!context) {
    throw new Error('useTravel must be used within a TravelProvider');
  }
  return context;
}

import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react';
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
  confirmTravel: () => void;
  dismissTravel: () => void;
}

const defaultTravelState: TravelState = {
  isTraveling: false,
  travelPending: false,
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
  const [dismissed, setDismissed] = useState(false);

  const travelState = useMemo<TravelState>(() => {
    const { travel } = settings;

    // Detection needs somewhere to measure from, and force_off is the opt-out.
    // It deliberately does NOT require travel.enabled: that switch defaulted to
    // off, so the feature meant to notice a journey could only ever run once the
    // user had already found and enabled it by hand. Being far from home is what
    // raises the offer now; accepting the offer is what switches travel on.
    if (!travel.homeBase || travel.override === 'force_off') {
      return defaultTravelState;
    }

    const distance = calculateDistanceKm(
      travel.homeBase.coordinates,
      location.coordinates,
    );

    let isTraveling = false;
    let isAutoDetected = false;
    let travelPending = false;

    if (travel.override === 'force_on') {
      isTraveling = true;
    } else if (distance >= travel.distanceThresholdKm) {
      if (travel.enabled && travel.autoConfirmed) {
        isTraveling = true;
        isAutoDetected = true;
      } else if (!dismissed && !travel.promptDismissed) {
        // Offer it — qasr is never applied without an explicit yes.
        travelPending = true;
      }
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

    if (!isTraveling && !travelPending) {
      return {
        ...defaultTravelState,
        distanceFromHomeKm: distance,
      };
    }

    if (travelPending) {
      return {
        ...defaultTravelState,
        travelPending: true,
        distanceFromHomeKm: distance,
      };
    }

    return {
      isTraveling: true,
      travelPending: false,
      distanceFromHomeKm: distance,
      isAutoDetected,
      qasr: { dhuhr: true, asr: true, isha: true },
      jamaDhuhrAsr: travel.jamaDhuhrAsr,
      jamaMaghribIsha: travel.jamaMaghribIsha,
    };
  }, [settings, location, dismissed]);

  // Home again: forget this trip's confirmation and any "not now", so the next
  // journey is offered afresh. Deliberately keyed on being below the threshold
  // rather than on having crossed it: the previous distance lived in a ref, so
  // after a restart the first reading was always treated as "no previous" and
  // the reset was skipped — leaving a stale confirmation that would silently
  // switch qasr on at the start of the next trip, with no prompt.
  useEffect(() => {
    const { travel } = settings;
    if (!travel.homeBase) return;

    const distance = calculateDistanceKm(
      travel.homeBase.coordinates,
      location.coordinates,
    );
    if (distance >= travel.distanceThresholdKm) return;

    if (travel.autoConfirmed || travel.promptDismissed) {
      updateTravel({ autoConfirmed: false, travelStartDate: null, promptDismissed: false });
    }
    if (dismissed) setDismissed(false);
  }, [settings, location, updateTravel, dismissed]);

  function setHomeBase(home: HomeBaseLocation) {
    updateTravel({ homeBase: home });
  }

  function clearHomeBase() {
    updateTravel({ homeBase: null, travelStartDate: null, autoConfirmed: false });
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
    // Switching it off by hand also means "stop asking" until I'm home again.
    if (!newEnabled) updates.promptDismissed = true;
    updateTravel(updates);
  }

  function confirmTravel() {
    updateTravel({
      enabled: true,
      autoConfirmed: true,
      travelStartDate: new Date().toISOString().split('T')[0],
      promptDismissed: false,
    });
    setDismissed(false);
  }

  function dismissTravel() {
    setDismissed(true);
    // Persisted too, so "Not now" survives a restart instead of asking again.
    updateTravel({ promptDismissed: true });
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
        confirmTravel,
        dismissTravel,
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

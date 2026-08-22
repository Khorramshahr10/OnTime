import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useQibla } from './useQibla';
import { headingInstruction } from '../utils/heading';

/** Below this the magnetometer reading isn't trustworthy and needs a figure-eight. */
const CALIBRATED_ACCURACY = 2;

export interface QiblaHeadingState {
  /** False off-device, where there is no magnetometer to read. */
  supported: boolean;
  /** True when the sensor exists but couldn't be read. */
  unavailable: boolean;
  calibrated: boolean;
  /** Degrees still to turn; positive is to your right. */
  rotation: number;
  aligned: boolean;
}

/**
 * Owns the compass for the qibla screen so the dial and the globe read from
 * one sensor listener rather than two.
 */
export function useQiblaHeading(): QiblaHeadingState {
  const { qiblaDirection, deviceHeading, accuracy, error, startListening, stopListening } = useQibla();
  const supported = Capacitor.isNativePlatform();
  const wasAligned = useRef(false);

  useEffect(() => {
    if (!supported) return;
    startListening();
    return () => {
      stopListening();
    };
    // Started once for the life of the screen; the hook re-reads location itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // Derived here rather than taken from the hook's `rotationAngle`: that value
  // is computed inside the sensor callback, which captured the bearing as it
  // was when the listener started. Location resolves after this screen mounts
  // (the app falls back to Makkah until GPS answers), so the captured bearing
  // goes stale. Both parts below are recomputed on every reading.
  const rotation = qiblaDirection - deviceHeading;
  const calibrated = accuracy >= CALIBRATED_ACCURACY;
  const { aligned } = headingInstruction(rotation);

  // A short buzz the moment you line up, so you don't have to watch the screen
  // while you turn.
  useEffect(() => {
    if (!supported) return;
    if (aligned && calibrated && !wasAligned.current) {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    }
    wasAligned.current = aligned && calibrated;
  }, [aligned, calibrated, supported]);

  return { supported, unavailable: !!error, calibrated, rotation, aligned };
}

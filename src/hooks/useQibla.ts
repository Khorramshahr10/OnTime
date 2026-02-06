import { useState, useEffect, useCallback } from 'react';
import { Motion } from '@capacitor/motion';
import { calculateQiblaDirection } from '../services/prayerService';
import { useLocation } from '../context/LocationContext';

interface QiblaData {
  qiblaDirection: number; // Direction to Qibla from North
  deviceHeading: number; // Current device heading
  rotationAngle: number; // How much to rotate the compass arrow
  isCalibrated: boolean;
  error: string | null;
}

export function useQibla() {
  const { location } = useLocation();
  const [data, setData] = useState<QiblaData>({
    qiblaDirection: 0,
    deviceHeading: 0,
    rotationAngle: 0,
    isCalibrated: false,
    error: null,
  });
  const [isListening, setIsListening] = useState(false);

  // Calculate Qibla direction based on current location
  const qiblaDirection = calculateQiblaDirection(location.coordinates);

  const startListening = useCallback(async () => {
    if (isListening) return;

    try {
      await Motion.addListener('orientation', (event) => {
        // Convert alpha to compass heading (clockwise from north)
        // webkitCompassHeading is always clockwise; alpha follows W3C spec (counterclockwise)
        const raw = event.alpha ?? 0;
        const heading = (event as unknown as Record<string, number>).webkitCompassHeading ?? (360 - raw) % 360;

        // Rotate the arrow so it points toward Qibla
        const rotation = qiblaDirection - heading;

        setData({
          qiblaDirection,
          deviceHeading: heading,
          rotationAngle: rotation,
          isCalibrated: true,
          error: null,
        });
      });

      setIsListening(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access motion sensors';
      setData((prev) => ({
        ...prev,
        error: message,
        isCalibrated: false,
      }));
    }
  }, [isListening, qiblaDirection]);

  const stopListening = useCallback(async () => {
    if (!isListening) return;

    try {
      await Motion.removeAllListeners();
      setIsListening(false);
    } catch (err) {
      console.error('Failed to stop motion listener:', err);
    }
  }, [isListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isListening) {
        Motion.removeAllListeners();
      }
    };
  }, [isListening]);

  return {
    ...data,
    qiblaDirection,
    isListening,
    startListening,
    stopListening,
  };
}

import { useEffect } from 'react';
import { useQibla } from '../hooks/useQibla';

interface QiblaCompassProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QiblaCompass({ isOpen, onClose }: QiblaCompassProps) {
  const { 
    qiblaDirection, 
    rotationAngle, 
    isCalibrated, 
    error,
    startListening,
    stopListening,
    isListening,
  } = useQibla();

  useEffect(() => {
    if (isOpen && !isListening) {
      startListening();
    }
    
    return () => {
      if (isListening) {
        stopListening();
      }
    };
  }, [isOpen, isListening, startListening, stopListening]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-background)] safe-area-top safe-area-bottom animate-slide-in">
      <div className="max-w-lg mx-auto px-4 py-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-[var(--color-card)] transition-colors"
          >
            <svg className="w-6 h-6 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Qibla Direction</h2>
          <div className="w-10" />
        </div>

        {/* Compass */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {error ? (
            <div className="text-center py-8">
              <p className="text-[var(--color-muted)] mb-4">{error}</p>
              <button
                onClick={startListening}
                className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              <div className="relative w-64 h-64">
                {/* Compass circle */}
                <div className="absolute inset-0 rounded-full border-4 border-[var(--color-border)]" />

                {/* Cardinal directions */}
                <span className="absolute top-2 left-1/2 -translate-x-1/2 text-sm font-bold text-[var(--color-text)]">N</span>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-sm text-[var(--color-muted)]">S</span>
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted)]">W</span>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted)]">E</span>

                {/* Qibla arrow */}
                <div
                  className="absolute inset-0 flex items-center justify-center transition-transform duration-100"
                  style={{ transform: `rotate(${rotationAngle}deg)` }}
                >
                  <div className="w-1 h-24 bg-gradient-to-t from-transparent via-[var(--color-primary)] to-[var(--color-primary)] rounded-full relative">
                    {/* Arrow head */}
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-b-[12px] border-l-transparent border-r-transparent border-b-[var(--color-primary)]" />
                    {/* Kaaba icon at tip */}
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-lg">🕋</span>
                  </div>
                </div>

                {/* Center dot */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[var(--color-primary)]" />
              </div>

              {/* Info */}
              <div className="mt-6 text-center">
                <p className="text-sm text-[var(--color-muted)]">
                  Qibla is {Math.round(qiblaDirection)}° from North
                </p>
                {!isCalibrated && (
                  <p className="text-xs text-[var(--color-muted)] mt-2">
                    Move your device in a figure-8 to calibrate
                  </p>
                )}
              </div>
            </>
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

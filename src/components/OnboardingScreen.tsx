import { useState, useEffect, useRef } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Geolocation } from '@capacitor/geolocation';
import { useLocation } from '../context/LocationContext';

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState<'welcome' | 'notifications' | 'location' | 'locating'>('welcome');
  const [notifGranted, setNotifGranted] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const { refreshLocation } = useLocation();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function handleNotificationPermission() {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === 'granted') {
        setNotifGranted(true);
        setStep('location');
        return;
      }
      const result = await LocalNotifications.requestPermissions();
      setNotifGranted(result.display === 'granted');
    } catch {
      // Continue even if notification permission fails
    }
    setStep('location');
  }

  async function handleLocationPermission() {
    setStep('locating');
    setElapsed(0);

    // Start elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        const result = await Geolocation.requestPermissions();
        if (result.location === 'denied') {
          if (timerRef.current) clearInterval(timerRef.current);
          setLocationStatus('Location denied — you can set it manually in Settings.');
          setTimeout(onComplete, 1500);
          return;
        }
      }
      setLocationStatus('Finding your location...');
      await refreshLocation();
      if (timerRef.current) clearInterval(timerRef.current);
      setLocationStatus('Location found!');
      setTimeout(onComplete, 600);
    } catch {
      if (timerRef.current) clearInterval(timerRef.current);
      setLocationStatus('Could not get location — you can set it in Settings.');
      setTimeout(onComplete, 1500);
    }
  }

  function skipLocation() {
    if (timerRef.current) clearInterval(timerRef.current);
    onComplete();
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-6 safe-area-top safe-area-bottom">
      <div className="max-w-sm w-full text-center">

        {step === 'welcome' && (
          <div className="animate-fade-in">
            <div className="text-6xl mb-6">🕌</div>
            <h1 className="text-3xl font-bold text-[var(--color-text)] mb-3">OnTime</h1>
            <p className="text-[var(--color-muted)] mb-10 leading-relaxed">
              Accurate prayer times, Qibla direction, and athan reminders — all in one app.
            </p>
            <button
              onClick={() => setStep('notifications')}
              className="w-full py-3.5 bg-[var(--color-primary)] text-white font-semibold rounded-lg text-lg"
            >
              Get Started
            </button>
          </div>
        )}

        {step === 'notifications' && (
          <div className="animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-6 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Prayer Notifications</h2>
            <p className="text-[var(--color-muted)] mb-8 leading-relaxed">
              Get notified when it's time to pray. We'll send reminders for each prayer with the athan sound of your choice.
            </p>
            <button
              onClick={handleNotificationPermission}
              className="w-full py-3.5 bg-[var(--color-primary)] text-white font-semibold rounded-lg text-lg mb-3"
            >
              Enable Notifications
            </button>
            <button
              onClick={() => setStep('location')}
              className="w-full py-3 text-[var(--color-muted)] font-medium text-sm"
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 'location' && (
          <div className="animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Your Location</h2>
            <p className="text-[var(--color-muted)] mb-8 leading-relaxed">
              Prayer times are calculated based on your location. Allow GPS access for accurate times wherever you are.
            </p>
            <button
              onClick={handleLocationPermission}
              className="w-full py-3.5 bg-blue-500 text-white font-semibold rounded-lg text-lg mb-3"
            >
              Enable Location
            </button>
            <button
              onClick={skipLocation}
              className="w-full py-3 text-[var(--color-muted)] font-medium text-sm"
            >
              Skip — I'll set it manually
            </button>
          </div>
        )}

        {step === 'locating' && (
          <div className="animate-fade-in">
            {locationStatus === 'Location found!' ? (
              <>
                <div className="w-16 h-16 mx-auto mb-6 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">All Set!</h2>
                <p className="text-green-600">Location found!</p>
              </>
            ) : locationStatus?.includes('denied') || locationStatus?.includes('Could not') ? (
              <>
                <div className="w-16 h-16 mx-auto mb-6 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">No worries</h2>
                <p className="text-sm text-[var(--color-muted)]">{locationStatus}</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <div className="w-8 h-8 border-[3px] border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
                <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Finding You</h2>
                <p className="text-[var(--color-muted)] mb-1">{locationStatus || 'Requesting GPS access...'}</p>
                <p className="text-xs text-[var(--color-muted)] mt-1">
                  {elapsed < 20
                    ? 'This can take 5–20 seconds on first load'
                    : `${elapsed}s — taking longer than usual`}
                </p>

                {/* Show skip option after 20 seconds */}
                {elapsed >= 20 && (
                  <button
                    onClick={skipLocation}
                    className="mt-6 w-full py-3 text-[var(--color-muted)] font-medium text-sm border border-[var(--color-border)] rounded-lg"
                  >
                    Continue without GPS — I'll set it later
                  </button>
                )}
              </>
            )}
          </div>
        )}

      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

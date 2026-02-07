import { useState, useEffect } from 'react';
import { 
  getRecentRecords, 
  getStats, 
  type DailyRecord, 
  type PrayerStats,
  type PrayerStatus 
} from '../services/prayerTrackingService';
import type { PrayerName } from '../types';

interface DashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRAYER_ORDER: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const PRAYER_NAMES: Record<PrayerName, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

export function Dashboard({ isOpen, onClose }: DashboardProps) {
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [stats, setStats] = useState<PrayerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [recentRecords, recentStats] = await Promise.all([
        getRecentRecords(7),
        getStats(7),
      ]);
      setRecords(recentRecords);
      setStats(recentStats);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Today';
    }
    if (dateStr === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getStatusStyle = (status: PrayerStatus | undefined) => {
    switch (status) {
      case 'ontime':
        return 'bg-emerald-500';
      case 'missed':
        return 'bg-red-400';
      default:
        return 'bg-[var(--color-border)]';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-background)] safe-area-top safe-area-bottom animate-slide-in">
      <div className="max-w-lg mx-auto h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-6">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-[var(--color-card)] transition-colors"
          >
            <svg className="w-6 h-6 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Dashboard</h2>
            <p className="text-sm text-[var(--color-muted)]">Your prayer tracking overview</p>
          </div>
          <div className="w-10" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8">

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {/* Stats Overview */}
              {stats && (
                <div className="mb-8">
                  {/* Main Score Card */}
                  <div className="p-5 rounded-lg bg-[var(--color-card)] ring-1 ring-[var(--color-border)] mb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-base font-medium text-[var(--color-muted)]">Weekly Score</p>
                        <p className="text-4xl font-bold text-[var(--color-text)] mt-1">{stats.percentage}%</p>
                      </div>
                      <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
                        <svg className="w-8 h-8 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="h-2.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-500"
                        style={{ width: `${stats.percentage}%` }}
                      />
                    </div>
                    
                    <p className="text-sm text-[var(--color-muted)] mt-3">
                      {stats.onTime} of {stats.totalTracked} prayers on time this week
                    </p>
                  </div>

                  {/* Stat Pills */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-[var(--color-card)] ring-1 ring-[var(--color-border)]">
                      <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-text)]">{stats.onTime}</p>
                        <p className="text-sm text-[var(--color-muted)]">On Time</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-[var(--color-card)] ring-1 ring-[var(--color-border)]">
                      <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-text)]">{stats.missed}</p>
                        <p className="text-sm text-[var(--color-muted)]">Missed</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Activity List */}
              <div className="mb-6 space-y-3">
                {records.map((record) => (
                  <div key={record.date} className="rounded-lg bg-[var(--color-card)] ring-1 ring-[var(--color-border)] p-4">
                    <p className="text-sm font-medium text-[var(--color-text)] mb-3">
                      {formatDate(record.date)}
                    </p>
                    <div className="flex items-center justify-between">
                      {PRAYER_ORDER.map((prayer) => {
                        const status = record.prayers[prayer];
                        return (
                          <div key={prayer} className="flex flex-col items-center gap-1.5">
                            <div
                              className={`w-8 h-8 rounded-lg ${getStatusStyle(status)} transition-colors flex items-center justify-center`}
                            >
                              {status === 'ontime' && (
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                              {status === 'missed' && (
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                            </div>
                            <span className="text-xs text-[var(--color-muted)]">
                              {PRAYER_NAMES[prayer].slice(0, 3)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Legend */}
                <div className="flex items-center justify-center gap-6 pt-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded bg-emerald-500" />
                    <span className="text-sm text-[var(--color-muted)]">On time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded bg-red-400" />
                    <span className="text-sm text-[var(--color-muted)]">Missed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded bg-[var(--color-border)]" />
                    <span className="text-sm text-[var(--color-muted)]">Untracked</span>
                  </div>
                </div>
              </div>

              {/* Info Card */}
              <div className="flex items-start gap-4 p-4 rounded-lg bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]/10">
                <div className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-medium text-[var(--color-text)]">Track your prayers</p>
                  <p className="text-sm text-[var(--color-muted)] mt-1">
                    Tap on a passed prayer in the main screen and mark it as "On time" or "Missed" to track your progress.
                  </p>
                </div>
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

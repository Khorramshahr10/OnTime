import { Preferences } from '@capacitor/preferences';
import type { PrayerName } from '../types';

const TRACKING_KEY = 'ontime_prayer_tracking';

export type PrayerStatus = 'ontime' | 'missed' | 'untracked';

export interface PrayerRecord {
  date: string; // YYYY-MM-DD
  prayer: PrayerName;
  status: PrayerStatus;
  trackedAt: string; // ISO timestamp
}

export interface DailyRecord {
  date: string;
  prayers: Partial<Record<PrayerName, PrayerStatus>>;
}

export interface TrackingData {
  records: PrayerRecord[];
}

// Get today's date as YYYY-MM-DD
export function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

// Get date key for a specific date
export function getDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Load all tracking data
export async function loadTrackingData(): Promise<TrackingData> {
  try {
    const { value } = await Preferences.get({ key: TRACKING_KEY });
    if (value) {
      return JSON.parse(value) as TrackingData;
    }
  } catch (error) {
    console.error('Failed to load tracking data:', error);
  }
  return { records: [] };
}

// Save tracking data
async function saveTrackingData(data: TrackingData): Promise<void> {
  try {
    await Preferences.set({
      key: TRACKING_KEY,
      value: JSON.stringify(data),
    });
  } catch (error) {
    console.error('Failed to save tracking data:', error);
  }
}

// Track a prayer
export async function trackPrayer(
  prayer: PrayerName,
  status: PrayerStatus,
  date?: Date
): Promise<void> {
  const data = await loadTrackingData();
  const dateKey = date ? getDateKey(date) : getTodayKey();
  
  // Remove any existing record for this prayer on this date
  data.records = data.records.filter(
    (r) => !(r.date === dateKey && r.prayer === prayer)
  );
  
  // Add new record (only if not untracked)
  if (status !== 'untracked') {
    data.records.push({
      date: dateKey,
      prayer,
      status,
      trackedAt: new Date().toISOString(),
    });
  }
  
  // Keep only last 30 days of records to save space
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = getDateKey(thirtyDaysAgo);
  data.records = data.records.filter((r) => r.date >= cutoffDate);
  
  await saveTrackingData(data);
}

// Get status for a specific prayer on a specific date
export async function getPrayerStatus(
  prayer: PrayerName,
  date?: Date
): Promise<PrayerStatus> {
  const data = await loadTrackingData();
  const dateKey = date ? getDateKey(date) : getTodayKey();
  
  const record = data.records.find(
    (r) => r.date === dateKey && r.prayer === prayer
  );
  
  return record?.status || 'untracked';
}

// Get all records for a specific date
export async function getDailyRecord(date?: Date): Promise<DailyRecord> {
  const data = await loadTrackingData();
  const dateKey = date ? getDateKey(date) : getTodayKey();
  
  const dayRecords = data.records.filter((r) => r.date === dateKey);
  
  const prayers: Partial<Record<PrayerName, PrayerStatus>> = {};
  for (const record of dayRecords) {
    prayers[record.prayer] = record.status;
  }
  
  return { date: dateKey, prayers };
}

// Get records for the last N days
export async function getRecentRecords(days: number = 7): Promise<DailyRecord[]> {
  const data = await loadTrackingData();
  const results: DailyRecord[] = [];
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = getDateKey(date);
    
    const dayRecords = data.records.filter((r) => r.date === dateKey);
    const prayers: Partial<Record<PrayerName, PrayerStatus>> = {};
    for (const record of dayRecords) {
      prayers[record.prayer] = record.status;
    }
    
    results.push({ date: dateKey, prayers });
  }
  
  return results;
}

// Get statistics
export interface PrayerStats {
  totalTracked: number;
  onTime: number;
  missed: number;
  percentage: number;
}

export async function getStats(days: number = 7): Promise<PrayerStats> {
  const data = await loadTrackingData();
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffKey = getDateKey(cutoffDate);
  
  const recentRecords = data.records.filter((r) => r.date >= cutoffKey);
  
  const onTime = recentRecords.filter((r) => r.status === 'ontime').length;
  const missed = recentRecords.filter((r) => r.status === 'missed').length;
  const total = onTime + missed;
  
  return {
    totalTracked: total,
    onTime,
    missed,
    percentage: total > 0 ? Math.round((onTime / total) * 100) : 0,
  };
}

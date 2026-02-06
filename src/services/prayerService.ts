import {
  Coordinates,
  CalculationMethod,
  PrayerTimes,
  SunnahTimes,
  Prayer,
  Qibla,
  CalculationParameters,
  Madhab,
} from 'adhan';
import type {
  CalculationMethod as CalcMethodType,
  AsrCalculation,
  PrayerTime,
  PrayerTimesData,
  PrayerName,
  AllPrayerNames,
  SunnahTimesData,
  Coordinates as CoordsType,
} from '../types';

const PRAYER_LABELS: Record<AllPrayerNames, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
  middleOfNight: 'Middle of Night',
  lastThirdOfNight: 'Last Third',
  tahajjud: 'Tahajjud',
};

function getCalculationParameters(method: CalcMethodType): CalculationParameters {
  const methods: Record<CalcMethodType, () => CalculationParameters> = {
    MuslimWorldLeague: () => CalculationMethod.MuslimWorldLeague(),
    Egyptian: () => CalculationMethod.Egyptian(),
    Karachi: () => CalculationMethod.Karachi(),
    UmmAlQura: () => CalculationMethod.UmmAlQura(),
    Dubai: () => CalculationMethod.Dubai(),
    MoonsightingCommittee: () => CalculationMethod.MoonsightingCommittee(),
    NorthAmerica: () => CalculationMethod.NorthAmerica(),
    Kuwait: () => CalculationMethod.Kuwait(),
    Qatar: () => CalculationMethod.Qatar(),
    Singapore: () => CalculationMethod.Singapore(),
    Tehran: () => CalculationMethod.Tehran(),
    Turkey: () => CalculationMethod.Turkey(),
  };

  return methods[method]();
}

export function calculatePrayerTimes(
  coords: CoordsType,
  date: Date,
  method: CalcMethodType,
  asrCalc: AsrCalculation
): PrayerTimesData {
  const coordinates = new Coordinates(coords.latitude, coords.longitude);
  const params = getCalculationParameters(method);
  
  // Set Asr calculation method
  params.madhab = asrCalc === 'Hanafi' ? Madhab.Hanafi : Madhab.Shafi;

  const prayerTimes = new PrayerTimes(coordinates, date, params);
  
  // Calculate Sunnah times (Qiyam/Tahajjud)
  const sunnahTimes = new SunnahTimes(prayerTimes);

  const prayers: PrayerTime[] = [
    { name: 'fajr', label: PRAYER_LABELS.fajr, time: prayerTimes.fajr },
    { name: 'sunrise', label: PRAYER_LABELS.sunrise, time: prayerTimes.sunrise, isOptional: true },
    { name: 'dhuhr', label: PRAYER_LABELS.dhuhr, time: prayerTimes.dhuhr },
    { name: 'asr', label: PRAYER_LABELS.asr, time: prayerTimes.asr },
    { name: 'maghrib', label: PRAYER_LABELS.maghrib, time: prayerTimes.maghrib },
    { name: 'isha', label: PRAYER_LABELS.isha, time: prayerTimes.isha },
    // Sunnah/Optional prayers (night prayers - shown after Isha)
    { name: 'middleOfNight', label: PRAYER_LABELS.middleOfNight, time: sunnahTimes.middleOfTheNight, isOptional: true },
    { name: 'lastThirdOfNight', label: PRAYER_LABELS.lastThirdOfNight, time: sunnahTimes.lastThirdOfTheNight, isOptional: true },
  ];

  const sunnahTimesData: SunnahTimesData = {
    middleOfTheNight: sunnahTimes.middleOfTheNight,
    lastThirdOfTheNight: sunnahTimes.lastThirdOfTheNight,
  };

  const currentPrayerEnum = prayerTimes.currentPrayer();
  const nextPrayerEnum = prayerTimes.nextPrayer();

  const prayerEnumToName = (p: typeof Prayer[keyof typeof Prayer]): PrayerName | null => {
    switch (p) {
      case Prayer.Fajr: return 'fajr';
      case Prayer.Sunrise: return 'sunrise';
      case Prayer.Dhuhr: return 'dhuhr';
      case Prayer.Asr: return 'asr';
      case Prayer.Maghrib: return 'maghrib';
      case Prayer.Isha: return 'isha';
      default: return null;
    }
  };

  let currentPrayer = prayerEnumToName(currentPrayerEnum);
  let nextPrayer = prayerEnumToName(nextPrayerEnum);
  let nextPrayerTime: Date | null = nextPrayer ? prayerTimes.timeForPrayer(nextPrayerEnum) : null;

  // If after Isha and before midnight, next prayer is Fajr (tomorrow)
  if (!nextPrayer && currentPrayer === 'isha') {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowPrayers = new PrayerTimes(coordinates, tomorrow, params);
    nextPrayer = 'fajr';
    nextPrayerTime = tomorrowPrayers.fajr;
  } else if (!nextPrayer && !currentPrayer) {
    // After midnight, before Fajr - show Fajr as next
    nextPrayer = 'fajr';
    nextPrayerTime = prayerTimes.fajr;
  }

  return {
    prayers,
    sunnahTimes: sunnahTimesData,
    currentPrayer,
    nextPrayer,
    nextPrayerTime,
  };
}

export function calculateQiblaDirection(coords: CoordsType): number {
  const coordinates = new Coordinates(coords.latitude, coords.longitude);
  return Qibla(coordinates);
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function getTimeUntil(targetTime: Date): {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
} {
  const now = new Date();
  const diff = targetTime.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds, totalSeconds };
}

export const CALCULATION_METHODS: { value: CalcMethodType; label: string; description: string }[] = [
  { value: 'NorthAmerica', label: 'ISNA', description: 'Islamic Society of North America' },
  { value: 'MuslimWorldLeague', label: 'MWL', description: 'Muslim World League' },
  { value: 'Egyptian', label: 'Egyptian', description: 'Egyptian General Authority' },
  { value: 'UmmAlQura', label: 'Umm Al-Qura', description: 'Umm Al-Qura University, Makkah' },
  { value: 'Dubai', label: 'Dubai', description: 'UAE' },
  { value: 'Karachi', label: 'Karachi', description: 'University of Islamic Sciences, Karachi' },
  { value: 'Kuwait', label: 'Kuwait', description: 'Kuwait' },
  { value: 'Qatar', label: 'Qatar', description: 'Qatar' },
  { value: 'Singapore', label: 'Singapore', description: 'Singapore' },
  { value: 'Tehran', label: 'Tehran', description: 'Institute of Geophysics, Tehran' },
  { value: 'Turkey', label: 'Turkey', description: 'Diyanet, Turkey' },
  { value: 'MoonsightingCommittee', label: 'Moonsighting', description: 'Moonsighting Committee' },
];

export { PRAYER_LABELS };

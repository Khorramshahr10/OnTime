import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SunDomeCard } from '../components/SunDomeCard';
import { LocationProvider } from '../context/LocationContext';
import type { PrayerTime } from '../types';

// jsdom has no WebGL, so stand in for the whole three.js layer and assert on
// the data the card hands it.
const received: unknown[] = [];
vi.mock('../components/three/Scenes', () => ({
  SunDomeView: (props: { data: unknown }) => {
    received.push(props.data);
    return <div data-testid="sun-dome" />;
  },
}));

const at = (h: number, m: number) => new Date(2026, 7, 20, h, m, 0);

const PRAYERS: PrayerTime[] = [
  { name: 'fajr', label: 'Fajr', time: at(5, 12) },
  { name: 'sunrise', label: 'Sunrise', time: at(6, 38) },
  { name: 'dhuhr', label: 'Dhuhr', time: at(13, 18) },
  { name: 'asr', label: 'Asr', time: at(17, 2) },
  { name: 'maghrib', label: 'Maghrib', time: at(20, 24) },
  { name: 'isha', label: 'Isha', time: at(21, 51) },
];

const renderCard = (prayers: PrayerTime[]) =>
  render(
    <LocationProvider>
      <SunDomeCard prayers={prayers} />
    </LocationProvider>
  );

describe('SunDomeCard', () => {
  beforeEach(() => {
    received.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the card chrome', async () => {
    renderCard(PRAYERS);
    expect(screen.getByText("Today's Sky")).toBeInTheDocument();
    expect(screen.getByText('Drag · pinch to zoom')).toBeInTheDocument();
  });

  it('mounts the dome once the lazy chunk resolves', async () => {
    renderCard(PRAYERS);
    await waitFor(() => expect(screen.getByTestId('sun-dome')).toBeInTheDocument());
  });

  it('anchors the sun track to Dhuhr and marks the five prayers', async () => {
    renderCard(PRAYERS);
    await waitFor(() => expect(received.length).toBeGreaterThan(0));

    const data = received[received.length - 1] as {
      solarNoon: Date | null;
      marks: { name: string }[];
      now: Date;
    };
    expect(data.solarNoon).toEqual(at(13, 18));
    expect(data.marks.map((m) => m.name)).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
    expect(data.now).toBeInstanceOf(Date);
  });

  it('leaves Sunrise off the dome', async () => {
    renderCard(PRAYERS);
    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    const data = received[received.length - 1] as { marks: { name: string }[] };
    expect(data.marks.some((m) => m.name === 'Sunrise')).toBe(false);
  });

  it('reports no solar noon when prayer times are unavailable', async () => {
    renderCard([]);
    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    const data = received[received.length - 1] as { solarNoon: Date | null; marks: unknown[] };
    expect(data.solarNoon).toBeNull();
    expect(data.marks).toEqual([]);
  });
});

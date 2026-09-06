import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlobeHud } from '../components/GlobeHud';
import { PRAYER_ACCENTS } from '../utils/prayerColors';
import type { DisplaySettings } from '../types';

const ALL_ON: DisplaySettings = { showCurrentPrayer: true, showNextPrayer: true, showSunnahCard: true };

// Dhuhr began at 12:53, Asr is at 16:29. The countdown props put "now" at
// 15:12:57, so the HUD should read 2h 19m since Dhuhr.
const DHUHR_AT = new Date('2026-09-05T12:53:00');
const ASR_AT = new Date('2026-09-05T16:29:00');

function renderHud(over: Partial<React.ComponentProps<typeof GlobeHud>> = {}) {
  return render(
    <GlobeHud
      currentPrayer="dhuhr"
      currentPrayerTime={DHUHR_AT}
      nextPrayer="asr"
      nextPrayerTime={ASR_AT}
      hours={1}
      minutes={16}
      seconds={3}
      display={ALL_ON}
      {...over}
    />,
  );
}

describe('User story: at a glance on the globe I see what is next and how long', () => {
  it('leads with the next prayer, its clock time and the countdown', () => {
    const { container } = renderHud();
    expect(screen.getByText('Asr')).toBeInTheDocument();
    expect(screen.getByText('1:16:03')).toBeInTheDocument();
    // The clock time is split so the meridiem can be set smaller than the hour.
    expect(container.textContent).toContain('4:29');
    expect(container.textContent).toContain('PM');
  });

  it('gives the hero slot to the prayer time, not the countdown', () => {
    const { container } = renderHud();
    const hero = container.querySelector('[style*="font-size: 40px"]') as HTMLElement;
    expect(hero).toBeTruthy();
    expect(hero.textContent).toContain('4:29');
    expect(hero.textContent).not.toContain('1:16:03');
    // The countdown runs quietly beside the prayer name instead.
    expect(screen.getByText('1:16:03').className).toContain('text-base');
  });

  it('condenses the current prayer and its sunnah into one context line', () => {
    const { container } = renderHud();
    expect(container.textContent).toContain('Dhuhr began 2h 19m ago');
    expect(container.textContent).toContain('4 + 2 sunnah');
  });

  it('accents with the same colour the prayer is drawn in on the globe', () => {
    const { container } = renderHud();
    const rule = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(rule).toHaveStyle({ background: PRAYER_ACCENTS.asr });
  });

  it('leaves the countdown calm with more than 20 minutes to go', () => {
    renderHud({ hours: 0, minutes: 25, seconds: 0 });
    expect(screen.getByText('0:25:00')).toHaveStyle({ color: 'rgba(245,246,248,0.55)' });
  });

  it('warms the countdown inside the last 20 minutes', () => {
    renderHud({ hours: 0, minutes: 4, seconds: 30 });
    expect(screen.getByText('0:04:30')).toHaveStyle({ color: '#ff8a75' });
  });

  it('names a combined prayer while travelling', () => {
    renderHud({
      nextPrayer: 'maghrib',
      isTraveling: true,
      travelState: { isTraveling: true, jamaMaghribIsha: true } as never,
    });
    expect(screen.getByText('Maghrib + Isha')).toBeInTheDocument();
  });

  describe('display settings', () => {
    it('drops the sunnah clause when the sunnah card is off', () => {
      const { container } = renderHud({ display: { ...ALL_ON, showSunnahCard: false } });
      expect(container.textContent).toContain('Dhuhr began');
      expect(container.textContent).not.toContain('sunnah');
    });

    it('promotes the current prayer to the hero when the next one is hidden', () => {
      renderHud({ display: { ...ALL_ON, showNextPrayer: false } });
      expect(screen.getByText('Dhuhr')).toBeInTheDocument();
      expect(screen.queryByText('1:16:03')).not.toBeInTheDocument();
    });

    it('renders nothing when every section is switched off', () => {
      const { container } = renderHud({
        display: { showCurrentPrayer: false, showNextPrayer: false, showSunnahCard: false },
        nextPrayer: null,
      });
      expect(container).toBeEmptyDOMElement();
    });
  });
});

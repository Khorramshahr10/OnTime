import { getTimeUntil, formatTime } from '../services/prayerService';

describe('User story: I see a countdown to the next prayer', () => {
  it('shows hours, minutes, and seconds until the next prayer', () => {
    const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000 + 15 * 1000);
    const result = getTimeUntil(futureTime);

    expect(result.hours).toBe(2);
    expect(result.minutes).toBe(30);
    expect(result.seconds).toBeGreaterThanOrEqual(14);
    expect(result.seconds).toBeLessThanOrEqual(15);
    expect(result.totalSeconds).toBeGreaterThan(0);
  });

  it('shows 0:00:00 when the prayer time has passed', () => {
    const pastTime = new Date(Date.now() - 60 * 1000);
    const result = getTimeUntil(pastTime);

    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBe(0);
    expect(result.totalSeconds).toBe(0);
  });

  it('shows exactly 0 when the prayer time is right now', () => {
    const now = new Date(Date.now() - 1); // 1ms in the past to avoid race
    const result = getTimeUntil(now);

    expect(result.totalSeconds).toBe(0);
  });

  it('correctly counts down a short time (under 1 minute)', () => {
    const soonTime = new Date(Date.now() + 45 * 1000);
    const result = getTimeUntil(soonTime);

    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBeGreaterThanOrEqual(44);
    expect(result.seconds).toBeLessThanOrEqual(45);
  });

  it('handles large countdowns (12+ hours to next Fajr)', () => {
    const farFuture = new Date(Date.now() + 13 * 60 * 60 * 1000);
    const result = getTimeUntil(farFuture);

    expect(result.hours).toBe(13);
    expect(result.minutes).toBe(0);
  });
});

describe('User story: I see prayer times in a readable format', () => {
  it('formats a morning time correctly', () => {
    const morning = new Date(2026, 3, 24, 5, 30, 0);
    const formatted = formatTime(morning);

    // Should contain the time digits and AM/PM
    expect(formatted).toMatch(/5:30/);
    expect(formatted.toLowerCase()).toContain('am');
  });

  it('formats an afternoon time correctly', () => {
    const afternoon = new Date(2026, 3, 24, 14, 15, 0);
    const formatted = formatTime(afternoon);

    expect(formatted).toMatch(/2:15/);
    expect(formatted.toLowerCase()).toContain('pm');
  });

  it('formats midnight-adjacent times', () => {
    const nearMidnight = new Date(2026, 3, 24, 0, 5, 0);
    const formatted = formatTime(nearMidnight);

    expect(formatted).toMatch(/12:05/);
    expect(formatted.toLowerCase()).toContain('am');
  });
});

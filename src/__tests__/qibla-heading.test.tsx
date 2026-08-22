import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { QiblaHeadingBar } from '../components/QiblaHeading';
import { ALIGN_TOLERANCE, headingInstruction, normalizeTurn, shortestDelta } from '../utils/heading';

describe('normalizeTurn', () => {
  it('leaves small angles alone', () => {
    expect(normalizeTurn(0)).toBe(0);
    expect(normalizeTurn(52)).toBe(52);
    expect(normalizeTurn(-38)).toBe(-38);
  });

  it('folds angles past half a turn into the shorter direction', () => {
    expect(normalizeTurn(190)).toBe(-170);
    expect(normalizeTurn(350)).toBe(-10);
    expect(normalizeTurn(-350)).toBe(10);
  });

  it('handles multiple wraps', () => {
    expect(normalizeTurn(720 + 45)).toBe(45);
    expect(normalizeTurn(-720 - 45)).toBe(-45);
  });

  it('keeps a half turn positive rather than flipping it', () => {
    expect(normalizeTurn(180)).toBe(180);
    expect(normalizeTurn(-180)).toBe(180);
  });
});

describe('headingInstruction', () => {
  it('sends you right for a positive turn', () => {
    expect(headingInstruction(38).text).toBe('Turn right 38°');
  });

  it('sends you left for a negative turn', () => {
    expect(headingInstruction(-38).text).toBe('Turn left 38°');
  });

  it('picks the short way round rather than the long one', () => {
    // 350° clockwise is 10° anticlockwise; nobody should spin most of a circle.
    expect(headingInstruction(350).text).toBe('Turn left 10°');
  });

  it('confirms alignment inside the tolerance', () => {
    expect(headingInstruction(0).aligned).toBe(true);
    expect(headingInstruction(ALIGN_TOLERANCE).aligned).toBe(true);
    expect(headingInstruction(-ALIGN_TOLERANCE).aligned).toBe(true);
    expect(headingInstruction(0).text).toBe('Facing the Kaaba');
  });

  it('is not aligned just outside the tolerance', () => {
    expect(headingInstruction(ALIGN_TOLERANCE + 1).aligned).toBe(false);
  });

  it('rounds the degrees it reads out', () => {
    expect(headingInstruction(37.6).text).toBe('Turn right 38°');
  });
});

describe('shortestDelta', () => {
  it('crosses north the short way instead of unwinding', () => {
    expect(shortestDelta(350, 10)).toBe(20);
    expect(shortestDelta(10, 350)).toBe(-20);
  });

  it('is zero for no movement', () => {
    expect(shortestDelta(123, 123)).toBe(0);
  });

  it('accumulates continuously across repeated wraps', () => {
    let displayed = 0;
    for (const reading of [350, 10, 30, 350, 300]) {
      displayed += shortestDelta(displayed, reading);
    }
    // Never takes the long way: every step stays within half a turn.
    expect(Math.abs(displayed)).toBeLessThan(360);
  });
});

describe('QiblaHeadingBar', () => {
  it('tells you which way to turn', () => {
    render(<QiblaHeadingBar rotation={38} calibrated />);
    expect(screen.getByText('Turn right 38°')).toBeInTheDocument();
  });

  it('confirms when you are lined up', () => {
    render(<QiblaHeadingBar rotation={2} calibrated />);
    expect(screen.getByText('Facing the Kaaba')).toBeInTheDocument();
  });

  it('asks for a figure eight when the sensor is not calibrated', () => {
    render(<QiblaHeadingBar rotation={38} calibrated={false} />);
    expect(screen.getByText(/figure eight/i)).toBeInTheDocument();
  });

  it('gives holding advice once calibrated', () => {
    render(<QiblaHeadingBar rotation={38} calibrated />);
    expect(screen.getByText(/hold the phone flat/i)).toBeInTheDocument();
  });

  it('falls back to a plain message when there is no compass', () => {
    render(<QiblaHeadingBar rotation={0} calibrated={false} unavailable />);
    expect(screen.getByText(/no compass sensor/i)).toBeInTheDocument();
    expect(screen.queryByText('Facing the Kaaba')).not.toBeInTheDocument();
  });

  it('announces changes to assistive tech', () => {
    render(<QiblaHeadingBar rotation={38} calibrated />);
    expect(screen.getByRole('status')).toHaveTextContent('Turn right 38°');
  });
});

describe('useQiblaHeading', () => {
  const hookValue = {
    // Deliberately stale: this is what the sensor callback captured when the
    // listener started, before GPS moved the user off the Makkah fallback.
    rotationAngle: 0,
    qiblaDirection: 52,
    deviceHeading: 14,
    isCalibrated: true,
    accuracy: 3,
    error: null,
    isListening: true,
    startListening: vi.fn(),
    stopListening: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
  });

  it('uses the current bearing and heading, not the value captured at mount', async () => {
    vi.doMock('../hooks/useQibla', () => ({ useQibla: () => hookValue }));
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('@capacitor/haptics', () => ({
      Haptics: { impact: vi.fn().mockResolvedValue(undefined) },
      ImpactStyle: { Medium: 'MEDIUM' },
    }));

    const { useQiblaHeading } = await import('../hooks/useQiblaHeading');
    const { result } = renderHook(() => useQiblaHeading());

    // 52 - 14 = 38. The stale rotationAngle of 0 would have claimed alignment.
    expect(result.current.rotation).toBe(38);
    expect(result.current.aligned).toBe(false);
    expect(result.current.calibrated).toBe(true);
    expect(result.current.supported).toBe(true);
  });

  it('reports the compass as unusable when the sensor errors', async () => {
    vi.doMock('../hooks/useQibla', () => ({
      useQibla: () => ({ ...hookValue, error: 'no magnetometer' }),
    }));
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('@capacitor/haptics', () => ({
      Haptics: { impact: vi.fn().mockResolvedValue(undefined) },
      ImpactStyle: { Medium: 'MEDIUM' },
    }));

    const { useQiblaHeading } = await import('../hooks/useQiblaHeading');
    const { result } = renderHook(() => useQiblaHeading());
    expect(result.current.unavailable).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

/**
 * GL-12: a scene that throws part-way through mount() has already installed
 * listeners and observers. SceneHost used to log and return, leaving all of
 * them attached to a half-built view that nothing else can reach — so it has
 * to tear down what did get installed.
 *
 * SunDome is the vehicle only because SceneHost itself is not exported; the
 * behaviour under test belongs to SceneHost.
 */
const spy = vi.hoisted(() => ({ mounted: 0, disposed: 0 }));

vi.mock('../components/three/sunDome', () => {
  class ThrowingSunDome {
    mount() {
      spy.mounted++;
      // Stands in for a WebGL context that dies between the once-per-process
      // supportsWebGL() probe and renderer().
      throw new Error('context lost mid-mount');
    }
    update() {}
    dispose() { spy.disposed++; }
    resetView() {}
  }
  return { SunDome: ThrowingSunDome };
});

import { SunDomeView } from '../components/three/Scenes';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  spy.mounted = 0;
  spy.disposed = 0;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  // supportsWebGL() probes a canvas once per process; jsdom returns null, so
  // hand it something truthy or SceneHost renders the fallback instead.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as unknown as RenderingContext
  );
});

afterEach(() => {
  cleanup();
  warn.mockRestore();
  vi.restoreAllMocks();
});

describe('SceneHost mount failure (GL-12)', () => {
  it('disposes the half-built view instead of leaving its listeners attached', () => {
    render(<SunDomeView data={{} as never} />);

    expect(spy.mounted).toBeGreaterThan(0);
    expect(spy.disposed).toBe(spy.mounted);
    expect(warn).toHaveBeenCalled();
  });
});

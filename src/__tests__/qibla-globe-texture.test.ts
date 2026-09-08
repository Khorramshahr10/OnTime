import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QiblaGlobe } from '../components/three/qiblaGlobe';

/**
 * GL-6: refreshTexture() only guarded against a *newer* request overtaking an
 * older one, never against the view being gone. buildEarthTexture is genuinely
 * async — it dynamically imports topojson-client and world-atlas on the first
 * call — so closing the Qibla overlay inside that window handed a 4096x2048
 * texture (~32MB decoded) to a material nobody owns, once per open/close.
 */
const ctl = vi.hoisted(() => ({
  pending: [] as Array<(t: unknown) => void>,
  disposed: 0,
  built: 0,
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    domElement = document.createElement('canvas');
    setPixelRatio() {}
    setSize() {}
    getSize(v: { set: (x: number, y: number) => void }) { v.set(400, 600); return v; }
    render() {}
    dispose() {}
    forceContextLoss() {}
    info = { programs: [], reset: () => {} };
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

vi.mock('../components/three/earthTexture', () => ({
  buildEarthTexture: () => {
    ctl.built++;
    return new Promise((resolve) => {
      ctl.pending.push(resolve);
    });
  },
}));

const makeTexture = () => ({
  dispose: () => { ctl.disposed++; },
  colorSpace: '',
  wrapS: 0,
  needsUpdate: false,
});

const data = { latitude: 43.65, longitude: -79.38, cityName: 'Toronto', turnDegrees: null };

let host: HTMLElement;
let view: QiblaGlobe;
let origGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  ctl.pending = [];
  ctl.disposed = 0;
  ctl.built = 0;

  origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() => ({
    measureText: () => ({ width: 10 }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    clearRect: () => {}, fillRect: () => {}, beginPath: () => {}, closePath: () => {},
    arc: () => {}, moveTo: () => {}, lineTo: () => {}, roundRect: () => {},
    fill: () => {}, stroke: () => {}, fillText: () => {}, strokeText: () => {},
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});

  host = document.createElement('div');
  document.body.appendChild(host);
  view = new QiblaGlobe(host, data);
  view.mount();
});

afterEach(() => {
  view.dispose();
  host.remove();
  HTMLCanvasElement.prototype.getContext = origGetContext;
  vi.unstubAllGlobals();
});

describe('QiblaGlobe map texture (GL-6)', () => {
  it('disposes a texture that lands after the view is gone', async () => {
    expect(ctl.built).toBeGreaterThan(0);

    view.dispose();
    for (const resolve of ctl.pending) resolve(makeTexture());
    await Promise.resolve();
    await Promise.resolve();

    expect(ctl.disposed).toBe(ctl.pending.length);
  });

  it('keeps a texture that lands while the view is still alive', async () => {
    for (const resolve of ctl.pending) resolve(makeTexture());
    await Promise.resolve();
    await Promise.resolve();

    expect(ctl.disposed).toBe(0);
  });
});

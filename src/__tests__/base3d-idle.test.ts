import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Base3D } from '../components/three/base3d';

/**
 * GL-7: Base3D's loop used to gate only on `visible && onScreen && !disposed`,
 * so an entirely static scene still cost a rAF and a full render pass for as
 * long as it was on screen — the whole time the Qibla overlay is open.
 *
 * jsdom has no WebGL, so the renderer and OrbitControls are stood in for. What
 * is under test is the scheduling, which is pure bookkeeping.
 */
const ctl = vi.hoisted(() => ({
  listeners: {} as Record<string, Array<() => void>>,
  autoRotate: false,
  renders: 0,
}));

// The three namespace object is frozen, so the renderer has to be swapped at
// module level rather than spied on.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    domElement = document.createElement('canvas');
    setPixelRatio() {}
    setSize() {}
    render() { ctl.renders++; }
    dispose() {}
    forceContextLoss() {}
    info = { programs: [], reset: () => {} };
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

vi.mock('three/addons/controls/OrbitControls.js', () => {
  class FakeOrbitControls {
    enableZoom = true;
    enablePan = true;
    enableDamping = true;
    dampingFactor = 0;
    rotateSpeed = 1;
    zoomSpeed = 1;
    minDistance = 0;
    maxDistance = 0;
    touches = {};
    target = { copy: () => {}, clone: () => ({ length: () => 1 }), set: () => {} };
    get autoRotate() { return ctl.autoRotate; }
    set autoRotate(v: boolean) { ctl.autoRotate = v; }
    addEventListener(type: string, fn: () => void) {
      (ctl.listeners[type] ??= []).push(fn);
    }
    update() {}
    dispose() {}
  }
  return { OrbitControls: FakeOrbitControls };
});

const emit = (type: string) => (ctl.listeners[type] ?? []).forEach((fn) => fn());

class TestView extends Base3D<{ n: number }> {
  continuous = false;
  protected build(): void {}
  protected animatesContinuously(): boolean {
    return this.continuous;
  }
  /** Exposed so a test can stand in for async work landing after a park. */
  poke(): void {
    this.wake();
  }
}

let host: HTMLElement;
let view: TestView;
let rafHandles: number;

beforeEach(() => {
  vi.useFakeTimers();
  ctl.renders = 0;
  ctl.listeners = {};
  ctl.autoRotate = false;
  rafHandles = 0;

  // A rAF that only runs when explicitly pumped, so "is the loop scheduled?"
  // is observable without actually spinning.
  const pending = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++rafHandles;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { pending.delete(id); });
  vi.stubGlobal('__pump', () => {
    const due = [...pending.entries()];
    pending.clear();
    for (const [, cb] of due) cb(performance.now());
    return due.length;
  });
  vi.stubGlobal('__pending', () => pending.size);

  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });

  host = document.createElement('div');
  document.body.appendChild(host);
  view = new TestView(host, { n: 0 });
  view.mount();
});

afterEach(() => {
  view.dispose();
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pump = () => (globalThis as unknown as { __pump: () => number }).__pump();
const scheduled = () => (globalThis as unknown as { __pending: () => number }).__pending() > 0;

/** Run the loop for a while, the way a real browser would. */
const spin = (frames = 6) => {
  for (let i = 0; i < frames; i++) pump();
};

describe('Base3D idle parking (GL-7)', () => {
  it('parks the render loop once nothing has changed', () => {
    spin();
    expect(scheduled()).toBe(true);

    vi.advanceTimersByTime(2000);
    spin();

    expect(scheduled()).toBe(false);
    const settled = ctl.renders;
    spin();
    expect(ctl.renders).toBe(settled);
  });

  it('wakes on a camera change and parks again afterwards', () => {
    vi.advanceTimersByTime(2000);
    spin();
    expect(scheduled()).toBe(false);

    emit('change');
    spin();
    expect(scheduled()).toBe(true);

    vi.advanceTimersByTime(2000);
    spin();
    expect(scheduled()).toBe(false);
  });

  it('wakes on new data', () => {
    vi.advanceTimersByTime(2000);
    spin();
    expect(scheduled()).toBe(false);

    view.update({ n: 1 });
    spin();
    expect(scheduled()).toBe(true);
  });

  it('wakes on resetView, and on async work landing after a park', () => {
    vi.advanceTimersByTime(2000);
    spin();
    view.resetView();
    spin();
    expect(scheduled()).toBe(true);

    vi.advanceTimersByTime(2000);
    spin();
    expect(scheduled()).toBe(false);
    view.poke();
    spin();
    expect(scheduled()).toBe(true);
  });

  it('never parks while the controls are auto-rotating', () => {
    ctl.autoRotate = true;
    view.update({ n: 1 });
    vi.advanceTimersByTime(10000);
    spin();

    expect(scheduled()).toBe(true);
    const before = ctl.renders;
    spin();
    expect(ctl.renders).toBeGreaterThan(before);
  });

  it('never parks a view whose tick animates on its own clock', () => {
    view.continuous = true;
    view.update({ n: 1 });
    vi.advanceTimersByTime(10000);
    spin();

    expect(scheduled()).toBe(true);
  });

  it('stops scheduling once disposed', () => {
    spin();
    view.dispose();
    spin();
    expect(scheduled()).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { waitFor } from '@testing-library/react';
import { HomeGlobeScreen } from '../components/HomeGlobeScreen';
import { renderWithProviders } from '../test/helpers';

const received: unknown[] = [];
const receivedProps: Array<{ data: unknown; fallback?: unknown }> = [];
vi.mock('../components/three/Scenes', () => ({
  HomeGlobeView: (props: { data: unknown; fallback?: unknown }) => {
    received.push(props.data);
    receivedProps.push(props);
    return <div data-testid="home-globe" />;
  },
}));

const renderScreen = () => renderWithProviders(<HomeGlobeScreen prayers={[]} />);

beforeAll(() => {
  // ThemeProvider (pulled in by renderWithProviders) listens for the system
  // scheme; jsdom has no matchMedia implementation of its own.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('HomeGlobeScreen', () => {
  beforeEach(() => {
    received.length = 0;
    receivedProps.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts the globe once the lazy chunk resolves', async () => {
    renderScreen();
    await waitFor(() => expect(received.length).toBeGreaterThan(0));
  });

  it('passes a live Date to the scene', async () => {
    renderScreen();
    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    const data = received[received.length - 1] as { now: Date };
    expect(data.now).toBeInstanceOf(Date);
  });

  it('passes the user\'s real coordinates from LocationContext to the scene', async () => {
    renderScreen();
    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    const data = received[received.length - 1] as { latitude: number; longitude: number };
    expect(typeof data.latitude).toBe('number');
    expect(typeof data.longitude).toBe('number');
  });

  it('paints a dark backdrop behind the globe so the view is never blank', async () => {
    const { container } = renderScreen();
    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.background).toContain('radial-gradient');
  });

  it('passes an intentional dark fallback for when WebGL is unavailable', async () => {
    renderScreen();
    await waitFor(() => expect(receivedProps.length).toBeGreaterThan(0));
    const { fallback } = receivedProps[receivedProps.length - 1];
    expect(fallback).toBeTruthy();
  });

  it('shows the Esri imagery attribution required by the tile source', async () => {
    const { container } = renderScreen();
    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    expect(container.textContent).toContain('Imagery © Esri');
  });
});

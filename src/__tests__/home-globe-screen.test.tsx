import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { HomeGlobeScreen } from '../components/HomeGlobeScreen';

const received: unknown[] = [];
const receivedProps: Array<{ data: unknown; fallback?: unknown }> = [];
vi.mock('../components/three/Scenes', () => ({
  HomeGlobeView: (props: { data: unknown; fallback?: unknown }) => {
    received.push(props.data);
    receivedProps.push(props);
    return <div data-testid="home-globe" />;
  },
}));

const renderScreen = () => render(<HomeGlobeScreen />);

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
});

import { describe, it, expect } from 'vitest';
import { needsRelativePosition } from '../utils/layout';

describe('needsRelativePosition', () => {
  it('adds positioning when the caller gives none', () => {
    expect(needsRelativePosition(undefined, undefined)).toBe(true);
    expect(needsRelativePosition('w-24 h-24', undefined)).toBe(true);
  });

  it('leaves an element that positions itself alone', () => {
    // The qibla globe is sized by `absolute inset-0`. Overriding it with an
    // inline `position: relative` collapsed the element to zero height and the
    // globe stopped rendering on device.
    expect(needsRelativePosition('absolute inset-0', undefined)).toBe(false);
    expect(needsRelativePosition('fixed top-0', undefined)).toBe(false);
    expect(needsRelativePosition('sticky top-2', undefined)).toBe(false);
    expect(needsRelativePosition('relative flex-1', undefined)).toBe(false);
  });

  it('defers to an explicit inline position', () => {
    expect(needsRelativePosition('w-24', 'absolute')).toBe(false);
    expect(needsRelativePosition(undefined, 'static')).toBe(false);
  });

  it('is not fooled by a class that merely contains the word', () => {
    expect(needsRelativePosition('absolutely-not', undefined)).toBe(true);
  });
});

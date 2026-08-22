/**
 * Whether a wrapper still needs `position: relative` applied to it.
 *
 * Something that positions itself — `absolute inset-0` is the usual case —
 * must not have that overridden: an inline `position: relative` beats the
 * class, and the element ends up with no height at all.
 */
export function needsRelativePosition(className?: string, position?: string): boolean {
  if (position !== undefined) return false;
  return !/\b(absolute|fixed|sticky|relative)\b/.test(className ?? '');
}

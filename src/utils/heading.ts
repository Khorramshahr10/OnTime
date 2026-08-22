/** Compass maths for the qibla screen. Pure, so it can be tested without a device. */

/** How close to the Kaaba counts as facing it, in degrees either side. */
export const ALIGN_TOLERANCE = 5;

/** Fold any angle into (-180, 180]: positive means turn right, negative left. */
export function normalizeTurn(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** What to tell someone holding the phone at this rotation. */
export function headingInstruction(rotation: number): { turn: number; aligned: boolean; text: string } {
  const turn = normalizeTurn(rotation);
  const aligned = Math.abs(turn) <= ALIGN_TOLERANCE;
  return {
    turn,
    aligned,
    text: aligned ? 'Facing the Kaaba' : `Turn ${turn > 0 ? 'right' : 'left'} ${Math.round(Math.abs(turn))}°`,
  };
}

/**
 * Shortest way round from one angle to another. Without this the dial spins
 * the long way whenever the heading crosses north.
 */
export function shortestDelta(from: number, to: number): number {
  return normalizeTurn(to - from);
}

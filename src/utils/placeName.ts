/**
 * Trim a place name down to something that fits as a label on the globe.
 * Long names render as a wide sprite that runs off the edge of the canvas.
 */
export function labelForGlobe(name: string, maxChars = 18): string {
  const trimmed = name.trim();
  if (!trimmed) return 'You';
  if (trimmed.length <= maxChars) return trimmed;

  // Prefer cutting at a comma so we keep a whole place name rather than a
  // truncated word: "Meade Boulevard, North Aurora" -> "North Aurora".
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  const fitting = parts.filter((p) => p.length <= maxChars);
  if (fitting.length) return fitting[fitting.length - 1];

  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}

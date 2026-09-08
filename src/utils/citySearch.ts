import type { CityEntry } from '../types';

/** How many matches the picker shows. */
export const MAX_RESULTS = 20;

// Common English spellings that don't appear in the dataset verbatim. The keys
// are already in folded form, which is what the query is reduced to before
// this lookup happens.
const QUERY_ALIASES: Record<string, string> = {
  mecca: 'makkah',
  medina: 'madinah',
  'new york': 'new york city',
  // The dataset spells it "Fes". Without this, "fez" folds to itself and the
  // only match is Körfez in Turkey — a confidently wrong city 4,000 km away.
  fez: 'fes',
};

// NFD splits an accented letter into its base plus a combining mark, so
// dropping the marks folds both sides of a comparison.
const COMBINING_MARKS = /[\u0300-\u036f]/g;
// The dataset uses U+2019 in names like Xi’an; a Latin keyboard types '.
const APOSTROPHES = /[\u2018\u2019\u02bc\u2032]/g;
// Pure-ASCII names are unaffected by any of the folding below, and they are the
// large majority of the dataset — so skipping the work for them is both a
// saving and provably a no-op.
const HAS_NON_ASCII = /[^\p{ASCII}]/u;

/**
 * Fold a place name for accent-insensitive matching.
 *
 * The dataset stores real orthography — 6,814 of its 33,203 names contain
 * non-ASCII — while an English or Latin keyboard can only produce the ASCII
 * form. Lowercasing alone left "sao paulo", "bogota", "montreal", "koln",
 * "izmir", "munchen", "medellin" and "cordoba" matching nothing at all: 19 of
 * the 300 most populous cities were unfindable by the only spelling their
 * residents could type.
 *
 * Two queries were worse than useless because they resolved confidently to the
 * wrong place — "zurich" found Lake Zurich, a US village, instead of Zürich,
 * and "fez" found Körfez in Turkey instead of Fez in Morocco. Either could then
 * be set as the user's location or their travel home base, shifting prayer
 * times by hours.
 *
 * Stripping combining marks also handles Turkish dotted İ, whose lowercase form
 * is an "i" followed by U+0307.
 */
export function foldName(name: string): string {
  const lower = name.toLowerCase();
  if (!HAS_NON_ASCII.test(lower)) return lower;
  return lower.normalize('NFD').replace(COMBINING_MARKS, '').replace(APOSTROPHES, "'");
}

/** A city paired with its folded name. */
export interface CityIndexEntry {
  readonly city: CityEntry;
  readonly key: string;
}

/**
 * Precompute the folded keys for a dataset. Folding 33k names on every
 * keystroke is wasted work: the data never changes, the query does.
 */
export function buildCityIndex(cities: CityEntry[]): CityIndexEntry[] {
  return cities.map((city) => ({ city, key: foldName(city.n) }));
}

/**
 * Rank matches: names that *start* with the query first, then names that merely
 * contain it, each in dataset order — which is population descending.
 *
 * The scan used to stop once the two buckets held 100 entries between them.
 * Because the dataset is population-sorted, high-population "contains" hits
 * filled that quota before lower-population "starts with" hits were ever
 * reached, and the truncation was invisible: typing "a" surfaced Shanghai,
 * Guangzhou, Kinshasa, Istanbul and Lagos — cities that merely contain an "a" —
 * while Abuja (2.7M) and Algiers (2.4M) never appeared. "ah" put Jeddah, Makkah
 * and Madinah in positions 4-12, ahead of Ahlat, Ahar and Ahlen. Roughly a
 * quarter of all two-letter queries were affected, the first keystroke included.
 *
 * Each bucket is now capped on its own. Filling `contains` no longer ends the
 * scan, so a "starts with" match is found wherever it sits in the dataset; and
 * once `startsWith` alone can fill the result list there is nothing left to
 * gain by continuing.
 */
export function searchCities(
  index: CityIndexEntry[],
  rawQuery: string,
  limit: number = MAX_RESULTS,
): CityEntry[] {
  const folded = foldName(rawQuery.trim());
  const query = QUERY_ALIASES[folded] ?? folded;
  if (!query) return [];

  const startsWith: CityEntry[] = [];
  const contains: CityEntry[] = [];

  for (const entry of index) {
    if (entry.key.startsWith(query)) {
      startsWith.push(entry.city);
      // These rank first, so this many already fills the list on its own.
      if (startsWith.length >= limit) break;
    } else if (entry.key.includes(query) && contains.length < limit) {
      contains.push(entry.city);
    }
  }

  return [...startsWith, ...contains].slice(0, limit);
}

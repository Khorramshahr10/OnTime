import { CITIES } from '../data/cities';
import { foldName, buildCityIndex, searchCities, MAX_RESULTS } from '../utils/citySearch';
import type { CityIndexEntry } from '../utils/citySearch';

/**
 * Run against the real bundled dataset on purpose: the two bugs here were both
 * about *which* of 33,203 real entries came back, so a fixture would prove
 * nothing. Accent folding is only interesting against names that actually carry
 * accents, and the ranking bug only shows up because the dataset is sorted by
 * population.
 */
describe('foldName', () => {
  it('strips accents so an ASCII keyboard can reach a non-ASCII name', () => {
    expect(foldName('São Paulo')).toBe('sao paulo');
    expect(foldName('Zürich')).toBe('zurich');
    expect(foldName('Köln')).toBe('koln');
    expect(foldName('Montréal')).toBe('montreal');
    expect(foldName('Bogotá')).toBe('bogota');
    expect(foldName('Córdoba')).toBe('cordoba');
    expect(foldName('Medellín')).toBe('medellin');
    expect(foldName('Malmö')).toBe('malmo');
  });

  it('handles Turkish dotted capital I', () => {
    // "İ".toLowerCase() is an "i" followed by U+0307, not a plain "i" — which is
    // why lowercasing alone left İzmir unfindable as "izmir".
    expect(foldName('İzmir')).toBe('izmir');
    expect('İzmir'.toLowerCase()).not.toBe('izmir');
  });

  it("folds the curly apostrophe the dataset uses to a typed one", () => {
    expect(foldName('Xi’an')).toBe("xi'an");
  });

  it('leaves plain ASCII names untouched', () => {
    expect(foldName('Toronto')).toBe('toronto');
    expect(foldName('New York City')).toBe('new york city');
  });

  it('is idempotent', () => {
    for (const name of ['São Paulo', 'İzmir', 'Xi’an', 'Toronto']) {
      expect(foldName(foldName(name))).toBe(foldName(name));
    }
  });
});

describe('searchCities against the bundled dataset', () => {
  let index: CityIndexEntry[] = [];

  beforeAll(() => {
    index = buildCityIndex(CITIES);
  });

  const names = (results: { n: string }[]) => results.map((c) => c.n);
  const first = (query: string) => searchCities(index, query)[0];

  it('indexes every city', () => {
    expect(index).toHaveLength(CITIES.length);
    expect(index.length).toBeGreaterThan(30_000);
  });

  describe('accent-insensitive matching', () => {
    // Each of these returned zero results before folding was added.
    it.each([
      ['sao paulo', 'São Paulo', 'BR'],
      ['bogota', 'Bogotá', 'CO'],
      ['montreal', 'Montréal', 'CA'],
      ['izmir', 'İzmir', 'TR'],
      ['koln', 'Köln', 'DE'],
      ['malmo', 'Malmö', 'SE'],
      ["xi'an", 'Xi’an', 'CN'],
    ])('finds %s', (query, expectedName, expectedCountry) => {
      const match = first(query);
      expect(match?.n).toBe(expectedName);
      expect(match?.c).toBe(expectedCountry);
    });

    it('still matches a name typed with its accents', () => {
      expect(first('Zürich')?.n).toBe('Zürich');
      expect(first('São Paulo')?.n).toBe('São Paulo');
    });
  });

  describe('queries that used to resolve to the wrong city', () => {
    it('ranks Zürich first, not a US village of the same name', () => {
      const results = searchCities(index, 'zurich');
      expect(results[0].n).toBe('Zürich');
      expect(results[0].c).toBe('CH');
      // 21 dataset entries genuinely start with "zurich" (Zürich's districts),
      // so the prefix bucket fills the list on its own and no mere "contains"
      // match can displace one of them.
      expect(results.every((c) => foldName(c.n).startsWith('zurich'))).toBe(true);
      expect(names(results)).not.toContain('Lake Zurich');
    });

    it('finds Fes in Morocco for the English spelling "fez"', () => {
      // The dataset has no "Fez", so folding alone would leave Körfez in Turkey
      // as the only match — a confidently wrong city.
      const match = first('fez');
      expect(match?.n).toBe('Fes');
      expect(match?.c).toBe('MA');
      expect(names(searchCities(index, 'fez'))).not.toContain('Körfez');
    });
  });

  describe('ranking is not corrupted by the scan stopping early', () => {
    it('returns only "starts with" matches for a single common letter', () => {
      // Typing "a" used to surface Shanghai, Guangzhou, Kinshasa, Istanbul and
      // Lagos — cities that merely contain an "a" — because high-population
      // "contains" hits filled the combined quota before the scan ever reached
      // the smaller cities that actually start with one.
      const results = searchCities(index, 'a');

      expect(results).toHaveLength(MAX_RESULTS);
      expect(results.every((c) => foldName(c.n).startsWith('a'))).toBe(true);
    });

    it('surfaces the big cities that start with the letter', () => {
      const found = names(searchCities(index, 'a'));
      expect(found).toContain('Abuja');
      expect(found).toContain('Algiers');
    });

    it('keeps unrelated cities out of a two-letter prefix search', () => {
      const results = searchCities(index, 'ah');

      expect(results.every((c) => foldName(c.n).startsWith('ah'))).toBe(true);
      // These merely end in "ah", and used to occupy positions 4-12.
      for (const wrong of ['Jeddah', 'Makkah', 'Madinah', 'Sharjah']) {
        expect(names(results), wrong).not.toContain(wrong);
      }
      // Population order within the bucket: the dataset is sorted descending.
      expect(results[0].n).toBe('Ahmedabad');
    });

    it('falls back to "contains" matches only once prefixes run out', () => {
      // Far fewer than MAX_RESULTS cities start with "ahlat", so the rest of
      // the list is legitimately made up of "contains" hits.
      const results = searchCities(index, 'ahlat');
      expect(results[0].n).toBe('Ahlat');
      expect(results.length).toBeLessThanOrEqual(MAX_RESULTS);
    });
  });

  describe('aliases', () => {
    it.each([
      ['mecca', 'Makkah', 'SA'],
      ['medina', 'Madinah', 'SA'],
      ['new york', 'New York City', 'US'],
    ])('resolves %s', (query, expectedName, expectedCountry) => {
      const match = first(query);
      expect(match?.n).toBe(expectedName);
      expect(match?.c).toBe(expectedCountry);
    });

    it('does not resolve "medina" to Medina, Ohio', () => {
      expect(first('medina')?.c).not.toBe('US');
    });
  });

  describe('query handling', () => {
    it('ignores case and surrounding whitespace', () => {
      expect(first('  TORONTO  ')?.n).toBe('Toronto');
      expect(first('toronto')?.n).toBe('Toronto');
    });

    it('returns nothing for an empty or whitespace-only query', () => {
      expect(searchCities(index, '')).toEqual([]);
      expect(searchCities(index, '   ')).toEqual([]);
    });

    it('returns nothing when no city matches', () => {
      expect(searchCities(index, 'zzzqx')).toEqual([]);
    });

    it('never exceeds the result limit', () => {
      for (const query of ['a', 'e', 'san', 'tor', 'new']) {
        expect(searchCities(index, query).length).toBeLessThanOrEqual(MAX_RESULTS);
      }
    });

    it('honours a smaller limit', () => {
      expect(searchCities(index, 'san', 3)).toHaveLength(3);
      // A limit is a cap, not a pad: only one city matches "toronto".
      expect(searchCities(index, 'toronto', 3)).toHaveLength(1);
    });
  });

  describe('cost', () => {
    it('folds the dataset once, cheaply enough to do on load', () => {
      const started = performance.now();
      const rebuilt = buildCityIndex(CITIES);
      const elapsed = performance.now() - started;

      expect(rebuilt).toHaveLength(CITIES.length);
      // Generous bound: this is a guard against a pathological regression, not
      // a benchmark. Measured in the single-digit-to-tens of milliseconds.
      expect(elapsed).toBeLessThan(2000);
    });

    it('scans the whole dataset quickly when nothing prefixes-matches', () => {
      // The worst case for the ranking fix: no "starts with" hits, so the scan
      // cannot stop early and must walk all 33k folded keys.
      const started = performance.now();
      const results = searchCities(index, 'zzzqx');
      const elapsed = performance.now() - started;

      expect(results).toEqual([]);
      expect(elapsed).toBeLessThan(500);
    });
  });
});

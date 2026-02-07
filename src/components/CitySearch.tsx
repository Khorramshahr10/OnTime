import { useState, useEffect, useRef, useMemo } from 'react';
import type { CityEntry } from '../types';

interface CitySearchProps {
  onSelect: (city: CityEntry) => void;
}

const POPULAR_CITY_NAMES = [
  'Mecca', 'Medina', 'Istanbul', 'Cairo', 'London', 'Dubai',
  'Riyadh', 'Kuala Lumpur', 'Jakarta', 'Karachi', 'Casablanca',
  'New York', 'Toronto', 'Paris', 'Berlin', 'Sydney',
];

const MAX_RESULTS = 20;
const DEBOUNCE_MS = 150;

export function CitySearch({ onSelect }: CitySearchProps) {
  const [query, setQuery] = useState('');
  const [cities, setCities] = useState<CityEntry[] | null>(null);
  const [countries, setCountries] = useState<Record<string, string> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazy-load city and country data
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import('../data/cities').then(m => m.CITIES),
      import('../data/countries').then(m => m.COUNTRIES),
    ]).then(([c, co]) => {
      if (!cancelled) {
        setCities(c);
        setCountries(co);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Auto-focus input
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Filter and sort results
  const results = useMemo(() => {
    if (!cities) return [];

    if (!debouncedQuery) {
      // Show popular cities
      const popular: CityEntry[] = [];
      for (const name of POPULAR_CITY_NAMES) {
        const found = cities.find(c => c.n === name);
        if (found) popular.push(found);
      }
      return popular;
    }

    const q = debouncedQuery.toLowerCase();
    const startsWith: CityEntry[] = [];
    const contains: CityEntry[] = [];

    for (const city of cities) {
      const nameLower = city.n.toLowerCase();
      if (nameLower.startsWith(q)) {
        startsWith.push(city);
      } else if (nameLower.includes(q)) {
        contains.push(city);
      }
      // Early exit once we have plenty of matches
      if (startsWith.length + contains.length >= 100) break;
    }

    // startsWith first (already sorted by population since cities array is sorted),
    // then contains matches
    return [...startsWith, ...contains].slice(0, MAX_RESULTS);
  }, [cities, debouncedQuery]);

  const getCountryName = (code: string) => countries?.[code] || code;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-[var(--color-text)]">Search City</h3>

      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-muted)]"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search for a city..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-lg bg-[var(--color-card)] text-[var(--color-text)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[var(--color-border)] transition-colors"
          >
            <svg className="w-4 h-4 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Loading state */}
      {!cities && (
        <div className="py-8 text-center text-[var(--color-muted)]">
          Loading cities...
        </div>
      )}

      {/* Results label */}
      {cities && !debouncedQuery && (
        <p className="text-sm text-[var(--color-muted)]">Popular cities</p>
      )}

      {/* Results list */}
      {cities && (
        <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto -mx-1 px-1">
          {results.length === 0 && debouncedQuery && (
            <div className="py-6 text-center text-[var(--color-muted)]">
              No cities found for "{debouncedQuery}"
            </div>
          )}
          {results.map((city, i) => (
            <button
              key={`${city.c}-${city.n}-${city.a}-${i}`}
              onClick={() => onSelect(city)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-card)] active:bg-[var(--color-border)] transition-colors text-left w-full"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[var(--color-text)] font-medium truncate">{city.n}</p>
                <p className="text-sm text-[var(--color-muted)] truncate">
                  {city.a ? `${city.a}, ` : ''}{getCountryName(city.c)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

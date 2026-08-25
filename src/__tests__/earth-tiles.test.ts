import { describe, it, expect } from 'vitest';
import {
  TILE_SIZE,
  MERCATOR_MAX_LAT,
  lonToTileX,
  latToTileY,
  tileXToLon,
  tileYToLat,
  mercatorNorm,
  targetZoomForViewport,
  enumerateTiles,
  tileUrl,
  cloudTileUrl,
  tileKey,
  childrenOf,
  tileCenter,
  tileArcRad,
  type LatLonWindow,
} from '../services/earthTiles';

const windowAt = (latitude: number, longitude: number, latHalf: number, lonHalf: number): LatLonWindow => ({
  latitude,
  longitude,
  latHalf,
  lonHalf,
});

describe('Web Mercator tile conversions', () => {
  it('maps lon 0 to the middle column at every zoom', () => {
    expect(lonToTileX(0, 0)).toBeCloseTo(0.5, 10);
    expect(lonToTileX(0, 3)).toBeCloseTo(4, 10);
    expect(lonToTileX(0, 6)).toBeCloseTo(32, 10);
  });

  it('maps lat 0 to the middle row at every zoom', () => {
    expect(latToTileY(0, 0)).toBeCloseTo(0.5, 10);
    expect(latToTileY(0, 3)).toBeCloseTo(4, 10);
    expect(latToTileY(0, 6)).toBeCloseTo(32, 10);
  });

  it('round-trips longitude through tile x', () => {
    for (const lon of [-170, -90, 0, 45, 179.9]) {
      for (const z of [3, 6]) {
        expect(tileXToLon(lonToTileX(lon, z), z)).toBeCloseTo(lon, 8);
      }
    }
  });

  it('round-trips latitude through tile y (away from the projection cut-off)', () => {
    for (const lat of [-70, -30, 0, 30, 70]) {
      for (const z of [3, 6]) {
        expect(tileYToLat(latToTileY(lat, z), z)).toBeCloseTo(lat, 6);
      }
    }
  });

  it('clamps latitude to the projection before converting', () => {
    expect(latToTileY(90, 0)).toBeCloseTo(0, 8);
    expect(latToTileY(-90, 0)).toBeCloseTo(1, 8);
  });

  it('mercatorNorm is 0.5 at the equator and 0/1 at the cut-offs', () => {
    expect(mercatorNorm(0)).toBeCloseTo(0.5, 10);
    expect(mercatorNorm(MERCATOR_MAX_LAT)).toBeCloseTo(0, 4);
    expect(mercatorNorm(-MERCATOR_MAX_LAT)).toBeCloseTo(1, 4);
  });
});

describe('targetZoomForViewport', () => {
  it('matches screen pixel density on a phone-like viewport', () => {
    // 997 CSS px tall, 35° fov, 2× canvas pixels → ~57 canvas px/deg → z6.
    expect(targetZoomForViewport(35, 997, 2)).toBe(6);
  });

  it('zooms deeper on higher-density screens', () => {
    const lo = targetZoomForViewport(35, 800, 1);
    const hi = targetZoomForViewport(35, 800, 2);
    expect(hi).toBeGreaterThanOrEqual(lo);
  });

  it('is bounded to the sane [3, 12] range', () => {
    expect(targetZoomForViewport(35, 100000, 2)).toBeLessThanOrEqual(12);
    expect(targetZoomForViewport(35, 100, 1)).toBeGreaterThanOrEqual(3);
  });
});

describe('enumerateTiles', () => {
  it('covers the window centre for a tiny window', () => {
    const tiles = enumerateTiles(windowAt(40.7, -74.0, 0.5, 0.5 / Math.cos((40.7 * Math.PI) / 180)), 6);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(4);
    // The window centre must fall inside one of the enumerated tiles' bounds.
    const centre = tiles.some((t) => {
      const west = tileXToLon(t.x, t.z);
      const east = tileXToLon(t.x + 1, t.z);
      const north = tileYToLat(t.y, t.z);
      const south = tileYToLat(t.y + 1, t.z);
      return -74 >= west - 1e-9 && -74 < east && 40.7 <= north + 1e-9 && 40.7 > south;
    });
    expect(centre).toBe(true);
  });

  it('grows the tile count with the window', () => {
    const small = enumerateTiles(windowAt(0, 0, 2, 2), 6);
    const big = enumerateTiles(windowAt(0, 0, 30, 30), 6);
    expect(big.length).toBeGreaterThan(small.length);
  });

  it('wraps across the antimeridian', () => {
    const tiles = enumerateTiles(windowAt(0, 179.9, 2, 3), 5);
    const xs = tiles.map((t) => t.x);
    // A wrapped window produces tiles on both sides of x = 0 and x = 2^z - 1.
    expect(xs.some((x) => x <= 1)).toBe(true);
    expect(xs.some((x) => x >= 2 ** 5 - 2)).toBe(true);
  });

  it('keeps y within the valid tile range', () => {
    const tiles = enumerateTiles(windowAt(89, 0, 10, 10), 6);
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(2 ** 6);
    }
  });

  it('caps the tile count', () => {
    const tiles = enumerateTiles(windowAt(0, 0, 170, 170), 7);
    expect(tiles.length).toBeLessThanOrEqual(220);
  });
});

describe('tileUrl / tileKey', () => {
  it('builds the Esri World Imagery URL', () => {
    expect(tileUrl({ z: 6, x: 16, y: 32 })).toBe(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/6/32/16'
    );
  });

  it('builds the OpenWeatherMap cloud tile URL with the key', () => {
    expect(cloudTileUrl({ z: 3, x: 4, y: 3 }, 'abc123')).toBe(
      'https://tile.openweathermap.org/map/clouds_new/3/4/3.png?appid=abc123'
    );
  });

  it('keys tiles uniquely', () => {
    expect(tileKey({ z: 6, x: 16, y: 32 })).toBe('6/16/32');
    expect(TILE_SIZE).toBe(256);
  });
});

describe('childrenOf / tileCenter / tileArcRad', () => {
  it('splits a tile into four non-overlapping children', () => {
    const kids = childrenOf({ z: 0, x: 0, y: 0 });
    expect(kids).toHaveLength(4);
    expect(kids.map((k) => k.z)).toEqual([1, 1, 1, 1]);
    expect(kids.map((k) => `${k.x},${k.y}`).sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });

  it('child bounds tile exactly the parent quadrant', () => {
    // Parent {z:1,x:1,y:0} is the NE quadrant: lon 0..180, mercator 0..0.5
    // (lat 66.5°..85°). Its children tile it in lon and mercator-y.
    const [a, b, c, d] = childrenOf({ z: 1, x: 1, y: 0 });
    expect(tileXToLon(a.x, a.z)).toBeCloseTo(0, 8);
    expect(tileXToLon(b.x, b.z)).toBeCloseTo(90, 8);
    expect(tileYToLat(a.y, a.z)).toBeCloseTo(MERCATOR_MAX_LAT, 3); // north edge
    expect(tileYToLat(c.y, c.z)).toBeCloseTo(66.513, 3); // mid-mercator edge
    expect(d.z).toBe(2);
  });

  it('reports the mercator centre of a tile', () => {
    // z1 y=0 is the whole northern half of the projection.
    const centre = tileCenter({ z: 1, x: 0, y: 0 });
    expect(centre.longitude).toBeCloseTo(-90, 6);
    expect(centre.latitude).toBeCloseTo(66.513, 3);
  });

  it('halves the tile arc each zoom level', () => {
    expect(tileArcRad({ z: 1, x: 0, y: 0 })).toBeCloseTo(Math.PI, 6);
    expect(tileArcRad({ z: 2, x: 0, y: 0 })).toBeCloseTo(Math.PI / 2, 6);
  });
});

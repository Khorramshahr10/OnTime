/**
 * Web Mercator tile math for the home globe's satellite surface.
 *
 * Pure math — deliberately free of three.js so it can be unit tested in
 * jsdom (same rule as solarGeometry.ts). The globe renders only the tiles
 * that are actually on screen (the view frustum's intersection with the
 * sphere), at a zoom level that matches the screen's pixel density, so tile
 * counts stay small (roughly a dozen to a few dozen) at any camera distance.
 *
 * Source: Esri World Imagery (Maxar/Airbus/… mosaic), free with attribution:
 * `Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community`.
 * Tiles are standard Web Mercator (EPSG:3857) 256×256 JPEGs, no key needed,
 * served with `Access-Control-Allow-Origin: *`.
 */

export const TILE_SIZE = 256;
/** Mercator projection cuts off at ±85.0511° — no tiles exist past the poles. */
export const MERCATOR_MAX_LAT = 85.05112878;
/** Hard cap on how far the surface can subdivide. The screen-space-error walk
 *  only reaches this when the camera is very close; Esri serves far deeper. */
export const MAX_TILE_ZOOM = 12;
/** How many tiles one refresh may request at most, before the window is clipped. */
export const MAX_TILES_PER_REFRESH = 220;

export interface TileRef {
  z: number;
  x: number;
  y: number;
}

export const tileKey = (t: TileRef) => `${t.z}/${t.x}/${t.y}`;

/** The four sub-tiles of a tile at the next zoom level. */
export function childrenOf(t: TileRef): TileRef[] {
  const z = t.z + 1;
  const x = t.x * 2;
  const y = t.y * 2;
  return [
    { z, x, y },
    { z, x: x + 1, y },
    { z, x, y: y + 1 },
    { z, x: x + 1, y: y + 1 },
  ];
}

/** Geographic centre of a tile (Web Mercator), in degrees. */
export function tileCenter(t: TileRef): { latitude: number; longitude: number } {
  return {
    latitude: tileYToLat(t.y + 0.5, t.z),
    longitude: tileXToLon(t.x + 0.5, t.z),
  };
}

/** The equatorial arc length of one tile, in radians on the unit sphere. */
export function tileArcRad(t: TileRef): number {
  return (360 / 2 ** t.z) * (Math.PI / 180);
}

/** Tile x for a longitude (unwrapped, may be outside [0, 2^z)). */
export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

/** Tile y for a latitude, south-positive (Web Mercator). Clamped to the projection. */
export function latToTileY(lat: number, z: number): number {
  const phi = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat)) * (Math.PI / 180);
  return ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * 2 ** z;
}

/** Longitude of a tile x edge. */
export function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

/** Latitude of a tile y edge (south-positive y, so y=0 is the north edge). */
export function tileYToLat(y: number, z: number): number {
  const n = Math.PI * (1 - (2 * y) / 2 ** z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/**
 * Normalized Web Mercator y (0 at the north pole, 1 at the south) for a
 * latitude — the exact coordinate tile textures are sampled with, so a
 * vertex at `lat` inside tile (z, y) gets `v = mercatorNorm(lat) * 2^z - y`.
 */
export function mercatorNorm(lat: number): number {
  const phi = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat)) * (Math.PI / 180);
  return (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
}

function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export interface LatLonWindow {
  latitude: number;
  longitude: number;
  /** Half-extent in degrees of latitude (always positive). */
  latHalf: number;
  /** Half-extent in degrees of longitude, already widened by 1/cos(lat). */
  lonHalf: number;
}

/**
 * The tile zoom that matches the screen's pixel density: each 256px tile
 * should map to roughly one screen-pixel-per-texture-pixel at the equator.
 * `cssHeight` is the viewport's CSS-pixel height and `fovDeg` the camera's
 * vertical field of view; the canvas renders at up to 2× for high-dpi
 * screens, which is why devicePixelRatio is folded in.
 */
export function targetZoomForViewport(fovDeg: number, cssHeight: number, devicePixelRatio: number): number {
  const canvasPxPerDeg = (cssHeight * Math.min(devicePixelRatio || 1, 2)) / fovDeg;
  const zoom = Math.round(Math.log2((canvasPxPerDeg * 360) / TILE_SIZE));
  return Math.max(3, Math.min(MAX_TILE_ZOOM, zoom));
}

/**
 * Enumerate the Web Mercator tiles at `z` covering a lat/lon window centered
 * on the sub-camera point. Handles antimeridian wrap and clips the tile
 * count to MAX_TILES_PER_REFRESH (y is clamped to the projection's range).
 */
export function enumerateTiles(window: LatLonWindow, z: number): TileRef[] {
  const n = 2 ** z;
  const latTop = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, window.latitude + window.latHalf));
  const latBottom = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, window.latitude - window.latHalf));
  const y0 = Math.max(0, Math.floor(Math.min(latToTileY(latTop, z), latToTileY(latBottom, z))));
  const y1 = Math.min(n - 1, Math.ceil(Math.max(latToTileY(latTop, z), latToTileY(latBottom, z))));

  const xStart = Math.floor(lonToTileX(normalizeLon(window.longitude - window.lonHalf), z));
  let xEnd = Math.ceil(lonToTileX(normalizeLon(window.longitude + window.lonHalf), z));
  if (xEnd <= xStart) xEnd += n; // window wrapped across the antimeridian

  const ySpan = y1 - y0 + 1;
  const maxX = Math.max(1, Math.floor(MAX_TILES_PER_REFRESH / ySpan));
  const xEndClipped = Math.min(xEnd, xStart + maxX);

  const out: TileRef[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = xStart; x < xEndClipped; x++) {
      out.push({ z, x: ((x % n) + n) % n, y });
    }
  }
  return out;
}

/** Esri World Imagery tile URL (free, no key, ACAO: *). */
export function tileUrl(t: TileRef): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${t.z}/${t.y}/${t.x}`;
}

/**
 * OpenWeatherMap "clouds_new" tile URL — global, near-real-time cloud cover
 * in Web Mercator (white = cloud, transparent = clear), updated every ~2h.
 * Requires a (free) API key; an empty key disables the live cloud layer and
 * the app falls back to its daily NASA GIBS cloud mask.
 */
export function cloudTileUrl(t: TileRef, apiKey: string): string {
  return `https://tile.openweathermap.org/map/clouds_new/${t.z}/${t.x}/${t.y}.png?appid=${apiKey}`;
}

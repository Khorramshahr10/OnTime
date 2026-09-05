import Globe from 'globe.gl';
import type { GlobeInstance } from 'globe.gl';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { glowSprite } from './base3d';
import {
  subSolarPoint,
  subLunarPoint,
  angularSeparation,
  MECCA,
  D2R,
  type Vec3,
} from '../../services/solarGeometry';
import {
  enumerateTiles,
  cloudTileUrl,
  tileKey,
  tileXToLon,
  tileYToLat,
  mercatorNorm,
  lonToTileX,
  type TileRef,
  type LatLonWindow,
} from '../../services/earthTiles';
import { getCloudImagery, extractCloudAlpha } from '../../services/cloudImagery';

export interface HomeGlobeData {
  now: Date;
  latitude: number;
  longitude: number;
  /** The user's prayer times, used to label the sun lines. */
  prayers: { name: string; time: Date }[];
  /** Ground-view (qibla) mode: camera drops to the user and follows the compass. */
  groundMode?: boolean;
  /** Device compass heading, degrees clockwise from true north (null = none). */
  deviceHeading?: number | null;
  /** Bearing to the Kaaba, degrees clockwise from true north. */
  qiblaDirection?: number;
}

// All distances are in globe-radius units (globe.gl uses a 100-unit globe).
const GLOBE_RADIUS = 100;
const HOME_ALTITUDE = 2.5; // default framing
const FOCUS_ALTITUDE = 0.5; // "My location" fly-in
const MIN_ALTITUDE = 0.06; // pinch floor, just above the atmosphere
const MAX_DISTANCE = 3500;

// NASA Blue Marble (public domain), bundled so the globe always has a complete
// earth under the streamed tiles — including on a cold start and offline.
const BASE_EARTH_TEXTURE_URL = '/earth-base.jpg';
// See prepareBaseMaterial(): the base sphere sits just inside the tile shell.
const BASE_SPHERE_SCALE = 0.998;

// How long the render loop keeps running after something changes the scene,
// before it parks again. The initial one is longer to cover the first wave of
// surface tiles, which arrive well after onGlobeReady.
const INITIAL_SETTLE_MS = 4000;
const SETTLE_MS = 1200;
// Surface tiles start once the base texture is applied; this caps the wait.
const TILE_ENABLE_FALLBACK_MS = 2500;
// Esri World Imagery. Also matched against loading-manager URLs to tell a
// surface tile apart from the app's own textures.
const TILE_HOST = 'server.arcgisonline.com';
// Longest the loader holds waiting for the first wave of tiles before
// revealing whatever is there — offline, or a network too slow to wait on.
const FIRST_TILES_MAX_WAIT_MS = 3000;

const SUN_ALTITUDE = 20;
const MOON_ALTITUDE = 20;
const SUN_RADIUS = 40;
const MOON_RADIUS = 34;
const SUN_HALO = 240;
const MOON_HALO = 170;
const SUN_COLOR = '#fff4d6';
const MOON_COLOR = '#d9d4ca';
/** Free, CORS-enabled equirectangular lunar surface texture (three.js examples). */
const MOON_TEXTURE_URL = 'https://threejs.org/examples/textures/planets/moon_1024.jpg';
/** Camera distance from the moon's centre when you tap to zoom into it. */
const MOON_VIEW_DISTANCE = 150;
const MOON_FLY_DURATION_MS = 1100;
/** A tap (not a drag) must move less than this and finish within this time. */
const TAP_MOVE_THRESHOLD_PX = 8;
const TAP_TIME_THRESHOLD_MS = 400;

const STAR_COUNT = 1400;
const STAR_RADIUS = 4000;

const PIN_ALTITUDE = 0.035;
const PIN_SIZE_PX = 20; // on-screen diameter of the location marker
const PIN_COLOR = '#4285F4';

/** Radius of the sun-position lines, just above the surface tiles. */
const SUN_LINE_ALTITUDE = 0.006;
/** Ground-view camera altitude (low, just above the qibla line) and line radius. */
const GROUND_ALTITUDE = 0.002;
const GROUND_LINE_ALTITUDE = 0.0015;
const GROUND_LINE_WIDTH_PX = 6;
/** The 3D Kaaba endpoint, raised and scaled so it reads as a landmark. */
const KAABA_ALTITUDE = 0.05;
const KAABA_SCALE = 2.2;
const GROUND_FLY_DURATION_MS = 900;
/** Ground camera looks slightly down (tan of the pitch angle, ~12°). */
const GROUND_PITCH = 0.21;
/** Sun angular distance from the sub-solar point for each solar event. */
const HORIZON_ANGLE_DEG = 90; // sunrise / sunset (sun on the horizon)
const TWILIGHT_ANGLE_DEG = 108; // fajr / isha (sun 18° below the horizon)
const ASR_ANGLE_DEG = 45; // asr, standard method (sun ~45° altitude)
/** Line + label colours, ordered dawn → night (chosen to contrast with the
 *  bright earth imagery as well as the dark space backdrop). */
// Solar lines are drawn as fat lines (Line2): WebGL ignores LineBasicMaterial's
// linewidth, so a plain THREE.Line is always one device pixel — a third of a
// CSS pixel on a 3x phone, which is what made these read as hairlines. Widths
// are in CSS pixels and carry the hierarchy: the day/night terminator and the
// noon meridian are the structure, twilight and asr support them.
const TERMINATOR_WIDTH_PX = 5;
const MERIDIAN_WIDTH_PX = 4.5;
const SOLAR_LINE_WIDTH_PX = 3.5;

const FAJR_COLOR = '#818cf8'; // indigo (pre-dawn)
const SUNRISE_COLOR = '#fb923c'; // warm orange (sunrise)
const NOON_COLOR = '#22d3ee'; // bright cyan (dhuhr, solar noon)
const ASR_COLOR = '#f472b6'; // bright pink (afternoon)
const SUNSET_COLOR = '#f87171'; // red-orange (sunset/maghrib)
const ISHA_COLOR = '#a78bfa'; // purple (night)

const NIGHT_SHADE_ALTITUDE = 0.005;
const GIBS_CLOUD_ALTITUDE = 0.012;

/** OpenWeatherMap free API key, injected from VITE_OPENWEATHER_API_KEY at build
 *  time (see .env.example). Empty = live clouds disabled (daily NASA GIBS
 *  cloud mask used instead). Get one at openweathermap.org/api. */
const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY ?? '';
const OWM_CLOUD_ALTITUDE = 0.016;
const OWM_CLOUD_TILE_Z = 3;
const OWM_CLOUD_REFETCH_MS = 60 * 60 * 1000;

const v3 = (p: Vec3 | { x: number; y: number; z: number }) =>
  new THREE.Vector3(p.x, p.y, p.z);

/** three-globe's lat/lng → cartesian convention (lon 0 on +z). */
function geo2xyz(lat: number, lon: number, r: number): { x: number; y: number; z: number } {
  const phi = (90 - lat) * D2R;
  const theta = (90 - lon) * D2R;
  const s = Math.sin(phi);
  return { x: r * s * Math.cos(theta), y: r * Math.cos(phi), z: r * s * Math.sin(theta) };
}

/**
 * Points along the circle where the sun sits at a given altitude: the angular
 * distance from the sub-solar point is `thetaDeg` (90° = horizon/terminator,
 * 108° = twilight, ~45° = Asr). The terminator is the thetaDeg=90 case.
 */
function sunAltitudeCircle(sunDir: THREE.Vector3, thetaDeg: number, radius: number, segments = 128): THREE.Vector3[] {
  const up = Math.abs(sunDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(sunDir, up).normalize();
  const v = new THREE.Vector3().crossVectors(sunDir, u).normalize();
  const theta = thetaDeg * D2R;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(
      new THREE.Vector3()
        .addScaledVector(sunDir, c * radius)
        .addScaledVector(u, s * Math.cos(a) * radius)
        .addScaledVector(v, s * Math.sin(a) * radius)
    );
  }
  return pts;
}

/** Points along the meridian at a fixed longitude, pole to pole. */
function meridianPoints(lon: number, radius: number, segments = 64): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const lat = -90 + (i / segments) * 180;
    const p = geo2xyz(lat, lon, radius);
    pts.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  return pts;
}

/** A small world-scaled text label for a sun line. */
function prayerLabelSprite(text: string, color: string): THREE.Sprite {
  const px = 30;
  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d')!;
  measure.font = `500 ${px}px Ubuntu, system-ui, sans-serif`;
  const w = Math.ceil(measure.measureText(text).width) + 18;
  canvas.width = w;
  canvas.height = px + 18;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `500 ${px}px Ubuntu, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(text, 9, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const worldHeight = 7;
  sp.scale.set((canvas.width / canvas.height) * worldHeight, worldHeight, 1);
  return sp;
}

/** The Kaaba as a 3D model (mirrors the KaabaMini card's geometry). */
function buildKaabaModel(): THREE.Group {
  const g = new THREE.Group();
  const kiswah = new THREE.MeshStandardMaterial({ color: '#131316', roughness: 0.72, metalness: 0.12 });
  const gold = new THREE.MeshStandardMaterial({ color: '#C8954C', roughness: 0.3, metalness: 0.85 });
  const stone = new THREE.MeshStandardMaterial({ color: '#2a2e38', roughness: 0.9, metalness: 0.05 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.12, 1), kiswah);
  body.position.y = 0.62;
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.015, 0.13, 1.015), gold);
  band.position.y = 0.92;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.52, 0.02), gold);
  door.position.set(0.16, 0.5, 0.511);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.12, 1.34), stone);
  g.add(body, band, door, base);
  return g;
}

/** A small "you are here" marker: blue dot with a thin white ring. */
function locationMarkerTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(r, r, r - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PIN_COLOR;
  ctx.beginPath();
  ctx.arc(r, r, r - 18, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const NIGHT_VERTEX_SHADER = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NIGHT_FRAGMENT_SHADER = `
  uniform vec3 sunDirection;
  varying vec3 vNormal;
  void main() {
    float ndotl = dot(normalize(vNormal), normalize(sunDirection));
    float daylight = smoothstep(-0.08, 0.18, ndotl);
    gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - daylight) * 0.88);
  }
`;

const MOON_FRAGMENT_SHADER = `
  uniform sampler2D moonMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec4 moon = texture2D(moonMap, vUv);
    float ndotl = dot(normalize(vNormal), normalize(sunDirection));
    float light = smoothstep(-0.28, 0.28, ndotl);
    gl_FragColor = vec4(moon.rgb * mix(0.05, 1.0, light), 1.0);
  }
`;

/** Static GIBS cloud shell: dimmed on the night side. */
const CLOUD_FRAGMENT_SHADER = `
  uniform sampler2D cloudMap;
  uniform vec3 sunDirection;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec4 cloud = texture2D(cloudMap, vUv);
    float ndotl = dot(normalize(vNormal), normalize(sunDirection));
    float daylight = smoothstep(-0.1, 0.25, ndotl);
    gl_FragColor = vec4(vec3(mix(0.22, 1.0, daylight)), cloud.a * opacity);
  }
`;

/** OpenWeatherMap live cloud tiles: white where cloudy, transparent where clear.
 *  OWM encodes coverage in the alpha channel on a 0–127 scale, hence the ×2. */
const CLOUD_TILE_FRAGMENT_SHADER = `
  uniform sampler2D cloudMap;
  uniform vec3 sunDirection;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec4 cloud = texture2D(cloudMap, vUv);
    float ndotl = dot(normalize(vNormal), normalize(sunDirection));
    float daylight = smoothstep(-0.1, 0.25, ndotl);
    gl_FragColor = vec4(vec3(mix(0.22, 1.0, daylight)), cloud.a * 2.0 * opacity);
  }
`;

const SURFACE_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Geometry for one live-cloud tile (Web Mercator on the globe at `radius`). */
function buildCloudTileGeometry(tile: TileRef, radius: number): THREE.BufferGeometry {
  const west = tileXToLon(tile.x, tile.z);
  let east = tileXToLon(tile.x + 1, tile.z);
  if (east <= west) east += 360;
  const north = tileYToLat(tile.y, tile.z);
  const south = tileYToLat(tile.y + 1, tile.z);

  const SEG = 8;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= SEG; j++) {
    const lat = north + ((south - north) * j) / SEG;
    // v=1 at the tile's north edge — matches globe.gl's own tile-engine UVs
    // (SphereGeometry + convertMercatorUV), so cloud rows tile seamlessly.
    const v = tile.y + 1 - mercatorNorm(lat) * 2 ** tile.z;
    for (let i = 0; i <= SEG; i++) {
      const lon = west + ((east - west) * i) / SEG;
      const p = geo2xyz(lat, lon, radius);
      positions.push(p.x, p.y, p.z);
      normals.push(p.x / radius, p.y / radius, p.z / radius);
      uvs.push(lonToTileX(lon, tile.z) - tile.x, v);
    }
  }
  for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i;
      const b = a + 1;
      const c = a + (SEG + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Full-page ambient globe for the Home screen, built on globe.gl's tile
 * engine (Esri World Imagery). Layered on top of the globe: a real day/night
 * terminator, the sun and moon positioned from actual ephemeris, a location
 * pin, and live cloud cover. The camera always aims at the user's
 * coordinates, with "My location" flying closer.
 */
export class HomeGlobe {
  onAdjustedChange?: (adjusted: boolean) => void;
  onGroundModeChange?: (on: boolean) => void;

  private host: HTMLElement;
  private data: HomeGlobeData;
  private globe!: GlobeInstance;
  private ready = false;
  private disposed = false;
  private adjusted = false;
  private homePov = { lat: 0, lng: 0, altitude: HOME_ALTITUDE };

  private starfield!: THREE.Points;
  private nightShade!: THREE.Mesh;
  private nightMaterial!: THREE.ShaderMaterial;
  private sun!: THREE.Mesh;
  private sunHalo!: THREE.Sprite;
  private moon!: THREE.Mesh;
  private moonHalo!: THREE.Sprite;
  private moonMaterial!: THREE.ShaderMaterial;
  private pin!: THREE.Sprite;

  // Tap-to-zoom on the moon
  private raycaster = new THREE.Raycaster();
  private pointerDown = { x: 0, y: 0, t: 0 };
  private moonFlyAnim: {
    start: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null = null;

  private moonRot = new THREE.Quaternion();
  private moonLocked = false;
  private moonSurfaceTexture?: THREE.Texture;
  private worldSunDir = new THREE.Vector3(0, 0, 1);
  private dragStart = { x: 0, y: 0, active: false };
  private idlePauseTimer?: ReturnType<typeof setTimeout>;
  /** Sun-position lines (terminator + noon meridian) and their labels. */
  private prayerLinesGroup!: THREE.Group;
  /** Ground-view qibla line + Kaaba marker. */
  private groundGroup!: THREE.Group;
  private groundLineMaterial?: LineMaterial;
  /** Live solar-line materials, so resize() can refresh their pixel widths. */
  private prayerLineMaterials: LineMaterial[] = [];
  private inGroundMode = false;
  /** Low-pass filtered compass heading (deg) to damp jitter. */
  private smoothHeading = -1;
  private groundFlyAnim: { start: number; from: THREE.Vector3; to: THREE.Vector3 } | null = null;

  // GIBS cloud shell (fallback / no-key)
  private gibsClouds!: THREE.Mesh;
  private gibsCloudMaterial!: THREE.ShaderMaterial;
  private baseCloudOpacity = 0;

  // OpenWeatherMap live cloud patches
  private cloudGroup!: THREE.Group;
  private cloudPatches = new Map<string, THREE.Mesh>();
  private cloudTextures = new Map<string, THREE.Texture>();
  private cloudLoading = new Set<string>();
  private lastCloudFetch = 0;
  private lastCloudPov = { lat: -999, lng: -999 };

  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private onVisibility = () => this.syncLoop();
  private prevManagerOnLoad?: () => void;
  private prevManagerOnProgress?: (url: string, loaded: number, total: number) => void;
  /** Set once a surface tile image has come through the loading manager. */
  private sawTileTexture = false;

  constructor(host: HTMLElement, data: HomeGlobeData) {
    this.host = host;
    this.data = data;
  }

  mount(): void {
    this.homePov = { lat: this.data.latitude, lng: this.data.longitude, altitude: HOME_ALTITUDE };

    this.globe = new Globe(this.host, {
      rendererConfig: { alpha: true, antialias: true },
      // three-globe's default intro scales the globe up from nothing and spins
      // it for 1.2s on every mount — on a cold start (and on every return from
      // an overlay) that reads as the globe being "rebuilt". Tiles come from
      // the on-disk cache in well under a second, so just show it.
      animateIn: false,
    })
      .backgroundColor('rgba(0,0,0,0)')
      // The tile engine parks an opaque black sphere just under the surface at
      // any level > 0, and only adds a tile once its image has downloaded — so
      // without a base texture every un-loaded tile reads as a black hole while
      // the mosaic streams in. Bundled (and preloaded from index.html) so it is
      // decoded before the globe mounts and still works offline; the GIBS
      // photo upgrades it on arrival. The tile engine itself is switched on in
      // enableTilesOnceBaseIsUp(): started together, the tile flood (hundreds
      // of decodes + GPU uploads) lands ahead of the base and the globe sits
      // black for the first half second of every cold start.
      .globeImageUrl(BASE_EARTH_TEXTURE_URL)
      .showAtmosphere(true)
      .atmosphereColor('#4d7fbf')
      .atmosphereAltitude(0.12);
    // Safety net: never leave the surface tile-less if the base somehow fails.
    setTimeout(() => this.enableTiles(), TILE_ENABLE_FALLBACK_MS);

    const controls = this.globe.controls();
    controls.autoRotate = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.9;
    controls.zoomSpeed = 0.8;
    controls.minDistance = GLOBE_RADIUS * (1 + MIN_ALTITUDE);
    controls.maxDistance = MAX_DISTANCE;
    controls.addEventListener('start', () => {
      this.wake();
      this.markAdjusted(true);
    });
    controls.addEventListener('end', () => this.scheduleIdlePause(1500));

    this.globe.onGlobeReady(() => {
      if (this.disposed) return;
      this.ready = true;
      // Reach the starfield and sun/moon without z-fighting the surface.
      const cam = this.globe.camera() as THREE.PerspectiveCamera;
      cam.near = 1;
      cam.far = 30000;
      cam.updateProjectionMatrix();
      this.prepareBaseMaterial();
      this.enableTilesOnceBaseIsUp();
      this.buildExtras();
      // Aim the camera first, so the cloud layer fetches the tiles around
      // the user's location rather than the globe's default (0,0) point.
      this.globe.pointOfView({ lat: this.data.latitude, lng: this.data.longitude, altitude: HOME_ALTITUDE }, 0);
      this.applyKey = this.computeApplyKey(this.data);
      this.applyData();
      this.updateZoomFades();
      // Nothing animates on its own in orbit view (no auto-rotate; sun and moon
      // move once a minute), so park the render loop once the opening tiles
      // have had time to land. Without this the loop only ever idles after an
      // interaction, and an untouched globe renders at full rate forever.
      this.renderThenSettle(INITIAL_SETTLE_MS);
    });

    this.globe.onZoom(() => {
      this.updateZoomFades();
      this.refreshCloudsOnRotation();
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.host);
    this.resize();

    this.io = new IntersectionObserver(
      ([entry]) => {
        const hasArea = entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0;
        if (entry.isIntersecting || !hasArea) this.syncLoop();
        else this.globe.pauseAnimation();
      },
      { threshold: 0 }
    );
    this.io.observe(this.host);

    document.addEventListener('visibilitychange', this.onVisibility);
    // Surface tiles load through three's default manager (three-slippy-map-globe
    // uses a bare TextureLoader), and they arrive long after the camera stopped
    // moving. With the loop now parking when idle, a tile landing after the park
    // would never be drawn — so render once more whenever loading goes quiet.
    this.prevManagerOnProgress = THREE.DefaultLoadingManager.onProgress;
    THREE.DefaultLoadingManager.onProgress = (url, loaded, total) => {
      this.prevManagerOnProgress?.(url, loaded, total);
      if (typeof url === 'string' && url.includes(TILE_HOST)) this.sawTileTexture = true;
    };
    this.prevManagerOnLoad = THREE.DefaultLoadingManager.onLoad;
    THREE.DefaultLoadingManager.onLoad = () => {
      this.prevManagerOnLoad?.();
      this.enableTilesOnceBaseIsUp();
      // Hold the loader until surface tiles have actually landed, not merely
      // until the base texture is on: enabling the tile engine is what starts
      // the tile fetch, so revealing there uncovers a globe that then visibly
      // fills in tile by tile. This drains once the first wave is in.
      if (this.tilesEnabled && this.sawTileTexture) this.fireSurfaceReady();
      this.renderThenSettle();
    };
    this.syncLoop();
    this.fetchGibsImagery();

    // Tap (not drag) detection for tap-to-zoom on the moon.
    const canvas = this.globe.renderer().domElement;
    canvas.addEventListener('pointerdown', (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.dragStart = { x: e.clientX, y: e.clientY, active: this.moonLocked };
      if (this.moonLocked) this.wake();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragStart.active || !this.moonLocked) return;
      this.wake();
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
      const q = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * 0.005)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -dy * 0.005));
      this.moonRot.premultiply(q);
      this.applyMoonRotation();
    });
    canvas.addEventListener('pointerup', (e) => {
      this.dragStart.active = false;
      const dx = e.clientX - this.pointerDown.x;
      const dy = e.clientY - this.pointerDown.y;
      const dt = performance.now() - this.pointerDown.t;
      if (Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD_PX || dt > TAP_TIME_THRESHOLD_MS) {
        if (this.moonLocked) this.scheduleIdlePause(1500);
        return;
      }
      this.handleTap(e);
    });
  }

  update(data: HomeGlobeData): void {
    this.data = data;
    if (!this.ready) return;
    const wantGround = !!data.groundMode;
    if (wantGround !== this.inGroundMode) {
      if (wantGround) this.enterGroundMode();
      else this.exitGroundMode();
    }
    if (this.inGroundMode) this.updateGroundView();
    // The sun, moon and prayer lines move with time and place — not with
    // compass headings or the parent's per-second countdown re-renders.
    // Skip the full reapply (four line geometries + six canvas label
    // textures + the lunar ephemeris) unless one of those actually changed.
    const key = this.computeApplyKey(data);
    if (key !== this.applyKey) {
      this.applyKey = key;
      this.applyData();
      // The scene changed while the loop may be parked — render it, then park
      // again. Skipping this leaves the minute tick invisible until the user
      // next touches the globe.
      this.renderThenSettle();
    }
  }

  private tilesEnabled = false;

  /**
   * The base sphere (bundled earth, later the GIBS photo) stays visible under
   * the tile mosaic (three-globe patch), so it must lose the depth test
   * wherever a tile exists. Tiles sit at exactly the same radius, and a
   * polygon offset alone still sparkled at this camera distance (24-bit depth
   * over a 1..30000 range is coarse out here), so the sphere is scaled a
   * fifth of a percent inward instead: a real geometric gap, invisible at the
   * limb, still outside the tile engine's black inner sphere at 0.99.
   */
  private prepareBaseMaterial(): void {
    const mat = this.globe?.globeMaterial() as THREE.MeshPhongMaterial | undefined;
    if (!mat) return;
    mat.depthWrite = true;
    mat.needsUpdate = true;
    this.globe.scene().traverse((obj) => {
      if ((obj as THREE.Mesh).material === mat) obj.scale.setScalar(BASE_SPHERE_SCALE);
    });
  }

  /** Fired once, on the first frame drawn with the base earth on the surface. */
  onSurfaceReady?: () => void;
  private surfaceReadyFired = false;
  /** True while a full-screen overlay hides the globe (see setCovered). */
  private covered = false;

  /**
   * A full-screen overlay (Settings, Qibla, Dashboard) now sits on top of the
   * globe instead of unmounting it, so returning is instant. While covered the
   * globe must cost nothing: the loop is parked and wake() refuses to restart
   * it. Uncovering draws one frame so any minute tick that happened
   * underneath is on screen, then parks again.
   */
  setCovered(covered: boolean): void {
    if (this.covered === covered) return;
    this.covered = covered;
    if (covered) {
      if (this.idlePauseTimer) clearTimeout(this.idlePauseTimer);
      this.globe?.pauseAnimation();
    } else {
      this.renderThenSettle();
    }
  }

  private fireSurfaceReady(): void {
    if (this.surfaceReadyFired) return;
    this.surfaceReadyFired = true;
    // Next frame, not now: the texture is on the material but not yet drawn.
    requestAnimationFrame(() => {
      if (!this.disposed) this.onSurfaceReady?.();
    });
  }

  /** Start streaming surface tiles, but only after the base earth texture is
   *  on the material — see the globeImageUrl note in mount(). */
  private enableTilesOnceBaseIsUp(): void {
    if (this.tilesEnabled || this.disposed) return;
    const mat = this.globe?.globeMaterial() as THREE.MeshPhongMaterial | undefined;
    if (!mat?.map) return;
    this.enableTiles();
  }

  private enableTiles(): void {
    if (this.tilesEnabled || this.disposed || !this.globe) return;
    this.tilesEnabled = true;
    // Setting the URL is what *starts* the tile fetch, so the surface is not
    // ready yet — the loader stays up until the first wave of tiles is drawn
    // (see the loading-manager hook in mount()). This caps the wait, for a
    // slow network or a cold start with nothing cached and no connection.
    setTimeout(() => this.fireSurfaceReady(), FIRST_TILES_MAX_WAIT_MS);
    this.globe.globeTileEngineUrl(
      (x, y, l) => `https://${TILE_HOST}/ArcGIS/rest/services/World_Imagery/MapServer/tile/${l}/${y}/${x}`
    );
  }

  /** Draw the change that was just applied, then let the loop idle again. */
  private renderThenSettle(ms = SETTLE_MS): void {
    this.wake();
    this.scheduleIdlePause(ms);
  }

  private applyKey = '';

  private computeApplyKey(data: HomeGlobeData): string {
    return [
      data.now.getTime(),
      data.latitude,
      data.longitude,
      data.prayers.map((p) => `${p.name}${p.time.getTime()}`).join(','),
    ].join('|');
  }

  /** Restore the camera's up vector to world-up and re-centre the orbit target.
   *  Ground view tilts cam.up to the local radial direction; OrbitControls uses
   *  object.up as its orbit axis, so if that tilt leaks out the whole orbit —
   *  and every pointOfView() fly-in — renders tilted or upside-down. */
  private resetOrbit(): void {
    (this.globe.camera() as THREE.PerspectiveCamera).up.set(0, 1, 0);
    this.globe.controls().target.set(0, 0, 0);
  }

  resetView(): void {
    if (this.inGroundMode) this.exitGroundMode();
    this.resetOrbit();
    this.moonFlyAnim = null;
    this.moonLocked = false;
    this.moonRot.identity();
    this.applyMoonRotation();
    if (this.moonHalo) this.moonHalo.visible = true;
    this.globe.controls().enabled = true;
    this.homePov = { lat: this.data.latitude, lng: this.data.longitude, altitude: HOME_ALTITUDE };
    this.wake();
    this.globe.pointOfView({ ...this.homePov }, 900);
    this.scheduleIdlePause(2200);
    this.markAdjusted(false);
  }

  focusOnLocation(): void {
    if (this.inGroundMode) this.exitGroundMode();
    this.resetOrbit();
    this.moonFlyAnim = null;
    this.moonLocked = false;
    this.moonRot.identity();
    this.applyMoonRotation();
    if (this.moonHalo) this.moonHalo.visible = true;
    this.globe.controls().enabled = true;
    this.wake();
    this.globe.pointOfView({ lat: this.data.latitude, lng: this.data.longitude, altitude: FOCUS_ALTITUDE }, 900);
    this.scheduleIdlePause(2200);
    this.markAdjusted(true);
  }

  /** Fly the camera out to the moon so it fills the view, then allow spinning it. */
  focusOnMoon(): void {
    if (!this.moon) return;
    (this.globe.camera() as THREE.PerspectiveCamera).up.set(0, 1, 0);
    const controls = this.globe.controls();
    const moonPos = this.moon.position.clone();
    // Camera at the moon height, offset horizontally toward Earth, so the
    // moon reads centred with north up rather than from below.
    const dir = moonPos.clone().normalize();
    const horiz = new THREE.Vector3(dir.x, 0, dir.z);
    const camDir = horiz.lengthSq() > 1e-6 ? horiz.normalize() : new THREE.Vector3(1, 0, 0);
    const camPos = moonPos.clone().addScaledVector(camDir, -MOON_VIEW_DISTANCE);
    this.moonFlyAnim = {
      start: performance.now(),
      fromPos: this.globe.camera().position.clone(),
      toPos: camPos,
      fromTarget: controls.target.clone(),
      toTarget: moonPos.clone(),
    };
    controls.enabled = false;
    this.moonRot.identity();
    this.moonLocked = true;
    this.moonHalo.visible = false;
    this.applyMoonRotation();
    this.wake();
    this.markAdjusted(true);
    this.animateMoonFly();
  }

  /** Apply the drag rotation to the moon, keeping the lit side sun-facing. */
  private applyMoonRotation(): void {
    this.moon.setRotationFromQuaternion(this.moonRot);
    this.moonMaterial.uniforms.sunDirection.value
      .copy(this.worldSunDir)
      .applyQuaternion(this.moonRot.clone().invert());
  }

  // ── ground view (qibla) ───────────────────────────────────────────────

  private enterGroundMode(): void {
    this.inGroundMode = true;
    this.moonFlyAnim = null;
    this.moonLocked = false;
    this.globe.controls().enabled = false;
    // The ground is only ~0.2 units below the camera — the default near plane
    // (1) would clip it, showing black. Pull the near plane in.
    const cam = this.globe.camera() as THREE.PerspectiveCamera;
    cam.near = 0.1;
    cam.updateProjectionMatrix();
    // Hide markers that don't belong (or would blow up) at ground level.
    if (this.pin) this.pin.visible = false;
    if (this.prayerLinesGroup) this.prayerLinesGroup.visible = false;
    this.smoothHeading = -1;
    this.buildGroundLine();
    this.groundGroup.visible = true;
    this.onGroundModeChange?.(true);

    const { latitude, longitude } = this.data;
    const target = v3(this.globe.getCoords(latitude, longitude, GROUND_ALTITUDE));
    this.groundFlyAnim = {
      start: performance.now(),
      from: this.globe.camera().position.clone(),
      to: target,
    };
    this.wake();
    this.animateGroundFly();
  }

  private exitGroundMode(): void {
    this.inGroundMode = false;
    this.groundFlyAnim = null;
    // Symmetric cleanup: if a moon tap snuck in during ground mode, make sure
    // we don't leave the moon lock / controls / halo in a moon-mode state.
    this.moonFlyAnim = null;
    this.moonLocked = false;
    if (this.moonHalo) this.moonHalo.visible = true;
    this.groundGroup.visible = false;
    this.clearGroundLine();
    this.globe.controls().enabled = true;
    const cam = this.globe.camera() as THREE.PerspectiveCamera;
    cam.near = 1;
    cam.up.set(0, 1, 0); // undo the ground-view radial tilt before re-enabling orbit
    cam.updateProjectionMatrix();
    if (this.pin) this.pin.visible = true;
    if (this.prayerLinesGroup) this.prayerLinesGroup.visible = true;
    this.onGroundModeChange?.(false);
    this.globe.pointOfView({ lat: this.data.latitude, lng: this.data.longitude, altitude: HOME_ALTITUDE }, 700);
    this.wake();
    this.scheduleIdlePause(2200);
  }

  private animateGroundFly(): void {
    if (!this.groundFlyAnim) return;
    const anim = this.groundFlyAnim;
    const t = Math.min(1, (performance.now() - anim.start) / GROUND_FLY_DURATION_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    const cam = this.globe.camera() as THREE.PerspectiveCamera;
    cam.position.lerpVectors(anim.from, anim.to, eased);
    this.applyGroundOrientation();
    if (t >= 1) {
      this.groundFlyAnim = null;
      this.updateGroundView();
    } else {
      requestAnimationFrame(() => this.animateGroundFly());
    }
  }

  // Scratch vectors for the ground view — applyGroundOrientation runs at
  // compass rate, so no per-call allocations.
  private groundUp = new THREE.Vector3();
  private groundNorth = new THREE.Vector3();
  private groundEast = new THREE.Vector3();
  private groundFacing = new THREE.Vector3();
  private groundLookAt = new THREE.Vector3();

  /** Point the ground camera at the phone's compass heading, slightly down. */
  private applyGroundOrientation(): void {
    const cam = this.globe.camera() as THREE.PerspectiveCamera;
    const pos = cam.position;
    const up = this.groundUp.copy(pos).normalize();
    const north = this.groundNorth.set(0, 1, 0).addScaledVector(up, -up.y);
    if (north.lengthSq() < 1e-6) north.set(1, 0, 0);
    north.normalize();
    const east = this.groundEast.crossVectors(north, up).normalize();

    const raw = this.data.deviceHeading ?? 0;
    // Low-pass filter the heading (shortest-arc lerp) so the view and the line
    // swing smoothly instead of jittering with every noisy magnetometer read.
    if (this.smoothHeading < 0) this.smoothHeading = raw;
    else {
      let diff = raw - this.smoothHeading;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      this.smoothHeading = (this.smoothHeading + diff * 0.22 + 360) % 360;
    }
    const rad = this.smoothHeading * D2R;
    const facing = this.groundFacing.set(0, 0, 0).addScaledVector(north, Math.cos(rad)).addScaledVector(east, Math.sin(rad));
    cam.up.copy(up);
    this.groundLookAt.copy(pos).add(facing).addScaledVector(up, -GROUND_PITCH);
    cam.lookAt(this.groundLookAt);
  }

  /** Place the ground camera at the user's location and aim it. */
  private updateGroundView(): void {
    const { latitude, longitude } = this.data;
    const cam = this.globe.camera() as THREE.PerspectiveCamera;
    const p = this.globe.getCoords(latitude, longitude, GROUND_ALTITUDE);
    cam.position.set(p.x, p.y, p.z);
    this.applyGroundOrientation();
    // Compass events re-arm this on every reading, so the loop stays live while
    // the phone is moving and parks shortly after the readings stop.
    this.renderThenSettle();
  }

  /** Draw the thick great-circle line from the user to the Kaaba + the 3D Kaaba. */
  private buildGroundLine(): void {
    this.clearGroundLine();
    const { latitude, longitude } = this.data;
    const radius = GLOBE_RADIUS * (1 + GROUND_LINE_ALTITUDE);

    // Slerp the unit vectors in the globe's own coordinate frame (greatCircleArc
    // lives in a different frame, so don't reuse it here) — the line hugs the
    // surface of the sphere rather than cutting a straight chord through it.
    const from = v3(this.globe.getCoords(latitude, longitude, 1)).normalize();
    const to = v3(this.globe.getCoords(MECCA.latitude, MECCA.longitude, 1)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(from, to);
    const identity = new THREE.Quaternion();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 256; i++) {
      const qi = new THREE.Quaternion().slerpQuaternions(identity, q, i / 256);
      pts.push(from.clone().applyQuaternion(qi).multiplyScalar(radius));
    }

    const geometry = new LineGeometry();
    geometry.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
    const material = new LineMaterial({ color: 0x22d3ee, linewidth: GROUND_LINE_WIDTH_PX, transparent: true, opacity: 0.95, depthTest: false });
    const size = this.globe.renderer().getSize(new THREE.Vector2());
    material.resolution.set(size.x, size.y);
    this.groundLineMaterial = material;
    this.groundGroup.add(new Line2(geometry, material));

    // The 3D Kaaba at the line's end point, standing on the surface at Makkah.
    const kaabaModel = buildKaabaModel();
    kaabaModel.scale.setScalar(KAABA_SCALE);
    const kaabaPos = v3(this.globe.getCoords(MECCA.latitude, MECCA.longitude, KAABA_ALTITUDE));
    kaabaModel.position.copy(kaabaPos);
    kaabaModel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), kaabaPos.clone().normalize());
    this.groundGroup.add(kaabaModel);
  }

  private clearGroundLine(): void {
    if (!this.groundGroup) return;
    for (const obj of [...this.groundGroup.children]) {
      this.groundGroup.remove(obj);
      obj.traverse((o) => {
        const m = o as THREE.Mesh | THREE.Line;
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else (mat as THREE.Material)?.dispose();
      });
    }
    this.groundLineMaterial?.dispose();
    this.groundLineMaterial = undefined;
  }

  private tapSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS);
  private tapHit = new THREE.Vector3();

  private handleTap(e: PointerEvent): void {
    if (!this.moon || this.disposed) return;
    if (this.inGroundMode || this.groundFlyAnim) return; // moon tap is a globe-mode action
    const canvas = this.globe.renderer().domElement;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.globe.camera());
    const moonHits = this.raycaster.intersectObject(this.moon);
    if (moonHits.length === 0) return;
    // Don't let a tap reach the moon through the planet: if the ray meets
    // the surface sphere first, the globe is in front of the moon.
    const surfaceHit = this.raycaster.ray.intersectSphere(this.tapSphere, this.tapHit);
    if (surfaceHit && surfaceHit.distanceTo(this.raycaster.ray.origin) < moonHits[0].distance) return;
    this.focusOnMoon();
  }

  private animateMoonFly(): void {
    if (!this.moonFlyAnim) return;
    const anim = this.moonFlyAnim;
    const t = Math.min(1, (performance.now() - anim.start) / MOON_FLY_DURATION_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    const cam = this.globe.camera() as THREE.PerspectiveCamera;
    cam.position.lerpVectors(anim.fromPos, anim.toPos, eased);
    this.globe.controls().target.lerpVectors(anim.fromTarget, anim.toTarget, eased);
    cam.lookAt(this.globe.controls().target);
    if (t >= 1) {
      this.moonFlyAnim = null;
      // Intentionally leave OrbitControls disabled: globe.gl hard-resets the
      // orbit target to the origin on its change event, so re-enabling here
      // would snap the camera back to Earth. resetView()/focusOnLocation()
      // re-enable controls when the user explicitly changes view.
      this.scheduleIdlePause(1500);
    } else {
      requestAnimationFrame(() => this.animateMoonFly());
    }
  }

  dispose(): void {
    this.disposed = true;
    this.moonFlyAnim = null;
    this.groundFlyAnim = null;
    if (this.idlePauseTimer) clearTimeout(this.idlePauseTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    THREE.DefaultLoadingManager.onLoad = this.prevManagerOnLoad as () => void;
    THREE.DefaultLoadingManager.onProgress = this.prevManagerOnProgress as (
      url: string, loaded: number, total: number,
    ) => void;
    this.ro?.disconnect();
    this.io?.disconnect();
    this.globe?.pauseAnimation();
    this.cloudLoading.clear();
    for (const mesh of this.cloudPatches.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.cloudPatches.clear();
    for (const tex of this.cloudTextures.values()) tex.dispose();
    this.cloudTextures.clear();
    const gibsMap = this.gibsCloudMaterial?.uniforms.cloudMap.value as THREE.Texture | undefined;
    if (gibsMap && gibsMap !== this.placeholderTexture) gibsMap.dispose();
    if (this.prayerLinesGroup) {
      for (const obj of [...this.prayerLinesGroup.children]) {
        this.prayerLinesGroup.remove(obj);
        if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
        } else {
          (obj as THREE.Line).geometry?.dispose();
          ((obj as THREE.Line).material as THREE.Material)?.dispose();
        }
      }
    }
    // clearGroundLine traverses, so the Kaaba model's meshes and materials
    // are disposed too — a shallow child loop would leak them.
    if (this.groundGroup) this.clearGroundLine();
    if (this.starfield) {
      this.starfield.geometry.dispose();
      (this.starfield.material as THREE.Material).dispose();
    }
    if (this.nightShade) {
      this.nightShade.geometry.dispose();
      this.nightMaterial.dispose();
    }
    if (this.sun) {
      this.sun.geometry.dispose();
      (this.sun.material as THREE.Material).dispose();
    }
    if (this.sunHalo) {
      (this.sunHalo.material as THREE.SpriteMaterial).map?.dispose();
      this.sunHalo.material.dispose();
    }
    if (this.moon) {
      this.moon.geometry.dispose();
      this.moonMaterial.dispose();
    }
    this.moonSurfaceTexture?.dispose();
    if (this.moonHalo) {
      (this.moonHalo.material as THREE.SpriteMaterial).map?.dispose();
      this.moonHalo.material.dispose();
    }
    if (this.pin) {
      (this.pin.material as THREE.SpriteMaterial).map?.dispose();
      this.pin.material.dispose();
    }
    if (this.gibsClouds) {
      this.gibsClouds.geometry.dispose();
      this.gibsCloudMaterial.dispose();
    }
    this.placeholderTexture?.dispose();
    try {
      (this.globe as unknown as { _destructor?: () => void })._destructor?.();
    } catch {
      // The canvas removal below is enough if the internal hook is missing.
    }
    this.host.querySelectorAll('canvas').forEach((c) => c.remove());
  }

  // ── internals ────────────────────────────────────────────────────────────

  private markAdjusted(value: boolean): void {
    if (this.adjusted === value) return;
    this.adjusted = value;
    this.onAdjustedChange?.(value);
  }

  private syncLoop(): void {
    if (this.disposed || !this.globe) return;
    if (document.hidden) this.globe.pauseAnimation();
    // Coming back into view (or back to the tab) needs a frame to redraw, but
    // must not leave the loop running forever afterwards.
    else this.renderThenSettle();
  }

  /** Keep the render loop running now, and cancel any pending idle pause. */
  private wake(): void {
    if (this.disposed || !this.globe || this.covered) return;
    this.globe.resumeAnimation();
    if (this.idlePauseTimer) {
      clearTimeout(this.idlePauseTimer);
      this.idlePauseTimer = undefined;
    }
  }

  /** Pause the render loop once the view has been idle for `ms`. */
  private scheduleIdlePause(ms: number): void {
    if (this.disposed) return;
    if (this.idlePauseTimer) clearTimeout(this.idlePauseTimer);
    this.idlePauseTimer = setTimeout(() => {
      if (this.disposed || this.moonFlyAnim || this.groundFlyAnim) return;
      this.globe.pauseAnimation();
    }, ms);
  }

  private resize(): void {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.globe?.width(w).height(h);
    // Fat lines need the canvas pixel size to compute their screen width.
    const size = this.globe?.renderer().getSize(new THREE.Vector2());
    if (size) {
      this.groundLineMaterial?.resolution.set(size.x, size.y);
      for (const m of this.prayerLineMaterials) m.resolution.set(size.x, size.y);
    }
  }

  private buildExtras(): void {
    const scene = this.globe.scene();

    // Starfield
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      positions[i * 3] = STAR_RADIUS * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = STAR_RADIUS * Math.cos(phi);
      positions[i * 3 + 2] = STAR_RADIUS * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starfield = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: '#ffffff', size: 4.5, sizeAttenuation: true })
    );
    scene.add(this.starfield);

    // Day/night terminator
    this.nightMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: { sunDirection: { value: new THREE.Vector3(0, 0, 1) } },
      vertexShader: NIGHT_VERTEX_SHADER,
      fragmentShader: NIGHT_FRAGMENT_SHADER,
    });
    this.nightShade = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * (1 + NIGHT_SHADE_ALTITUDE), 64, 32),
      this.nightMaterial
    );
    this.nightShade.renderOrder = 1;
    scene.add(this.nightShade);

    // Sun + moon
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_RADIUS, 24, 18),
      new THREE.MeshBasicMaterial({ color: SUN_COLOR })
    );
    this.sunHalo = glowSprite(SUN_COLOR);
    this.sunHalo.scale.setScalar(SUN_HALO);
    this.sunHalo.renderOrder = 4;
    this.sun.renderOrder = 4;
    scene.add(this.sun, this.sunHalo);

    this.moonMaterial = new THREE.ShaderMaterial({
      uniforms: {
        moonMap: { value: this.emptyTexture() },
        sunDirection: { value: new THREE.Vector3(0, 0, 1) },
      },
      vertexShader: SURFACE_VERTEX_SHADER,
      fragmentShader: MOON_FRAGMENT_SHADER,
    });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_RADIUS, 48, 32), this.moonMaterial);
    this.moonHalo = glowSprite(MOON_COLOR);
    this.moonHalo.scale.setScalar(MOON_HALO);
    (this.moonHalo.material as THREE.SpriteMaterial).opacity = 0.5;
    this.moon.renderOrder = 4;
    this.moonHalo.renderOrder = 4;
    scene.add(this.moon, this.moonHalo);

    // Real lunar surface (free three.js example texture).
    new THREE.TextureLoader().load(MOON_TEXTURE_URL, (tex) => {
      if (this.disposed) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.moonSurfaceTexture = tex;
      this.moonMaterial.uniforms.moonMap.value = tex;
      this.moonMaterial.needsUpdate = true;
      this.renderThenSettle();
    });

    // Location marker
    this.pin = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: locationMarkerTexture(), transparent: true, depthWrite: false })
    );
    this.pin.renderOrder = 3;
    scene.add(this.pin);

    // GIBS cloud shell
    this.gibsCloudMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        cloudMap: { value: this.emptyTexture() },
        sunDirection: { value: new THREE.Vector3(0, 0, 1) },
        opacity: { value: 0 },
      },
      vertexShader: SURFACE_VERTEX_SHADER,
      fragmentShader: CLOUD_FRAGMENT_SHADER,
    });
    this.gibsClouds = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * (1 + GIBS_CLOUD_ALTITUDE), 96, 64),
      this.gibsCloudMaterial
    );
    this.gibsClouds.renderOrder = 2;
    scene.add(this.gibsClouds);

    // OpenWeatherMap live cloud patches
    this.cloudGroup = new THREE.Group();
    this.cloudGroup.renderOrder = 2;
    scene.add(this.cloudGroup);

    // Sun-position lines (terminator + noon meridian) with salah labels
    this.prayerLinesGroup = new THREE.Group();
    this.prayerLinesGroup.renderOrder = 3;
    scene.add(this.prayerLinesGroup);

    // Ground-view qibla line + Kaaba marker
    this.groundGroup = new THREE.Group();
    this.groundGroup.renderOrder = 4;
    this.groundGroup.visible = false;
    scene.add(this.groundGroup);
  }

  private applyData(): void {
    if (!this.ready || !this.globe) return;
    const { latitude, longitude } = this.data;

    this.updatePin();
    this.homePov = { lat: latitude, lng: longitude, altitude: HOME_ALTITUDE };

    const { latitude: sunLat, longitude: sunLon } = subSolarPoint(this.data.now);
    const { latitude: moonLat, longitude: moonLon } = subLunarPoint(this.data.now);
    const sunDir = v3(this.globe.getCoords(sunLat, sunLon, 1)).normalize();

    this.nightMaterial.uniforms.sunDirection.value.copy(sunDir);
    this.gibsCloudMaterial.uniforms.sunDirection.value.copy(sunDir);
    this.worldSunDir.copy(sunDir);
    for (const mesh of this.cloudPatches.values()) {
      (mesh.material as THREE.ShaderMaterial).uniforms.sunDirection.value.copy(sunDir);
    }

    const sunPos = this.globe.getCoords(sunLat, sunLon, SUN_ALTITUDE);
    this.sun.position.copy(v3(sunPos));
    this.sunHalo.position.copy(v3(sunPos));
    const moonPos = this.globe.getCoords(moonLat, moonLon, MOON_ALTITUDE);
    this.moon.position.copy(v3(moonPos));
    this.moonHalo.position.copy(v3(moonPos));
    this.applyMoonRotation();

    this.rebuildPrayerLines(sunLat, sunLon);

    if (OPENWEATHER_API_KEY) this.maybeRefreshClouds();
  }

  /**
   * Draw the solar lines: the sunrise/sunset terminator (where the sun is on
   * the horizon right now) and the noon meridian (where it's currently Dhuhr),
   * each labelled with the user's local salah time at the equator.
   */
  private rebuildPrayerLines(sunLat: number, sunLon: number): void {
    // Clear the previous lines + labels.
    this.prayerLineMaterials.length = 0;
    for (const obj of [...this.prayerLinesGroup.children]) {
      this.prayerLinesGroup.remove(obj);
      if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      } else {
        const mesh = obj as THREE.Line;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else (mat as THREE.Material)?.dispose();
      }
    }

    const radius = GLOBE_RADIUS * (1 + SUN_LINE_ALTITUDE);
    const labelRadius = GLOBE_RADIUS * 1.035;
    const sunDir = v3(this.globe.getCoords(sunLat, sunLon, 1)).normalize();

    const fmt = (name: string) => {
      const p = this.data.prayers.find((x) => x.name === name);
      if (!p) return null;
      const t = p.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return `${name.charAt(0).toUpperCase() + name.slice(1)} ${t}`;
    };

    const addLabel = (lat: number, lon: number, text: string | null, color: string) => {
      if (!text) return;
      const pos = geo2xyz(lat, lon, labelRadius);
      const sprite = prayerLabelSprite(text, color);
      sprite.position.set(pos.x, pos.y, pos.z);
      this.prayerLinesGroup.add(sprite);
    };

    const size = this.globe.renderer().getSize(new THREE.Vector2());
    const addFatLine = (points: THREE.Vector3[], color: string, opacity: number, widthPx: number) => {
      const flat: number[] = [];
      for (const p of points) flat.push(p.x, p.y, p.z);
      const geo = new LineGeometry();
      geo.setPositions(flat);
      const mat = new LineMaterial({ color, linewidth: widthPx, transparent: true, opacity });
      mat.resolution.set(size.x, size.y);
      this.prayerLineMaterials.push(mat);
      this.prayerLinesGroup.add(new Line2(geo, mat));
    };
    const addCircle = (thetaDeg: number, color: string, opacity: number, widthPx: number) =>
      addFatLine(sunAltitudeCircle(sunDir, thetaDeg, radius), color, opacity, widthPx);

    // Horizon (sunrise/sunset terminator), twilight (fajr/isha), Asr.
    addCircle(HORIZON_ANGLE_DEG, SUNRISE_COLOR, 0.95, TERMINATOR_WIDTH_PX);
    addCircle(TWILIGHT_ANGLE_DEG, FAJR_COLOR, 0.75, SOLAR_LINE_WIDTH_PX);
    addCircle(ASR_ANGLE_DEG, ASR_COLOR, 0.85, SOLAR_LINE_WIDTH_PX);

    // Noon meridian (Dhuhr).
    addFatLine(meridianPoints(sunLon, radius), NOON_COLOR, 1, MERIDIAN_WIDTH_PX);

    // Morning prayers are west of the sub-solar meridian, evening ones east.
    addLabel(0, sunLon - TWILIGHT_ANGLE_DEG, fmt('fajr'), FAJR_COLOR);
    addLabel(0, sunLon - HORIZON_ANGLE_DEG, fmt('sunrise'), SUNRISE_COLOR);
    addLabel(0, sunLon, fmt('dhuhr'), NOON_COLOR);
    addLabel(0, sunLon + ASR_ANGLE_DEG, fmt('asr'), ASR_COLOR);
    addLabel(0, sunLon + HORIZON_ANGLE_DEG, fmt('maghrib'), SUNSET_COLOR);
    addLabel(0, sunLon + TWILIGHT_ANGLE_DEG, fmt('isha'), ISHA_COLOR);
  }

  private updatePin(): void {
    const p = this.globe.getCoords(this.data.latitude, this.data.longitude, PIN_ALTITUDE);
    this.pin.position.copy(v3(p));
  }

  private updateZoomFades(): void {
    // In ground view the pointOfView() altitude is stale (the camera is moved
    // manually) and the pin/labels are hidden anyway — skip the fade logic.
    if (this.inGroundMode) return;
    const altitude = this.globe?.pointOfView().altitude ?? HOME_ALTITUDE;
    const fade = Math.max(0, Math.min(1, (altitude - 0.35) / 0.85));
    if (this.gibsCloudMaterial) this.gibsCloudMaterial.uniforms.opacity.value = this.baseCloudOpacity * fade;
    // Skip the GIBS shell entirely when the live layer is doing the clouds.
    if (this.gibsClouds) this.gibsClouds.visible = this.baseCloudOpacity > 0;
    for (const mesh of this.cloudPatches.values()) {
      (mesh.material as THREE.ShaderMaterial).uniforms.opacity.value = fade;
    }
    // Keep the marker a constant size on screen at every zoom level.
    const cam = this.globe.camera() as THREE.PerspectiveCamera;
    const canvasH = (this.host.clientHeight || 1) * Math.min(window.devicePixelRatio || 1, 2);
    const dist = Math.max(1, (altitude - PIN_ALTITUDE) * GLOBE_RADIUS);
    const worldSize = (PIN_SIZE_PX * 2 * Math.tan((cam.fov * D2R) / 2) * dist) / canvasH;
    this.pin.scale.setScalar(worldSize);
  }

  /** Fetch the daily NASA GIBS imagery for the fallback cloud mask. */
  private fetchGibsImagery(): void {
    getCloudImagery(this.data.now)
      .then((result) => {
        if (this.disposed || result.source === 'procedural' || !result.base64Jpeg) return;
        // Web Mercator tiles stop at ±85° latitude, so the polar caps have no
        // surface tiles and would otherwise render as a black "hole". Use the
        // same-day full-globe photo as the base sphere so the poles (and any
        // brief tile-loading gaps) show real imagery. prepareBaseMaterial()
        // keeps the tiles winning the depth test on top of it.
        const dataUrl = `data:image/jpeg;base64,${result.base64Jpeg}`;
        this.globe.globeImageUrl(dataUrl);
        this.prepareBaseMaterial();

        const img = new Image();
        img.onload = () => {
          if (this.disposed) return;
          const canvas = extractCloudAlpha(img);
          const tex = new THREE.CanvasTexture(canvas);
          const prev = this.gibsCloudMaterial.uniforms.cloudMap.value as THREE.Texture;
          if (prev && prev !== this.placeholderTexture) prev.dispose();
          this.gibsCloudMaterial.uniforms.cloudMap.value = tex;
          this.baseCloudOpacity = OPENWEATHER_API_KEY ? 0 : 1;
          this.gibsCloudMaterial.needsUpdate = true;
          this.updateZoomFades();
          this.renderThenSettle();
        };
        img.src = dataUrl;
      })
      .catch(() => {});
  }

  // ── live clouds (OpenWeatherMap) ─────────────────────────────────────

  private maybeRefreshClouds(): void {
    const now = performance.now();
    if (now - this.lastCloudFetch < OWM_CLOUD_REFETCH_MS) return;
    this.lastCloudFetch = now;
    for (const tex of this.cloudTextures.values()) tex.dispose();
    this.cloudTextures.clear();
    for (const [, mesh] of this.cloudPatches) {
      this.cloudGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.ShaderMaterial).dispose();
    }
    this.cloudPatches.clear();
    this.lastCloudPov = { lat: -999, lng: -999 };
    this.refreshClouds();
  }

  /** Cover the newly-visible region after a spin, reusing cached tiles. */
  private refreshCloudsOnRotation(): void {
    if (!OPENWEATHER_API_KEY || !this.ready) return;
    const pov = this.globe.pointOfView();
    const dLat = Math.abs(pov.lat - this.lastCloudPov.lat);
    const dLng = Math.abs((((pov.lng - this.lastCloudPov.lng + 540) % 360) + 360) % 360 - 180);
    if (Math.max(dLat, dLng) < 12) return;
    this.lastCloudPov = { lat: pov.lat, lng: pov.lng };
    this.refreshClouds();
  }

  private refreshClouds(): void {
    if (!OPENWEATHER_API_KEY || !this.ready) return;
    const pov = this.globe.pointOfView();
    const window: LatLonWindow = { latitude: pov.lat, longitude: pov.lng, latHalf: 88, lonHalf: 88 };
    const tiles = enumerateTiles(window, OWM_CLOUD_TILE_Z);

    const desired = new Set<string>();
    for (const tile of tiles) {
      const key = tileKey(tile);
      const lat = tileYToLat(tile.y + 0.5, tile.z);
      const lng = tileXToLon(tile.x + 0.5, tile.z);
      if (angularSeparation({ latitude: pov.lat, longitude: pov.lng }, { latitude: lat, longitude: lng }) > 92) continue;
      desired.add(key);
      if (this.cloudPatches.has(key) || this.cloudLoading.has(key)) continue;
      this.createCloudPatch(tile);
    }
    for (const [key, mesh] of this.cloudPatches) {
      if (!desired.has(key)) {
        this.cloudPatches.delete(key);
        this.cloudGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.ShaderMaterial).dispose();
      }
    }
  }

  private createCloudPatch(tile: TileRef): void {
    const ssp = subSolarPoint(this.data.now);
    const sunDir = v3(this.globe.getCoords(ssp.latitude, ssp.longitude, 1)).normalize();
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        cloudMap: { value: this.emptyTexture() },
        sunDirection: { value: sunDir },
        opacity: { value: 0 },
      },
      vertexShader: SURFACE_VERTEX_SHADER,
      fragmentShader: CLOUD_TILE_FRAGMENT_SHADER,
    });
    const mesh = new THREE.Mesh(buildCloudTileGeometry(tile, GLOBE_RADIUS * (1 + OWM_CLOUD_ALTITUDE)), material);
    this.cloudGroup.add(mesh);
    this.cloudPatches.set(tileKey(tile), mesh);
    this.loadCloudImage(tile, mesh);
  }

  private loadCloudImage(tile: TileRef, mesh: THREE.Mesh): void {
    const key = tileKey(tile);
    this.cloudLoading.add(key);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.cloudLoading.delete(key);
      if (this.disposed) return;
      const tex = new THREE.Texture(img);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      this.cloudTextures.set(key, tex);
      (mesh.material as THREE.ShaderMaterial).uniforms.cloudMap.value = tex;
      (mesh.material as THREE.ShaderMaterial).needsUpdate = true;
      this.updateZoomFades();
      this.renderThenSettle();
    };
    img.onerror = () => this.cloudLoading.delete(key);
    img.src = cloudTileUrl(tile, OPENWEATHER_API_KEY);
  }

  private placeholderTexture?: THREE.DataTexture;

  /** Shared 1×1 transparent stand-in until a patch's real texture loads —
   *  one per globe, not one per patch. */
  private emptyTexture(): THREE.DataTexture {
    if (!this.placeholderTexture) {
      const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1, THREE.RGBAFormat);
      tex.needsUpdate = true;
      this.placeholderTexture = tex;
    }
    return this.placeholderTexture;
  }
}

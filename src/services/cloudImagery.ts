import { CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

const CLOUD_SUBDIR = 'cloud-imagery';
const CLOUD_FILENAME = 'latest.jpg';
const CLOUD_PATH = `${CLOUD_SUBDIR}/${CLOUD_FILENAME}`;
const CLOUD_DATE_KEY = 'ontime_cloud_imagery_date';

/** Cloud-mask working width; see extractCloudAlpha. 512×256 = 1/16th the work. */
const CLOUD_MASK_MAX_WIDTH = 512;

/**
 * NASA GIBS TrueColor mosaic. Verified by hand: returns image/jpeg,
 * access-control-allow-origin: *. There is no clean cloud-only layer in
 * GIBS (Cloud_Fraction renders as a discrete scientific color palette, not
 * a grayscale mask) — clouds are extracted from this real photo
 * client-side by extractCloudAlpha below. This same image now also serves
 * as the home globe's earth surface (see homeGlobe.ts), so the resolution
 * is high enough to read as a real planet up close, not just a cloud mask.
 *
 * Deliberately requests YESTERDAY's date, not today's: VIIRS SNPP is a
 * polar orbiter that builds up same-day global coverage swath by swath as
 * it passes over the earth, so a same-day request can return a mosaic
 * that's only partially filled in — most of the globe rendered black —
 * depending what time of day (UTC) the request lands. Verified by pulling
 * a same-day fetch straight off a device: a large fraction of the globe
 * was solid black, with real imagery only where the satellite had already
 * passed. Yesterday is always a complete mosaic, and this is a decorative
 * background — a day-old cloud pattern is indistinguishable from live.
 */
const GIBS_URL =
  'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap' +
  '&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor' +
  '&STYLES=&FORMAT=image/jpeg&HEIGHT=1024&WIDTH=2048&SRS=EPSG:4326&BBOX=-180,-90,180,90';

export interface CloudImageResult {
  /** Raw base64 JPEG data (no `data:` prefix). Null only when source is 'procedural'. */
  base64Jpeg: string | null;
  /** YYYY-MM-DD (UTC) the imagery is dated. */
  date: string;
  source: 'fresh' | 'cached' | 'procedural';
}

function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** UTC calendar date one day before `now` — see the GIBS_URL comment above. */
function yesterdayUtcDateString(now: Date): string {
  return utcDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

async function readCachedImage(): Promise<string | null> {
  try {
    const { data } = await Filesystem.readFile({ path: CLOUD_PATH, directory: Directory.External });
    return data as string;
  } catch {
    return null;
  }
}

export async function getCloudImagery(now: Date): Promise<CloudImageResult> {
  const today = utcDateString(now);

  const { value: cachedDate } = await Preferences.get({ key: CLOUD_DATE_KEY });
  if (cachedDate === today) {
    const cached = await readCachedImage();
    if (cached) return { base64Jpeg: cached, date: today, source: 'cached' };
  }

  try {
    const response = await CapacitorHttp.get({
      url: `${GIBS_URL}&TIME=${yesterdayUtcDateString(now)}`,
      responseType: 'blob',
    });
    if (!(response.status >= 200 && response.status < 300)) {
      throw new Error(`GIBS request failed with status ${response.status}`);
    }
    const base64Jpeg = response.data as string;

    // Caching is best-effort: a failure here (disk full, permissions) must
    // not discard the imagery we already fetched. Isolated in its own
    // try/catch so it can't fall into the outer catch and get treated as a
    // fetch failure (which would serve stale/procedural data instead of the
    // fresh image already in hand).
    try {
      try {
        await Filesystem.mkdir({ path: CLOUD_SUBDIR, directory: Directory.External, recursive: true });
      } catch {
        // Directory may already exist.
      }
      await Filesystem.writeFile({ path: CLOUD_PATH, data: base64Jpeg, directory: Directory.External });
      await Preferences.set({ key: CLOUD_DATE_KEY, value: today });
    } catch (err) {
      console.warn('cloud imagery caching failed', err);
    }

    return { base64Jpeg, date: today, source: 'fresh' };
  } catch {
    const stale = await readCachedImage();
    if (stale) return { base64Jpeg: stale, date: cachedDate ?? 'unknown', source: 'cached' };
    return { base64Jpeg: null, date: today, source: 'procedural' };
  }
}

/**
 * Extracts a white-RGBA cloud mask from a real satellite photo via HSV
 * thresholding: bright, low-saturation pixels (clouds) score near 1;
 * darker or more-saturated pixels (ocean, land, vegetation) score near 0.
 * Visually verified against a real fetched GIBS image during design — the
 * extracted mask closely tracked the actual cloud swirls.
 */
export function extractCloudAlpha(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  // Downscaled first: at the source 2048×1024 this loop is two million
  // iterations on the main thread, and it runs exactly when the globe is
  // loading — a visible freeze. The output is a soft, semi-transparent cloud
  // overlay stretched over a whole planet, so the lost resolution doesn't read.
  const scale = Math.min(1, CLOUD_MASK_MAX_WIDTH / (image.naturalWidth || 1));
  canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = frame.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    const s = max === 0 ? 0 : (max - min) / max;
    const cloudScore = Math.min(1, Math.max(0, v - 0.55) * Math.max(0, 0.35 - s) * 12);
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = Math.round(cloudScore * 255);
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

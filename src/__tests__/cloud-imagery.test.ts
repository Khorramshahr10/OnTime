import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Preferences } from '@capacitor/preferences';

const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockReadFile = vi.fn();

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
  Directory: {
    External: 'EXTERNAL',
  },
}));

const mockHttpGet = vi.fn();

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: {
    get: (...args: unknown[]) => mockHttpGet(...args),
  },
  registerPlugin: () => ({}),
}));

import { getCloudImagery, extractCloudAlpha } from '../services/cloudImagery';

const NOW = new Date('2026-08-23T15:00:00.000Z');
const TODAY = '2026-08-23';
const YESTERDAY = '2026-08-22';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Preferences.get).mockResolvedValue({ value: null });
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockReadFile.mockRejectedValue(new Error('not found'));
  mockHttpGet.mockResolvedValue({ data: 'freshbase64data', status: 200 });
});

describe('getCloudImagery', () => {
  it('fetches and caches fresh imagery when nothing is cached today', async () => {
    const result = await getCloudImagery(NOW);

    expect(result).toEqual({ base64Jpeg: 'freshbase64data', date: TODAY, source: 'fresh' });
    expect(mockHttpGet).toHaveBeenCalledTimes(1);
    expect(mockHttpGet.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        // Requests yesterday's date, not today's: a same-day VIIRS mosaic
        // can still be mid-composite and mostly black. See GIBS_URL's
        // comment in cloudImagery.ts.
        url: expect.stringContaining(`TIME=${YESTERDAY}`),
        responseType: 'blob',
      }),
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'freshbase64data', directory: 'EXTERNAL' }),
    );
    expect(vi.mocked(Preferences.set)).toHaveBeenCalledWith({
      key: 'ontime_cloud_imagery_date',
      value: TODAY,
    });
  });

  it('returns the cached file without fetching when already cached today', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: TODAY });
    mockReadFile.mockResolvedValue({ data: 'cachedbase64data' });

    const result = await getCloudImagery(NOW);

    expect(result).toEqual({ base64Jpeg: 'cachedbase64data', date: TODAY, source: 'cached' });
    expect(mockHttpGet).not.toHaveBeenCalled();
  });

  it('falls back to a stale cached file when the fetch fails', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: '2026-08-20' });
    mockHttpGet.mockRejectedValue(new Error('network down'));
    mockReadFile.mockResolvedValue({ data: 'stalebase64data' });

    const result = await getCloudImagery(NOW);

    expect(result).toEqual({ base64Jpeg: 'stalebase64data', date: '2026-08-20', source: 'cached' });
  });

  it('falls back to procedural when there is no cache and the fetch fails', async () => {
    mockHttpGet.mockRejectedValue(new Error('offline'));
    mockReadFile.mockRejectedValue(new Error('not found'));

    const result = await getCloudImagery(NOW);

    expect(result).toEqual({ base64Jpeg: null, date: TODAY, source: 'procedural' });
  });

  it('treats a non-2xx response as a failure and does not poison the cache', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: '2026-08-20' });
    mockHttpGet.mockResolvedValue({ data: '<ServiceException>error</ServiceException>', status: 503 });
    mockReadFile.mockResolvedValue({ data: 'stalebase64data' });

    const result = await getCloudImagery(NOW);

    expect(result).toEqual({ base64Jpeg: 'stalebase64data', date: '2026-08-20', source: 'cached' });
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(vi.mocked(Preferences.set)).not.toHaveBeenCalled();
  });

  it('falls back to procedural on a non-2xx response with no cache available', async () => {
    mockHttpGet.mockResolvedValue({ data: 'not really an image', status: 500 });
    mockReadFile.mockRejectedValue(new Error('not found'));

    const result = await getCloudImagery(NOW);

    expect(result).toEqual({ base64Jpeg: null, date: TODAY, source: 'procedural' });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('still returns the freshly-fetched image when caching fails', async () => {
    mockWriteFile.mockRejectedValue(new Error('disk full'));

    const result = await getCloudImagery(NOW);

    expect(result).toEqual({ base64Jpeg: 'freshbase64data', date: TODAY, source: 'fresh' });
    expect(vi.mocked(Preferences.set)).not.toHaveBeenCalled();
  });

  it('still caches the date when mkdir fails because the directory already exists', async () => {
    mockMkdir.mockRejectedValue(new Error('EEXIST'));

    const result = await getCloudImagery(NOW);

    expect(result).toEqual({ base64Jpeg: 'freshbase64data', date: TODAY, source: 'fresh' });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'freshbase64data', directory: 'EXTERNAL' }),
    );
    expect(vi.mocked(Preferences.set)).toHaveBeenCalledWith({
      key: 'ontime_cloud_imagery_date',
      value: TODAY,
    });
  });
});

describe('extractCloudAlpha', () => {
  let fakeCtx: {
    drawImage: ReturnType<typeof vi.fn>;
    getImageData: ReturnType<typeof vi.fn>;
    putImageData: ReturnType<typeof vi.fn>;
  };
  let lastPutData: Uint8ClampedArray | null;

  function setupPixels(pixels: [number, number, number][]) {
    const data = new Uint8ClampedArray(pixels.length * 4);
    pixels.forEach(([r, g, b], i) => {
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    });
    fakeCtx.getImageData.mockReturnValue({ data, width: pixels.length, height: 1 });
  }

  function makeImage(naturalWidth: number, naturalHeight: number): HTMLImageElement {
    return { naturalWidth, naturalHeight } as unknown as HTMLImageElement;
  }

  beforeEach(() => {
    lastPutData = null;
    fakeCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn((imageData: { data: Uint8ClampedArray }) => {
        lastPutData = imageData.data;
      }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fakeCtx as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produces full alpha for pure white pixels', () => {
    setupPixels([[255, 255, 255]]);
    extractCloudAlpha(makeImage(1, 1));
    expect(lastPutData![3]).toBe(255);
  });

  it('produces zero alpha for pure black pixels', () => {
    setupPixels([[0, 0, 0]]);
    extractCloudAlpha(makeImage(1, 1));
    expect(lastPutData![3]).toBe(0);
  });

  it('produces zero alpha for saturated blue ocean pixels', () => {
    setupPixels([[20, 60, 180]]);
    extractCloudAlpha(makeImage(1, 1));
    expect(lastPutData![3]).toBe(0);
  });

  it('produces zero alpha for saturated green vegetation pixels', () => {
    setupPixels([[30, 150, 40]]);
    extractCloudAlpha(makeImage(1, 1));
    expect(lastPutData![3]).toBe(0);
  });

  it('produces zero alpha for mid-gray pixels just under the brightness threshold', () => {
    setupPixels([[140, 140, 140]]);
    extractCloudAlpha(makeImage(1, 1));
    expect(lastPutData![3]).toBe(0);
  });

  it('produces full alpha for bright off-white cloud-like pixels', () => {
    setupPixels([[235, 238, 240]]);
    extractCloudAlpha(makeImage(1, 1));
    expect(lastPutData![3]).toBe(255);
  });

  it('always writes R=G=B=255 for every pixel regardless of input color', () => {
    setupPixels([
      [255, 255, 255],
      [0, 0, 0],
      [20, 60, 180],
      [30, 150, 40],
      [140, 140, 140],
      [235, 238, 240],
    ]);
    extractCloudAlpha(makeImage(6, 1));
    for (let i = 0; i < 6; i++) {
      expect(lastPutData![i * 4]).toBe(255);
      expect(lastPutData![i * 4 + 1]).toBe(255);
      expect(lastPutData![i * 4 + 2]).toBe(255);
    }
  });

  it('downscales an oversized image to the mask cap, keeping its aspect ratio', () => {
    setupPixels([[255, 255, 255]]);
    const canvas = extractCloudAlpha(makeImage(2048, 1024));
    // Capped at 512 wide: the full-size loop is 2M main-thread iterations
    // running while the globe loads.
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(256);
  });

  it('leaves an image already under the cap at its natural size', () => {
    setupPixels([[255, 255, 255]]);
    const canvas = extractCloudAlpha(makeImage(256, 128));
    expect(canvas.width).toBe(256);
    expect(canvas.height).toBe(128);
  });
});

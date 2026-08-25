import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { getCloudImagery } from '../services/cloudImagery';

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

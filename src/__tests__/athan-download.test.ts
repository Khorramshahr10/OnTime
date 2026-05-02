import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockDeleteFile = vi.fn();

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
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
}));

import { downloadAthan, AthanDownloadError } from '../services/athanService';
import type { AthanCatalogEntry } from '../types';

const mockEntry: AthanCatalogEntry = {
  muezzinName: 'Test Muezzin',
  title: 'Test Athan',
  duration: '2:30',
  sourceUrl: 'https://example.com/athan.mp3',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockHttpGet.mockResolvedValue({ data: 'base64mockdata' });
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
});

describe('downloadAthan', () => {
  it('returns AthanFile on successful download and write', async () => {
    const result = await downloadAthan(mockEntry);

    expect(result.muezzinName).toBe('Test Muezzin');
    expect(result.title).toBe('Test Athan');
    expect(result.filename).toMatch(/\.mp3$/);
    expect(result.sourceUrl).toBe(mockEntry.sourceUrl);
    expect(result.downloadedAt).toBeDefined();
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('throws AthanDownloadError when writeFile fails', async () => {
    mockWriteFile.mockRejectedValue(new Error('Disk full'));

    await expect(downloadAthan(mockEntry)).rejects.toThrow(AthanDownloadError);
    await expect(downloadAthan(mockEntry)).rejects.toThrow(
      'Could not save athan sound. Your device may be out of storage.',
    );
  });

  it('throws AthanDownloadError when HTTP download fails', async () => {
    mockHttpGet.mockRejectedValue(new Error('Network error'));

    await expect(downloadAthan(mockEntry)).rejects.toThrow(AthanDownloadError);
    await expect(downloadAthan(mockEntry)).rejects.toThrow(
      'Could not download athan sound. Please check your internet connection.',
    );
  });

  it('AthanDownloadError has the correct name property', async () => {
    mockWriteFile.mockRejectedValue(new Error('fail'));

    try {
      await downloadAthan(mockEntry);
      expect.fail('Expected downloadAthan to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as AthanDownloadError).name).toBe('AthanDownloadError');
    }
  });

  it('AthanDownloadError preserves the cause', async () => {
    const cause = new Error('Disk full');
    mockWriteFile.mockRejectedValue(cause);

    try {
      await downloadAthan(mockEntry);
      expect.fail('Expected downloadAthan to throw');
    } catch (err) {
      expect((err as AthanDownloadError).cause).toBe(cause);
    }
  });
});
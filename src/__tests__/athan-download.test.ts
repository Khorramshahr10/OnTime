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
  registerPlugin: () => ({}),
}));

const mockGetExternalFilesDir = vi.fn();
const mockCreateAthanChannel = vi.fn();
const mockDeleteChannel = vi.fn();

vi.mock('../plugins/athanPlugin', () => ({
  AthanPlugin: {
    getExternalFilesDir: (...args: unknown[]) => mockGetExternalFilesDir(...args),
    createAthanChannel: (...args: unknown[]) => mockCreateAthanChannel(...args),
    deleteChannel: (...args: unknown[]) => mockDeleteChannel(...args),
    playPreview: vi.fn().mockResolvedValue(undefined),
    stopPreview: vi.fn().mockResolvedValue(undefined),
  },
}));

import { downloadAthan, selectAthan, AthanDownloadError } from '../services/athanService';
import type { AthanCatalogEntry, AthanFile } from '../types';

const mockEntry: AthanCatalogEntry = {
  muezzinName: 'Test Muezzin',
  title: 'Test Athan',
  duration: '2:30',
  sourceUrl: 'https://example.com/athan.mp3',
};

// Big enough to be a real adhan once base64'd; the validation rejects anything
// that looks like an error page rather than audio.
const AUDIO_PAYLOAD = 'A'.repeat(200_000);

beforeEach(() => {
  vi.clearAllMocks();
  mockHttpGet.mockResolvedValue({
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg' },
    data: AUDIO_PAYLOAD,
  });
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockGetExternalFilesDir.mockResolvedValue({ path: '/storage/emulated/0/Android/data/app/files' });
  mockCreateAthanChannel.mockResolvedValue(undefined);
  mockDeleteChannel.mockResolvedValue(undefined);
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

describe('downloadAthan rejects a response that is not audio', () => {
  it('refuses a 404 instead of writing the error page as an mp3', async () => {
    mockHttpGet.mockResolvedValue({
      status: 404,
      headers: { 'Content-Type': 'text/html' },
      data: '<html>not found</html>',
    });

    await expect(downloadAthan(mockEntry)).rejects.toThrow(/404/);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('refuses a 200 that is actually a web page', async () => {
    mockHttpGet.mockResolvedValue({
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      data: 'A'.repeat(300_000),
    });

    await expect(downloadAthan(mockEntry)).rejects.toThrow(/web page instead of audio/);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('refuses a payload too small to be an athan', async () => {
    mockHttpGet.mockResolvedValue({
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
      data: 'truncated',
    });

    await expect(downloadAthan(mockEntry)).rejects.toThrow(/too short/);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('accepts audio served as octet-stream', async () => {
    // A strict allowlist would reject servers that do not label their audio,
    // which is the failure mode worth avoiding here.
    mockHttpGet.mockResolvedValue({
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
      data: AUDIO_PAYLOAD,
    });

    await expect(downloadAthan(mockEntry)).resolves.toMatchObject({ title: 'Test Athan' });
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('reads the content type whichever way the native stack capitalises it', async () => {
    mockHttpGet.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html' },
      data: AUDIO_PAYLOAD,
    });

    await expect(downloadAthan(mockEntry)).rejects.toThrow(/web page instead of audio/);
  });
});

describe('selectAthan channel ordering', () => {
  const athan: AthanFile = {
    id: 'abc123',
    muezzinName: 'Makkah',
    title: 'Adhan Makkah',
    filename: 'abc123.mp3',
    duration: '3:00',
    sourceUrl: 'https://example.com/a.mp3',
    downloadedAt: new Date().toISOString(),
  };

  it('builds the replacement before retiring the channel that works', async () => {
    const calls: string[] = [];
    mockCreateAthanChannel.mockImplementation(async () => { calls.push('create'); });
    mockDeleteChannel.mockImplementation(async () => { calls.push('delete'); });

    await selectAthan(athan, 'athan_main_old', 'main');

    expect(calls).toEqual(['create', 'delete']);
  });

  it('leaves the working channel alone when creating the replacement fails', async () => {
    // The whole point of the ordering: a failed switch used to destroy the
    // channel that was working, and Android silently drops notifications
    // posted to a channel that no longer exists.
    mockCreateAthanChannel.mockRejectedValue(new Error('Sound file not found'));

    await expect(selectAthan(athan, 'athan_main_old', 'main')).rejects.toThrow();
    expect(mockDeleteChannel).not.toHaveBeenCalled();
  });

  it('leaves the working channel alone when the path lookup fails', async () => {
    mockGetExternalFilesDir.mockRejectedValue(new Error('External files directory not available'));

    await expect(selectAthan(athan, 'athan_main_old', 'main')).rejects.toThrow();
    expect(mockCreateAthanChannel).not.toHaveBeenCalled();
    expect(mockDeleteChannel).not.toHaveBeenCalled();
  });

  it('does not delete the channel it just recreated when re-selecting the same athan', async () => {
    // Same id, so "the old channel" and the new one are the same channel.
    await selectAthan(athan, 'athan_main_abc123', 'main');

    expect(mockCreateAthanChannel).toHaveBeenCalledTimes(1);
    expect(mockDeleteChannel).not.toHaveBeenCalled();
  });

  it('creates but never deletes on a first selection', async () => {
    const channelId = await selectAthan(athan, null, 'fajr');

    expect(channelId).toBe('athan_fajr_abc123');
    expect(mockCreateAthanChannel).toHaveBeenCalledTimes(1);
    expect(mockDeleteChannel).not.toHaveBeenCalled();
  });
});
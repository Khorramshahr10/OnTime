import { Filesystem, Directory } from '@capacitor/filesystem';
import { CapacitorHttp } from '@capacitor/core';
import { AthanPlugin } from '../plugins/athanPlugin';
import type { AthanCatalogEntry, AthanFile } from '../types';

const ATHAN_SUBDIR = 'athans';

export class AthanDownloadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AthanDownloadError';
  }
}

export async function fetchAthanCatalog(): Promise<AthanCatalogEntry[]> {
  const response = await CapacitorHttp.get({ url: 'https://www.assabile.com/adhan-call-prayer' });
  const html = response.data as string;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const items = doc.querySelectorAll('#ul-play-list li');

  const entries: AthanCatalogEntry[] = [];

  items.forEach((li) => {
    const linkEl = li.querySelector('a.link-media');
    const durationEl = li.querySelector('span');

    if (!linkEl) return;

    const href = linkEl.getAttribute('href') || '';
    const text = (linkEl.textContent || '').trim();
    const duration = (durationEl?.textContent || '').trim();

    // Text format: "Muezzin Name - Title"
    const dashIndex = text.indexOf(' - ');
    const muezzinName = dashIndex >= 0 ? text.substring(0, dashIndex).trim() : text;
    const title = dashIndex >= 0 ? text.substring(dashIndex + 3).trim() : '';

    // Build absolute URL if relative
    const sourceUrl = href.startsWith('http')
      ? href
      : `https://www.assabile.com${href.startsWith('/') ? '' : '/'}${href}`;

    entries.push({ muezzinName, title, duration, sourceUrl });
  });

  return entries;
}

export async function downloadAthan(entry: AthanCatalogEntry): Promise<AthanFile> {
  const id = crypto.randomUUID();
  const filename = `${id}.mp3`;

  // Download via native HTTP to avoid CORS, get base64 data
  let responseData: string;
  try {
    const response = await CapacitorHttp.get({
      url: entry.sourceUrl,
      responseType: 'blob',
    });
    responseData = response.data as string;
  } catch (err) {
    throw new AthanDownloadError(
      'Could not download athan sound. Please check your internet connection.',
      err,
    );
  }

  // Ensure athans directory exists
  try {
    await Filesystem.mkdir({
      path: ATHAN_SUBDIR,
      directory: Directory.External,
      recursive: true,
    });
  } catch {
    // Directory may already exist
  }

  // Write the downloaded data
  try {
    await Filesystem.writeFile({
      path: `${ATHAN_SUBDIR}/${filename}`,
      data: responseData,
      directory: Directory.External,
    });
  } catch (err) {
    throw new AthanDownloadError(
      'Could not save athan sound. Your device may be out of storage.',
      err,
    );
  }

  return {
    id,
    muezzinName: entry.muezzinName,
    title: entry.title,
    filename,
    duration: entry.duration,
    sourceUrl: entry.sourceUrl,
    downloadedAt: new Date().toISOString(),
  };
}

export async function deleteAthanFile(filename: string): Promise<void> {
  await Filesystem.deleteFile({
    path: `${ATHAN_SUBDIR}/${filename}`,
    directory: Directory.External,
  });
}

export async function getAthanFilePath(filename: string): Promise<string> {
  const { path } = await AthanPlugin.getExternalFilesDir();
  return `${path}/${ATHAN_SUBDIR}/${filename}`;
}

export async function selectAthan(
  athanFile: AthanFile,
  currentChannelId: string | null,
  suffix: string, // 'main' or 'fajr'
): Promise<string> {
  // Delete old channel if exists
  if (currentChannelId) {
    await AthanPlugin.deleteChannel({ channelId: currentChannelId });
  }

  const filePath = await getAthanFilePath(athanFile.filename);
  const channelId = `athan_${suffix}_${athanFile.id}`;
  const channelName = suffix === 'fajr'
    ? `Fajr Athan - ${athanFile.muezzinName}`
    : `Athan - ${athanFile.muezzinName}`;

  await AthanPlugin.createAthanChannel({
    channelId,
    channelName,
    soundFilePath: filePath,
  });

  return channelId;
}

export async function playAthanPreview(filename: string): Promise<void> {
  const filePath = await getAthanFilePath(filename);
  await AthanPlugin.playPreview({ filePath });
}

export async function stopAthanPreview(): Promise<void> {
  await AthanPlugin.stopPreview();
}
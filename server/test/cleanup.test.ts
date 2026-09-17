import { utimes, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sweepExpiredFiles } from '../src/services/cleanup.js';
import { addFile, clearQueue, getFile, listFiles, type InternalFile } from '../src/services/queue.js';
import { storageDir } from '../src/services/storage.js';
import { newId } from '../src/utils/id.js';
import { useTemporaryStorage, type TestStorage } from './helpers.js';

let storage: TestStorage;

beforeEach(async () => {
  // A one-hour window keeps the arithmetic in the tests obvious.
  storage = await useTemporaryStorage({ AIRFLAC_FILE_RETENTION_HOURS: '1' });
  clearQueue();
});

afterEach(async () => {
  clearQueue();
  await storage.cleanup();
});

const HOUR_MS = 60 * 60 * 1000;

async function writeAged(area: 'uploads' | 'converted' | 'archives', name: string, ageMs: number) {
  const path = join(storageDir(area), name);
  await writeFile(path, 'test');

  const when = new Date(Date.now() - ageMs);
  await utimes(path, when, when);
  return path;
}

function queueEntry(id: string, createdAt: number): InternalFile {
  return {
    id,
    filename: 'file.wav',
    outputFilename: 'file.flac',
    status: 'complete',
    tech: null,
    metadata: { title: '', artist: '', album: '' },
    sourceMetadata: { title: '', artist: '', album: '' },
    artwork: null,
    originalSize: 1,
    convertedSize: 1,
    progress: 100,
    error: null,
    jobId: null,
    createdAt,
    uploadPath: join(storageDir('uploads'), id),
    convertedPath: null,
    artworkPath: null,
    artworkMimeType: null,
  };
}

describe('retention sweep', () => {
  it('removes files older than the retention window and keeps newer ones', async () => {
    const old = await writeAged('uploads', 'old-upload', 3 * HOUR_MS);
    const recent = await writeAged('uploads', 'recent-upload', 10 * 60 * 1000);
    const oldConverted = await writeAged('converted', 'old.flac', 5 * HOUR_MS);
    const oldArchive = await writeAged('archives', 'old.zip', 5 * HOUR_MS);

    const result = await sweepExpiredFiles();

    expect(existsSync(old)).toBe(false);
    expect(existsSync(oldConverted)).toBe(false);
    expect(existsSync(oldArchive)).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(result.removedFiles).toBe(3);
  });

  it('drops queue entries whose files have expired', async () => {
    const expiredId = newId();
    const freshId = newId();

    addFile(queueEntry(expiredId, Date.now() - 3 * HOUR_MS));
    addFile(queueEntry(freshId, Date.now()));

    const result = await sweepExpiredFiles();

    expect(getFile(expiredId)).toBeUndefined();
    expect(getFile(freshId)).toBeDefined();
    expect(result.removedEntries).toBe(1);
    expect(listFiles()).toHaveLength(1);
  });

  it('leaves the .gitkeep placeholders alone', async () => {
    const keep = join(storageDir('uploads'), '.gitkeep');
    await writeFile(keep, '');
    const when = new Date(Date.now() - 100 * HOUR_MS);
    await utimes(keep, when, when);

    await sweepExpiredFiles();

    expect(existsSync(keep)).toBe(true);
  });

  it('does nothing when everything is current', async () => {
    await writeAged('uploads', 'current', 1000);

    const result = await sweepExpiredFiles();

    expect(result.removedFiles).toBe(0);
    expect(result.removedEntries).toBe(0);
  });
});

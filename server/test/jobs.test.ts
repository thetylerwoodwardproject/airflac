import { copyFile } from 'node:fs/promises';

import { DEFAULT_SETTINGS, type FileStatus, type QueuedFile } from '@airflac/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startConversion } from '../src/services/conversion.js';
import { probeFile } from '../src/services/ffprobe.js';
import {
  addFile,
  clearQueue,
  getFile,
  getJob,
  subscribe,
  toPublicFile,
  type InternalFile,
} from '../src/services/queue.js';
import { storageFilePath } from '../src/services/storage.js';
import { newId } from '../src/utils/id.js';
import { FIXTURES } from './fixtures/generateFixtures.js';
import { useTemporaryStorage, type TestStorage } from './helpers.js';

let storage: TestStorage;

beforeEach(async () => {
  storage = await useTemporaryStorage();
  clearQueue();
});

afterEach(async () => {
  clearQueue();
  await storage.cleanup();
});

/** Copies a fixture into storage and registers it the way an upload would. */
async function queueFixture(fixture: string, filename: string): Promise<InternalFile> {
  const id = newId();
  const uploadPath = storageFilePath('uploads', id);
  await copyFile(fixture, uploadPath);

  const probe = await probeFile(uploadPath);
  const record: InternalFile = {
    id,
    filename,
    outputFilename: filename.replace(/\.[^.]+$/, '.flac'),
    status: 'ready',
    tech: probe.tech,
    metadata: { ...probe.metadata },
    sourceMetadata: { ...probe.metadata },
    artwork: null,
    originalSize: 1,
    convertedSize: null,
    progress: null,
    error: null,
    jobId: null,
    createdAt: Date.now(),
    uploadPath,
    convertedPath: null,
    artworkPath: null,
    artworkMimeType: null,
  };

  addFile(record);
  return record;
}

async function waitForStatus(fileId: string, statuses: FileStatus[]): Promise<void> {
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    const status = getFile(fileId)?.status;
    if (status && statuses.includes(status)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`file ${fileId} never reached ${statuses.join(' or ')}`);
}

describe('conversion job state', () => {
  it('moves a file from ready through to complete and marks the job complete', async () => {
    const file = await queueFixture(FIXTURES.wav16, 'Promo.wav');
    const seen: FileStatus[] = [];

    const unsubscribe = subscribe((event) => {
      if (event.type === 'file:update' && event.file.id === file.id) {
        if (seen.at(-1) !== event.file.status) seen.push(event.file.status);
      }
    });

    const job = startConversion([file.id], DEFAULT_SETTINGS);
    expect(job.status).toBe('pending');
    expect(job.totalCount).toBe(1);

    await waitForStatus(file.id, ['complete', 'failed']);
    unsubscribe();

    expect(getFile(file.id)?.status).toBe('complete');
    expect(getFile(file.id)?.convertedSize).toBeGreaterThan(0);

    // Waiting comes first and complete last; converting appears in between.
    expect(seen[0]).toBe('waiting');
    expect(seen.at(-1)).toBe('complete');
    expect(seen).toContain('converting');

    const finished = getJob(job.id);
    expect(finished?.status).toBe('complete');
    expect(finished?.finishedCount).toBe(1);
  });

  it('marks a job partial when only some files convert', async () => {
    const good = await queueFixture(FIXTURES.wav16, 'Good.wav');
    const bad = await queueFixture(FIXTURES.flac, 'Bad.flac');

    // Remove the source out from under one file so its conversion fails.
    const { rm } = await import('node:fs/promises');
    await rm(bad.uploadPath, { force: true });

    const job = startConversion([good.id, bad.id], DEFAULT_SETTINGS);

    await waitForStatus(good.id, ['complete', 'failed']);
    await waitForStatus(bad.id, ['complete', 'failed']);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(getFile(good.id)?.status).toBe('complete');
    expect(getFile(bad.id)?.status).toBe('failed');
    expect(getFile(bad.id)?.error).toBe('Conversion failed. Check the AirFLAC server logs for details.');
    expect(getJob(job.id)?.status).toBe('partial');
  });

  it('reports progress as a real percentage or not at all', async () => {
    const file = await queueFixture(FIXTURES.wav16, 'Progress.wav');
    const values: (number | null)[] = [];

    const unsubscribe = subscribe((event) => {
      if (event.type === 'file:update' && event.file.id === file.id) {
        values.push(event.file.progress);
      }
    });

    startConversion([file.id], DEFAULT_SETTINGS);
    await waitForStatus(file.id, ['complete', 'failed']);
    unsubscribe();

    for (const value of values) {
      if (value === null) continue;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(values.at(-1)).toBe(100);
  });
});

describe('public file shape', () => {
  it('never exposes filesystem paths to the browser', async () => {
    const file = await queueFixture(FIXTURES.wav16, 'Secret.wav');
    const published = toPublicFile(file) as QueuedFile & Record<string, unknown>;

    expect(published.uploadPath).toBeUndefined();
    expect(published.convertedPath).toBeUndefined();
    expect(published.artworkPath).toBeUndefined();
    expect(published.artworkMimeType).toBeUndefined();

    expect(JSON.stringify(published)).not.toContain(storage.path);
    expect(published.filename).toBe('Secret.wav');
  });
});

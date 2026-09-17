import { stat } from 'node:fs/promises';

import type { ConversionJob, ConversionSettings } from '@airflac/shared';

import { config } from '../config.js';
import { logger } from '../logger.js';
import { ERROR_MESSAGES } from '../utils/errors.js';
import { newId } from '../utils/id.js';
import { canStreamCopy, runConversion } from './ffmpeg.js';
import { isAcceptingWork } from './lifecycle.js';
import { setFlacPictureTypeToFrontCover } from './metadata.js';
import { addJob, getFile, getJob, updateFile, updateJob } from './queue.js';
import { removeFile, storageFilePath } from './storage.js';

/**
 * Starts converting the given files and returns immediately.
 *
 * Metadata and artwork edits have already been applied to the queue records by
 * the convert route, so this only needs the file ids and the shared settings.
 */
export function startConversion(fileIds: string[], settings: ConversionSettings): ConversionJob {
  const job: ConversionJob = {
    id: newId(),
    fileIds,
    status: 'pending',
    settings,
    createdAt: Date.now(),
    finishedCount: 0,
    totalCount: fileIds.length,
  };
  addJob(job);

  for (const fileId of fileIds) {
    updateFile(fileId, { status: 'waiting', jobId: job.id, progress: null, error: null });
  }

  void processJob(job.id).catch((error: unknown) => {
    logger.error('conversion job failed unexpectedly', {
      jobId: job.id,
      message: error instanceof Error ? error.message : String(error),
    });
    updateJob(job.id, { status: 'failed' });
  });

  return job;
}

async function processJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  updateJob(jobId, { status: 'converting' });
  logger.info('conversion job started', {
    jobId,
    files: job.totalCount,
    compressionLevel: job.settings.compressionLevel,
    sampleRate: String(job.settings.sampleRate),
    bitDepth: String(job.settings.bitDepth),
  });

  const pending = [...job.fileIds];
  const workerCount = Math.min(config().maxConcurrentConversions, pending.length);

  const worker = async (): Promise<void> => {
    for (;;) {
      const fileId = pending.shift();
      if (fileId === undefined) return;
      await convertOne(fileId, job.settings, jobId);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));

  const finished = getJob(jobId);
  if (!finished) return;

  const statuses = finished.fileIds.map((id) => getFile(id)?.status);
  const completed = statuses.filter((status) => status === 'complete').length;
  const failed = statuses.filter((status) => status === 'failed').length;

  const status: ConversionJob['status'] =
    failed === 0 ? 'complete' : completed === 0 ? 'failed' : 'partial';

  updateJob(jobId, { status });
  logger.info('conversion job finished', { jobId, completed, failed, status });
}

async function convertOne(
  fileId: string,
  settings: ConversionSettings,
  jobId: string,
): Promise<void> {
  const file = getFile(fileId);
  if (!file || !file.tech) return;

  if (!isAcceptingWork()) {
    updateFile(fileId, { status: 'failed', error: ERROR_MESSAGES.serverShuttingDown });
    bumpFinished(jobId);
    return;
  }

  const outputPath = storageFilePath('converted', fileId, '.flac');
  const streamCopy = canStreamCopy(settings, file.tech);

  updateFile(fileId, { status: 'converting', progress: 0 });
  logger.info('conversion started', {
    fileId,
    jobId,
    codec: file.tech.codec,
    streamCopy,
    bytes: file.originalSize,
  });

  const startedAt = Date.now();
  const result = await runConversion(
    {
      inputPath: file.uploadPath,
      outputPath,
      artworkPath: file.artworkPath,
      metadata: file.metadata,
      settings,
      sourceTech: file.tech,
    },
    (percent) => {
      updateFile(fileId, { progress: percent, status: 'converting' });
    },
  );

  if (!result.ok) {
    await removeFile(outputPath);
    logger.error('conversion failed', {
      fileId,
      jobId,
      stderr: result.stderr.trim().split('\n').slice(-3).join(' | ').slice(0, 500),
    });
    updateFile(fileId, {
      status: 'failed',
      progress: null,
      error: ERROR_MESSAGES.conversionFailed,
    });
    bumpFinished(jobId);
    return;
  }

  updateFile(fileId, { status: 'finalizing', progress: 100 });

  try {
    if (file.artworkPath) {
      await setFlacPictureTypeToFrontCover(outputPath);
    }
    const { size } = await stat(outputPath);

    updateFile(fileId, {
      status: 'complete',
      convertedPath: outputPath,
      convertedSize: size,
      progress: 100,
      error: null,
    });

    logger.info('conversion complete', {
      fileId,
      jobId,
      originalBytes: file.originalSize,
      flacBytes: size,
      streamCopy,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error('conversion finalization failed', {
      fileId,
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
    await removeFile(outputPath);
    updateFile(fileId, {
      status: 'failed',
      progress: null,
      error: ERROR_MESSAGES.conversionFailed,
    });
  }

  bumpFinished(jobId);
}

function bumpFinished(jobId: string): void {
  const job = getJob(jobId);
  if (!job) return;
  updateJob(jobId, { finishedCount: Math.min(job.finishedCount + 1, job.totalCount) });
}

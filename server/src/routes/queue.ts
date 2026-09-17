import type { QueueSnapshot } from '@airflac/shared';
import type { Request, Response } from 'express';

import { logger } from '../logger.js';
import { clearQueue, getFile, snapshot } from '../services/queue.js';
import { removeFile, storageFilePath } from '../services/storage.js';
import { isValidId } from '../utils/id.js';
import { ERROR_MESSAGES, UserFacingError } from '../utils/errors.js';

export function queueHandler(_req: Request, res: Response): void {
  const body: QueueSnapshot = snapshot();
  res.json(body);
}

/**
 * Clears the shared queue and deletes the files behind it, rather than waiting
 * for the retention sweep.
 */
export async function clearQueueHandler(_req: Request, res: Response): Promise<void> {
  const removed = clearQueue();

  for (const file of removed.files) {
    await removeFile(file.uploadPath);
    await removeFile(file.convertedPath);
    await removeFile(file.artworkPath);
  }
  for (const job of removed.jobs) {
    await removeFile(storageFilePath('archives', job.id, '.zip'));
  }

  logger.info('queue cleared', { files: removed.files.length, jobs: removed.jobs.length });
  res.status(204).end();
}

/** Serves the cover image AirFLAC read out of a source file, for the preview in the editor. */
export function artworkHandler(req: Request, res: Response): void {
  const fileId = req.params.fileId;
  if (!isValidId(fileId)) {
    throw new UserFacingError(ERROR_MESSAGES.notFound, 404);
  }

  const file = getFile(fileId);
  if (!file?.artworkPath || !file.artworkMimeType) {
    throw new UserFacingError(ERROR_MESSAGES.notFound, 404);
  }

  res.type(file.artworkMimeType);
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(file.artworkPath);
}

import type { Request, Response } from 'express';

import { buildJobArchive } from '../services/archive.js';
import { getFile, getJob } from '../services/queue.js';
import { ERROR_MESSAGES, UserFacingError } from '../utils/errors.js';
import { isValidId } from '../utils/id.js';

/**
 * Sends a converted file under the name the user uploaded it as.
 *
 * The response never reveals the internal id or the path on disk.
 */
export function downloadFileHandler(req: Request, res: Response): void {
  const fileId = req.params.fileId;
  if (!isValidId(fileId)) {
    throw new UserFacingError(ERROR_MESSAGES.notFound, 404);
  }

  const file = getFile(fileId);
  if (!file || file.status !== 'complete' || !file.convertedPath) {
    throw new UserFacingError(ERROR_MESSAGES.notFound, 404);
  }

  res.download(file.convertedPath, file.outputFilename);
}

export async function downloadJobHandler(req: Request, res: Response): Promise<void> {
  const jobId = req.params.jobId;
  if (!isValidId(jobId)) {
    throw new UserFacingError(ERROR_MESSAGES.notFound, 404);
  }

  const job = getJob(jobId);
  if (!job) {
    throw new UserFacingError(ERROR_MESSAGES.notFound, 404);
  }

  const archivePath = await buildJobArchive(jobId, job.fileIds);
  if (!archivePath) {
    throw new UserFacingError('There are no completed files in this batch to download.', 409);
  }

  res.download(archivePath, 'airflac-batch.zip');
}

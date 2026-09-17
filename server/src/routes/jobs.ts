import type { Request, Response } from 'express';

import { logger } from '../logger.js';
import { deleteFile, deleteJob, getFile, getJob, toPublicFile } from '../services/queue.js';
import { removeFile, storageFilePath } from '../services/storage.js';
import { ERROR_MESSAGES, UserFacingError } from '../utils/errors.js';
import { isValidId } from '../utils/id.js';

function requireJobId(raw: unknown): string {
  if (!isValidId(raw)) {
    throw new UserFacingError(ERROR_MESSAGES.notFound, 404);
  }
  return raw;
}

export function getJobHandler(req: Request, res: Response): void {
  const jobId = requireJobId(req.params.jobId);

  const job = getJob(jobId);
  if (!job) {
    throw new UserFacingError(ERROR_MESSAGES.notFound, 404);
  }

  const files = job.fileIds
    .map((id) => getFile(id))
    .filter((file) => file !== undefined)
    .map(toPublicFile);

  res.json({ job, files });
}

/** Removes a job, the files it produced and its archive. */
export async function deleteJobHandler(req: Request, res: Response): Promise<void> {
  const jobId = requireJobId(req.params.jobId);

  const job = getJob(jobId);
  if (!job) {
    throw new UserFacingError(ERROR_MESSAGES.notFound, 404);
  }

  for (const fileId of job.fileIds) {
    const file = deleteFile(fileId);
    if (!file) continue;
    await removeFile(file.uploadPath);
    await removeFile(file.convertedPath);
    await removeFile(file.artworkPath);
  }

  await removeFile(storageFilePath('archives', jobId, '.zip'));
  deleteJob(jobId);

  logger.info('job removed', { jobId, files: job.fileIds.length });
  res.status(204).end();
}

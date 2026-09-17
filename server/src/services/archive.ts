import { createWriteStream } from 'node:fs';
import { access } from 'node:fs/promises';

import { type ArchiverError, ZipArchive } from 'archiver';

import { logger } from '../logger.js';
import { getFile } from './queue.js';
import { storageFilePath } from './storage.js';
import { deduplicateFilename } from '../utils/sanitizeFilename.js';

/**
 * Builds (or reuses) the ZIP holding a job's converted files.
 *
 * Entries are named after the user's original filenames with a .flac extension;
 * the internal ids never appear. FLAC is already compressed, so the archive is
 * stored rather than deflated.
 */
export async function buildJobArchive(jobId: string, fileIds: string[]): Promise<string | null> {
  const archivePath = storageFilePath('archives', jobId, '.zip');

  try {
    await access(archivePath);
    return archivePath;
  } catch {
    // Not built yet.
  }

  const completed = fileIds
    .map((id) => getFile(id))
    .filter((file) => file?.status === 'complete' && file.convertedPath);

  if (completed.length === 0) return null;

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(archivePath);
    const archive = new ZipArchive({ zlib: { level: 0 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (warning: ArchiverError) => {
      logger.warn('archive warning', { jobId, message: warning.message });
    });

    archive.pipe(output);

    const usedNames = new Set<string>();
    for (const file of completed) {
      if (!file?.convertedPath) continue;
      archive.file(file.convertedPath, { name: deduplicateFilename(file.outputFilename, usedNames) });
    }

    void archive.finalize();
  });

  logger.info('archive built', { jobId, files: completed.length });
  return archivePath;
}

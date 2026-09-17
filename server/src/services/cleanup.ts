import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config.js';
import { logger } from '../logger.js';
import { deleteFile, listFiles } from './queue.js';
import { storageDir, STORAGE_AREAS } from './storage.js';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

/**
 * Deletes uploads, converted files and archives past the retention window, and
 * drops the queue entries that referred to them.
 *
 * The filesystem is the authority here: job state is in memory only, so a
 * restart leaves files behind that this sweep is responsible for collecting.
 */
export async function sweepExpiredFiles(): Promise<{ removedFiles: number; removedEntries: number }> {
  const retentionMs = config().retentionHours * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;

  let removedFiles = 0;

  for (const area of STORAGE_AREAS) {
    const directory = storageDir(area);

    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry === '.gitkeep') continue;

      const path = join(directory, entry);
      try {
        const stats = await stat(path);
        if (!stats.isFile() || stats.mtimeMs >= cutoff) continue;

        await unlink(path);
        removedFiles += 1;
      } catch {
        // The file was removed by something else, or is not readable. Either way
        // there is nothing to do for it.
      }
    }
  }

  let removedEntries = 0;
  for (const file of listFiles()) {
    if (file.createdAt >= cutoff) continue;
    deleteFile(file.id);
    removedEntries += 1;
  }

  if (removedFiles > 0 || removedEntries > 0) {
    logger.info('cleanup sweep removed expired data', { removedFiles, removedEntries });
  }

  return { removedFiles, removedEntries };
}

export function startCleanupScheduler(): void {
  if (timer) return;

  timer = setInterval(() => {
    void sweepExpiredFiles().catch((error: unknown) => {
      logger.error('cleanup sweep failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, SWEEP_INTERVAL_MS);

  timer.unref();
}

export function stopCleanupScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

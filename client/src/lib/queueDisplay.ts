import type { FileStatus, QueuedFile } from '@airflac/shared';

import { compareSizes } from './format.js';

export const STATUS_LABELS: Record<FileStatus, string> = {
  uploading: 'Uploading',
  inspecting: 'Inspecting',
  ready: 'Ready',
  waiting: 'Waiting',
  converting: 'Converting',
  finalizing: 'Finalizing',
  complete: 'Complete',
  failed: 'Failed',
};

export const IN_PROGRESS_STATUSES: ReadonlySet<FileStatus> = new Set(['converting', 'finalizing']);

function comparison(file: QueuedFile) {
  if (file.status !== 'complete' || file.convertedSize === null) return null;
  return compareSizes(file.originalSize, file.convertedSize);
}

export function sizeSummary(file: QueuedFile): string | null {
  return comparison(file)?.text ?? null;
}

/** True when the FLAC came out bigger, which is normal for a lossy source. */
export function sizeGrew(file: QueuedFile): boolean {
  return comparison(file)?.larger ?? false;
}

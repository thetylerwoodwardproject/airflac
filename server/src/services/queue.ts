import type { ConversionJob, QueuedFile, ServerEvent } from '@airflac/shared';

/**
 * A queued file as the server knows it.
 *
 * The path fields never leave this process: routes return toPublicFile() output so
 * the browser only ever sees opaque ids and the original display filename.
 */
export interface InternalFile extends QueuedFile {
  uploadPath: string;
  convertedPath: string | null;
  artworkPath: string | null;
  artworkMimeType: string | null;
}

/**
 * The queue is shared: every browser pointed at this server sees the same files.
 * State lives in memory only, and the retention sweep in cleanup.ts treats the
 * storage directory as the real source of truth.
 */
const files = new Map<string, InternalFile>();
const jobs = new Map<string, ConversionJob>();
const listeners = new Set<(event: ServerEvent) => void>();

export function toPublicFile(file: InternalFile): QueuedFile {
  const { uploadPath, convertedPath, artworkPath, artworkMimeType, ...publicFields } = file;
  return publicFields;
}

export function subscribe(listener: (event: ServerEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: ServerEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscriberCount(): number {
  return listeners.size;
}

export function addFile(file: InternalFile): void {
  files.set(file.id, file);
  emit({ type: 'file:update', file: toPublicFile(file) });
}

export function getFile(id: string): InternalFile | undefined {
  return files.get(id);
}

export function listFiles(): InternalFile[] {
  return [...files.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export function updateFile(id: string, patch: Partial<InternalFile>): InternalFile | undefined {
  const existing = files.get(id);
  if (!existing) return undefined;

  const updated = { ...existing, ...patch };
  files.set(id, updated);
  emit({ type: 'file:update', file: toPublicFile(updated) });
  return updated;
}

export function deleteFile(id: string): InternalFile | undefined {
  const existing = files.get(id);
  if (!existing) return undefined;

  files.delete(id);
  emit({ type: 'file:remove', fileId: id });
  return existing;
}

export function addJob(job: ConversionJob): void {
  jobs.set(job.id, job);
  emit({ type: 'job:update', job });
}

export function getJob(id: string): ConversionJob | undefined {
  return jobs.get(id);
}

export function listJobs(): ConversionJob[] {
  return [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export function updateJob(id: string, patch: Partial<ConversionJob>): ConversionJob | undefined {
  const existing = jobs.get(id);
  if (!existing) return undefined;

  const updated = { ...existing, ...patch };
  jobs.set(id, updated);
  emit({ type: 'job:update', job: updated });
  return updated;
}

export function deleteJob(id: string): ConversionJob | undefined {
  const existing = jobs.get(id);
  if (!existing) return undefined;
  jobs.delete(id);
  return existing;
}

/** Empties the queue. Returns the removed records so the caller can delete their files. */
export function clearQueue(): { files: InternalFile[]; jobs: ConversionJob[] } {
  const removedFiles = [...files.values()];
  const removedJobs = [...jobs.values()];
  files.clear();
  jobs.clear();
  emit({ type: 'queue:cleared' });
  return { files: removedFiles, jobs: removedJobs };
}

export function snapshot(): { files: QueuedFile[]; jobs: ConversionJob[] } {
  return { files: listFiles().map(toPublicFile), jobs: listJobs() };
}

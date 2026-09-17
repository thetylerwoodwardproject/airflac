import { constants } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config.js';
import { isValidId } from '../utils/id.js';

export type StorageArea = 'uploads' | 'converted' | 'archives';

export const STORAGE_AREAS: readonly StorageArea[] = ['uploads', 'converted', 'archives'];

export function storageDir(area: StorageArea): string {
  return join(config().storagePath, area);
}

/**
 * Builds an absolute path for an internal file.
 *
 * Both parts are constrained: the id must be a UUID we generated and the suffix
 * comes from a fixed set of internal constants, so no caller can walk out of the
 * storage directory even if an identifier reaches here straight from a request.
 */
export function storageFilePath(area: StorageArea, id: string, suffix = ''): string {
  if (!isValidId(id)) {
    throw new Error(`refusing to build a storage path for an invalid id`);
  }
  if (!/^[.a-z0-9]*$/.test(suffix)) {
    throw new Error(`refusing to build a storage path for suffix "${suffix}"`);
  }
  return join(storageDir(area), `${id}${suffix}`);
}

export async function ensureStorageDirs(): Promise<void> {
  for (const area of STORAGE_AREAS) {
    await mkdir(storageDir(area), { recursive: true });
  }
}

export async function isWritable(directory: string): Promise<boolean> {
  try {
    await access(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Deletes a file if it exists, never throwing when it is already gone. */
export async function removeFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await rm(path, { force: true });
}

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resetConfig } from '../src/config.js';
import { ensureStorageDirs } from '../src/services/storage.js';

export interface TestStorage {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Points AirFLAC at a throwaway storage directory.
 *
 * Config is cached after first read, so it is reset here to pick up the new
 * environment before any service touches the filesystem.
 */
export async function useTemporaryStorage(
  overrides: Record<string, string> = {},
): Promise<TestStorage> {
  const path = await mkdtemp(join(tmpdir(), 'airflac-test-'));

  process.env.AIRFLAC_STORAGE_PATH = path;
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;

  resetConfig();
  await ensureStorageDirs();

  return {
    path,
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
      delete process.env.AIRFLAC_STORAGE_PATH;
      for (const key of Object.keys(overrides)) delete process.env[key];
      resetConfig();
    },
  };
}

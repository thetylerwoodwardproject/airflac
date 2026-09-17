import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { storageDir, storageFilePath } from '../src/services/storage.js';
import { newId } from '../src/utils/id.js';
import { useTemporaryStorage, type TestStorage } from './helpers.js';

let storage: TestStorage;

beforeEach(async () => {
  storage = await useTemporaryStorage();
});

afterEach(async () => {
  await storage.cleanup();
});

describe('storage paths', () => {
  it('builds a path inside the configured storage directory', () => {
    const id = newId();
    const path = storageFilePath('uploads', id);

    expect(path.startsWith(storageDir('uploads'))).toBe(true);
    expect(path.endsWith(id)).toBe(true);
  });

  it('refuses any identifier that is not one we generated', () => {
    for (const hostile of [
      '../../../etc/passwd',
      '..',
      '/etc/passwd',
      'not-a-uuid',
      '',
      '../config',
      'a'.repeat(36),
    ]) {
      expect(() => storageFilePath('uploads', hostile)).toThrow();
    }
  });

  it('refuses a suffix that could escape the directory', () => {
    const id = newId();

    expect(() => storageFilePath('uploads', id, '/../../etc/passwd')).toThrow();
    expect(() => storageFilePath('uploads', id, '../escape')).toThrow();
  });

  it('accepts the internal suffixes AirFLAC uses', () => {
    const id = newId();

    expect(storageFilePath('converted', id, '.flac')).toContain(`${id}.flac`);
    expect(storageFilePath('uploads', id, '.art')).toContain(`${id}.art`);
    expect(storageFilePath('archives', id, '.zip')).toContain(`${id}.zip`);
  });
});

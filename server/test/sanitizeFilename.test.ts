import { describe, expect, it } from 'vitest';

import {
  deduplicateFilename,
  replaceExtension,
  sanitizeFilename,
} from '../src/utils/sanitizeFilename.js';

describe('sanitizeFilename', () => {
  it('keeps an ordinary broadcast filename intact', () => {
    expect(sanitizeFilename('Morning Promo Final.wav')).toBe('Morning Promo Final.wav');
  });

  it('keeps non-ASCII characters', () => {
    expect(sanitizeFilename('Señal Matutina.wav')).toBe('Señal Matutina.wav');
  });

  it('strips directory components', () => {
    expect(sanitizeFilename('/etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Windows\\system32\\config.sys')).toBe('config.sys');
  });

  it('defuses traversal sequences', () => {
    for (const hostile of [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\win.ini',
      '....//....//etc/shadow',
      '/../../root/.ssh/id_rsa',
    ]) {
      const safe = sanitizeFilename(hostile);
      expect(safe).not.toContain('/');
      expect(safe).not.toContain('\\');
      expect(safe.startsWith('.')).toBe(false);
    }
  });

  it('removes control characters, including newlines', () => {
    const safe = sanitizeFilename('promo\n\r\u0000name.wav');
    expect(safe).toBe('promoname.wav');
  });

  it('falls back when nothing usable is left', () => {
    expect(sanitizeFilename('...')).toBe('audio');
    expect(sanitizeFilename('')).toBe('audio');
    expect(sanitizeFilename('   ')).toBe('audio');
    expect(sanitizeFilename('/')).toBe('audio');
  });

  it('caps the length while keeping an extension', () => {
    const safe = sanitizeFilename(`${'a'.repeat(400)}.wav`);
    expect(safe.length).toBeLessThanOrEqual(180);
    expect(safe.endsWith('.wav')).toBe(true);
  });
});

describe('replaceExtension', () => {
  it('swaps the extension for the download name', () => {
    expect(replaceExtension('Station Promo Final.wav', 'flac')).toBe('Station Promo Final.flac');
    expect(replaceExtension('bumper.m4a', 'flac')).toBe('bumper.flac');
  });

  it('appends when there is no extension', () => {
    expect(replaceExtension('promo', 'flac')).toBe('promo.flac');
  });

  it('leaves dots inside the name alone', () => {
    expect(replaceExtension('Show 12.5 Intro.wav', 'flac')).toBe('Show 12.5 Intro.flac');
  });
});

describe('deduplicateFilename', () => {
  it('resolves collisions within a batch', () => {
    const taken = new Set<string>();

    expect(deduplicateFilename('Promo.flac', taken)).toBe('Promo.flac');
    expect(deduplicateFilename('Promo.flac', taken)).toBe('Promo (2).flac');
    expect(deduplicateFilename('Promo.flac', taken)).toBe('Promo (3).flac');
    expect(deduplicateFilename('Other.flac', taken)).toBe('Other.flac');
  });
});

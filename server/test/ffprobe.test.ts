import { describe, expect, it } from 'vitest';

import { probeFile } from '../src/services/ffprobe.js';
import { UserFacingError } from '../src/utils/errors.js';
import { FIXTURES } from './fixtures/generateFixtures.js';

describe('codec detection', () => {
  it('reports WAV as lossless PCM with a bit depth', async () => {
    const { tech } = await probeFile(FIXTURES.wav16);

    expect(tech.codec).toBe('pcm_s16le');
    expect(tech.codecLabel).toBe('PCM');
    expect(tech.lossless).toBe(true);
    expect(tech.sampleRate).toBe(44100);
    expect(tech.bitDepth).toBe(16);
    expect(tech.channels).toBe(2);
  });

  it('reads a 24-bit WAV at its real depth and rate', async () => {
    const { tech } = await probeFile(FIXTURES.wav24);

    expect(tech.bitDepth).toBe(24);
    expect(tech.sampleRate).toBe(48000);
    expect(tech.lossless).toBe(true);
  });

  it('reports FLAC as lossless', async () => {
    const { tech } = await probeFile(FIXTURES.flac);

    expect(tech.codec).toBe('flac');
    expect(tech.codecLabel).toBe('FLAC');
    expect(tech.lossless).toBe(true);
  });

  it('reports MP3 as lossy', async () => {
    const { tech } = await probeFile(FIXTURES.mp3);

    expect(tech.codec).toBe('mp3');
    expect(tech.codecLabel).toBe('MP3');
    expect(tech.lossless).toBe(false);
  });

  it('reports AAC as lossy', async () => {
    const { tech } = await probeFile(FIXTURES.aac);

    expect(tech.codec).toBe('aac');
    expect(tech.codecLabel).toBe('AAC');
    expect(tech.lossless).toBe(false);
  });

  it('reports Vorbis as lossy', async () => {
    const { tech } = await probeFile(FIXTURES.vorbis);

    expect(tech.codec).toBe('vorbis');
    expect(tech.lossless).toBe(false);
  });

  /**
   * The case the whole design turns on: both files are .m4a, so only the codec
   * inside distinguishes them.
   */
  it('reports ALAC in an .m4a as lossless while AAC in an .m4a is lossy', async () => {
    const alac = await probeFile(FIXTURES.alac);
    const aac = await probeFile(FIXTURES.aac);

    expect(FIXTURES.alac.endsWith('.m4a')).toBe(true);
    expect(FIXTURES.aac.endsWith('.m4a')).toBe(true);

    expect(alac.tech.codec).toBe('alac');
    expect(alac.tech.lossless).toBe(true);

    expect(aac.tech.codec).toBe('aac');
    expect(aac.tech.lossless).toBe(false);
  });
});

describe('metadata extraction', () => {
  it('reads title, artist and album from a tagged file', async () => {
    const { metadata } = await probeFile(FIXTURES.flac);

    expect(metadata).toEqual({
      title: 'Test Tone',
      artist: 'Test Artist',
      album: 'Test Album',
    });
  });

  it('reads tags regardless of the container they are stored in', async () => {
    for (const fixture of [FIXTURES.mp3, FIXTURES.aac, FIXTURES.wav16]) {
      const { metadata } = await probeFile(fixture);
      expect(metadata.title).toBe('Test Tone');
    }
  });

  it('detects embedded album art', async () => {
    const withArt = await probeFile(FIXTURES.flacWithArt);
    const withoutArt = await probeFile(FIXTURES.flac);

    expect(withArt.artwork?.mimeType).toBe('image/png');
    expect(withArt.artwork?.width).toBe(200);
    expect(withoutArt.artwork).toBeNull();
  });
});

describe('malformed input', () => {
  it('rejects a file that is not audio with a message meant for the user', async () => {
    await expect(probeFile(FIXTURES.notAudio)).rejects.toBeInstanceOf(UserFacingError);
    await expect(probeFile(FIXTURES.notAudio)).rejects.toThrow('FFmpeg could not read this file.');
  });

  it('rejects a path that does not exist without leaking the path', async () => {
    await expect(probeFile('/nonexistent/definitely-not-here.wav')).rejects.toThrow(
      'FFmpeg could not read this file.',
    );
  });

  it('treats an image as having no audio stream', async () => {
    await expect(probeFile(FIXTURES.coverPng)).rejects.toThrow(
      'This file does not contain a supported audio stream.',
    );
  });
});

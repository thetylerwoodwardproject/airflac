import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DEFAULT_SETTINGS, type ConversionSettings, type TechInfo } from '@airflac/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildFfmpegArgs,
  canStreamCopy,
  resolveBitDepth,
  runConversion,
} from '../src/services/ffmpeg.js';
import { probeFile } from '../src/services/ffprobe.js';
import { setFlacPictureTypeToFrontCover } from '../src/services/metadata.js';
import { runCapture } from '../src/utils/process.js';
import { FIXTURES } from './fixtures/generateFixtures.js';
import { useTemporaryStorage, type TestStorage } from './helpers.js';

let storage: TestStorage;

beforeEach(async () => {
  storage = await useTemporaryStorage();
});

afterEach(async () => {
  await storage.cleanup();
});

const wavTech: TechInfo = {
  container: 'wav',
  containerLongName: 'WAV',
  codec: 'pcm_s16le',
  codecLongName: 'PCM signed 16-bit little-endian',
  codecLabel: 'PCM',
  sampleRate: 44100,
  sampleFormat: 's16',
  bitDepth: 16,
  channels: 2,
  channelLayout: 'stereo',
  durationSec: 1,
  bitrate: 1411000,
  lossless: true,
};

const flacTech: TechInfo = { ...wavTech, codec: 'flac', codecLabel: 'FLAC', container: 'flac' };

/** A lossy source reports no bit depth, because it genuinely has none. */
const mp3Tech: TechInfo = {
  ...wavTech,
  codec: 'mp3',
  codecLabel: 'MP3',
  container: 'mp3',
  sampleFormat: 'fltp',
  bitDepth: null,
  lossless: false,
};

const wav24Tech: TechInfo = { ...wavTech, sampleFormat: 's32', bitDepth: 24, sampleRate: 48000 };

function argsFor(settings: ConversionSettings, tech: TechInfo = wavTech): string[] {
  return buildFfmpegArgs({
    inputPath: '/in',
    outputPath: '/out.flac',
    artworkPath: null,
    metadata: { title: 'T', artist: 'A', album: 'B' },
    settings,
    sourceTech: tech,
  });
}

describe('ffmpeg argument building', () => {
  it('does not resample or change depth when both are set to preserve source', () => {
    const args = argsFor(DEFAULT_SETTINGS);

    expect(args).not.toContain('-ar');
    expect(args).not.toContain('-sample_fmt');
    expect(args).not.toContain('-af');
    expect(args).toContain('-compression_level');
    expect(args[args.indexOf('-compression_level') + 1]).toBe('5');
  });

  it('resamples only when a different rate is chosen', () => {
    const args = argsFor({ ...DEFAULT_SETTINGS, sampleRate: 48000 });

    expect(args[args.indexOf('-ar') + 1]).toBe('48000');
    expect(args).toContain('-af');
    expect(args[args.indexOf('-af') + 1]).toBe('aresample=resampler=soxr');
  });

  it('maps bit depth choices to the sample formats FLAC uses', () => {
    expect(argsFor({ ...DEFAULT_SETTINGS, bitDepth: 16 })).toContain('s16');
    expect(argsFor({ ...DEFAULT_SETTINGS, bitDepth: 24 })).toContain('s32');
  });

  it('carries existing metadata across and then applies the edited fields', () => {
    const args = argsFor(DEFAULT_SETTINGS);

    expect(args).toContain('-map_metadata');
    expect(args).toContain('TITLE=T');
    expect(args).toContain('ARTIST=A');
    expect(args).toContain('ALBUM=B');
    // The overrides must come after -map_metadata or they would be overwritten.
    expect(args.indexOf('TITLE=T')).toBeGreaterThan(args.indexOf('-map_metadata'));
  });

  /** AirFLAC is a format converter; it must never quietly process the audio. */
  it('never applies loudness, gain, channel or trimming processing', () => {
    const everySetting: ConversionSettings[] = [
      DEFAULT_SETTINGS,
      { compressionLevel: 12, sampleRate: 96000, bitDepth: 24 },
      { compressionLevel: 0, sampleRate: 44100, bitDepth: 16 },
    ];

    for (const settings of everySetting) {
      const args = argsFor(settings).join(' ');

      for (const forbidden of [
        'loudnorm',
        'dynaudnorm',
        'volume=',
        'acompressor',
        'alimiter',
        'silenceremove',
        'equalizer',
        'pan=',
        '-ac',
      ]) {
        expect(args).not.toContain(forbidden);
      }
    }
  });

  it('passes tag values as single arguments so their contents cannot be parsed as flags', () => {
    const args = buildFfmpegArgs({
      inputPath: '/in',
      outputPath: '/out.flac',
      artworkPath: null,
      metadata: { title: '"; rm -rf / #', artist: '-af loudnorm', album: '$(whoami)' },
      settings: DEFAULT_SETTINGS,
      sourceTech: wavTech,
    });

    expect(args).toContain('TITLE="; rm -rf / #');
    expect(args).toContain('ARTIST=-af loudnorm');
    expect(args).toContain('ALBUM=$(whoami)');
    // The artist value contains "-af" as text but must not become a filter flag.
    expect(args).not.toContain('-af');
  });
});

describe('bit depth resolution', () => {
  it('leaves a lossless source alone when preserving', () => {
    expect(resolveBitDepth('source', wavTech)).toBeNull();
    expect(resolveBitDepth('source', wav24Tech)).toBeNull();
    expect(argsFor(DEFAULT_SETTINGS, wav24Tech)).not.toContain('-sample_fmt');
  });

  it('falls back to 16-bit for a lossy source, which has no depth to preserve', () => {
    expect(resolveBitDepth('source', mp3Tech)).toBe(16);

    const args = argsFor(DEFAULT_SETTINGS, mp3Tech);
    expect(args[args.indexOf('-sample_fmt') + 1]).toBe('s16');
  });

  it('lets an explicit choice override the fallback', () => {
    expect(resolveBitDepth(24, mp3Tech)).toBe(24);
    expect(argsFor({ ...DEFAULT_SETTINGS, bitDepth: 24 }, mp3Tech)).toContain('s32');
  });

  /**
   * The fallback must never reach a lossless source: truncating a master to
   * 16 bits because its depth could not be read would be silent data loss.
   */
  it('preserves a lossless source even when its depth is unknown', () => {
    const unknownDepth: TechInfo = { ...wavTech, bitDepth: null, lossless: true };

    expect(resolveBitDepth('source', unknownDepth)).toBeNull();
    expect(argsFor(DEFAULT_SETTINGS, unknownDepth)).not.toContain('-sample_fmt');
  });
});

describe('stream copy decisions', () => {
  it('copies a FLAC source when only metadata is changing', () => {
    expect(canStreamCopy(DEFAULT_SETTINGS, flacTech)).toBe(true);
    expect(argsFor(DEFAULT_SETTINGS, flacTech)).toContain('copy');
  });

  it('re-encodes a FLAC source when a different rate or depth is requested', () => {
    expect(canStreamCopy({ ...DEFAULT_SETTINGS, sampleRate: 48000 }, flacTech)).toBe(false);
    expect(canStreamCopy({ ...DEFAULT_SETTINGS, bitDepth: 24 }, flacTech)).toBe(false);
  });

  it('never copies a source that is not already FLAC', () => {
    expect(canStreamCopy(DEFAULT_SETTINGS, wavTech)).toBe(false);
    expect(canStreamCopy(DEFAULT_SETTINGS, { ...wavTech, codec: 'mp3', lossless: false })).toBe(false);
  });

  it('treats a rate equal to the source as unchanged', () => {
    expect(canStreamCopy({ ...DEFAULT_SETTINGS, sampleRate: 44100 }, flacTech)).toBe(true);
  });
});

/** Reads the picture type out of a FLAC PICTURE block, or null when there is none. */
async function readPictureType(path: string): Promise<number | null> {
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(path);
  if (buffer.toString('latin1', 0, 4) !== 'fLaC') return null;

  let offset = 4;
  for (;;) {
    const header = buffer[offset]!;
    const isLast = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const length = (buffer[offset + 1]! << 16) | (buffer[offset + 2]! << 8) | buffer[offset + 3]!;

    if (type === 6) return buffer.readUInt32BE(offset + 4);
    if (isLast) return null;
    offset += 4 + length;
  }
}

async function audioStreamChecksum(path: string): Promise<string> {
  const result = await runCapture('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:a', '-f', 'md5', '-']);
  return result.stdout.trim();
}

describe('metadata writing', () => {
  it('writes the edited tags as Vorbis comments', async () => {
    const output = join(storage.path, 'converted', 'tagged.flac');

    const result = await runConversion(
      {
        inputPath: FIXTURES.wav16,
        outputPath: output,
        artworkPath: null,
        metadata: { title: 'Morning Promo', artist: 'KXYZ', album: 'Imaging 2026' },
        settings: DEFAULT_SETTINGS,
        sourceTech: (await probeFile(FIXTURES.wav16)).tech,
      },
      () => {},
    );

    expect(result.ok).toBe(true);

    const { metadata, tech } = await probeFile(output);
    expect(tech.codec).toBe('flac');
    expect(metadata).toEqual({
      title: 'Morning Promo',
      artist: 'KXYZ',
      album: 'Imaging 2026',
    });
  });

  it('embeds album art as a front-cover PICTURE block', async () => {
    const output = join(storage.path, 'converted', 'with-art.flac');
    const artwork = join(storage.path, 'uploads', 'cover.art');
    await copyFile(FIXTURES.coverPng, artwork);

    const result = await runConversion(
      {
        inputPath: FIXTURES.wav16,
        outputPath: output,
        artworkPath: artwork,
        metadata: { title: 'T', artist: 'A', album: 'B' },
        settings: DEFAULT_SETTINGS,
        sourceTech: (await probeFile(FIXTURES.wav16)).tech,
      },
      () => {},
    );
    expect(result.ok).toBe(true);

    await setFlacPictureTypeToFrontCover(output);

    // 3 is "front cover"; ffmpeg writes 0 ("other") on its own.
    expect(await readPictureType(output)).toBe(3);

    const { artwork: embedded } = await probeFile(output);
    expect(embedded?.mimeType).toBe('image/png');
  });

  it('leaves tags absent rather than inventing them when the source has none', async () => {
    const output = join(storage.path, 'converted', 'untagged.flac');

    await runConversion(
      {
        inputPath: FIXTURES.wav24,
        outputPath: output,
        artworkPath: null,
        metadata: { title: '', artist: '', album: '' },
        settings: DEFAULT_SETTINGS,
        sourceTech: (await probeFile(FIXTURES.wav24)).tech,
      },
      () => {},
    );

    const { metadata } = await probeFile(output);
    expect(metadata).toEqual({ title: '', artist: '', album: '' });
  });
});

describe('conversion fidelity', () => {
  it('produces a FLAC whose decoded audio matches the WAV source exactly', async () => {
    const output = join(storage.path, 'converted', 'lossless.flac');

    await runConversion(
      {
        inputPath: FIXTURES.wav16,
        outputPath: output,
        artworkPath: null,
        metadata: { title: '', artist: '', album: '' },
        settings: DEFAULT_SETTINGS,
        sourceTech: (await probeFile(FIXTURES.wav16)).tech,
      },
      () => {},
    );

    expect(await audioStreamChecksum(output)).toBe(await audioStreamChecksum(FIXTURES.wav16));
  });

  it('preserves sample rate and bit depth by default', async () => {
    const output = join(storage.path, 'converted', 'preserved.flac');
    const source = await probeFile(FIXTURES.wav24);

    await runConversion(
      {
        inputPath: FIXTURES.wav24,
        outputPath: output,
        artworkPath: null,
        metadata: { title: '', artist: '', album: '' },
        settings: DEFAULT_SETTINGS,
        sourceTech: source.tech,
      },
      () => {},
    );

    const converted = await probeFile(output);
    expect(converted.tech.sampleRate).toBe(source.tech.sampleRate);
    expect(converted.tech.bitDepth).toBe(source.tech.bitDepth);
    expect(converted.tech.channels).toBe(source.tech.channels);
  });

  it('rewrites a FLAC source without touching its audio', async () => {
    const output = join(storage.path, 'converted', 'copied.flac');

    await runConversion(
      {
        inputPath: FIXTURES.flac,
        outputPath: output,
        artworkPath: null,
        metadata: { title: 'New Title', artist: 'New Artist', album: 'New Album' },
        settings: DEFAULT_SETTINGS,
        sourceTech: (await probeFile(FIXTURES.flac)).tech,
      },
      () => {},
    );

    expect(await audioStreamChecksum(output)).toBe(await audioStreamChecksum(FIXTURES.flac));
    expect((await probeFile(output)).metadata.title).toBe('New Title');
  });

  it('writes a 16-bit FLAC from an MP3 rather than an inflated 24-bit one', async () => {
    const output = join(storage.path, 'converted', 'from-mp3.flac');
    const source = await probeFile(FIXTURES.mp3);

    expect(source.tech.lossless).toBe(false);
    expect(source.tech.bitDepth).toBeNull();

    await runConversion(
      {
        inputPath: FIXTURES.mp3,
        outputPath: output,
        artworkPath: null,
        metadata: { title: '', artist: '', album: '' },
        settings: DEFAULT_SETTINGS,
        sourceTech: source.tech,
      },
      () => {},
    );

    const converted = await probeFile(output);
    expect(converted.tech.bitDepth).toBe(16);
    expect(converted.tech.sampleRate).toBe(source.tech.sampleRate);
  });

  it('still writes 24-bit when the user asks for it from a lossy source', async () => {
    const output = join(storage.path, 'converted', 'from-mp3-24.flac');

    await runConversion(
      {
        inputPath: FIXTURES.mp3,
        outputPath: output,
        artworkPath: null,
        metadata: { title: '', artist: '', album: '' },
        settings: { ...DEFAULT_SETTINGS, bitDepth: 24 },
        sourceTech: (await probeFile(FIXTURES.mp3)).tech,
      },
      () => {},
    );

    expect((await probeFile(output)).tech.bitDepth).toBe(24);
  });

  it('reports a failure instead of throwing when the input is unreadable', async () => {
    const result = await runConversion(
      {
        inputPath: FIXTURES.notAudio,
        outputPath: join(storage.path, 'converted', 'nope.flac'),
        artworkPath: null,
        metadata: { title: '', artist: '', album: '' },
        settings: DEFAULT_SETTINGS,
        sourceTech: wavTech,
      },
      () => {},
    );

    expect(result.ok).toBe(false);
  });
});

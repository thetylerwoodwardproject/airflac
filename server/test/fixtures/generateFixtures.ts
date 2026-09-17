import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'generated');

export const FIXTURES = {
  wav16: join(FIXTURE_DIR, 'tone-16bit.wav'),
  wav24: join(FIXTURE_DIR, 'tone-24bit.wav'),
  flac: join(FIXTURE_DIR, 'tone.flac'),
  flacWithArt: join(FIXTURE_DIR, 'tone-with-art.flac'),
  mp3: join(FIXTURE_DIR, 'tone.mp3'),
  aac: join(FIXTURE_DIR, 'tone-aac.m4a'),
  /** Same container as the AAC fixture, lossless codec inside. */
  alac: join(FIXTURE_DIR, 'tone-alac.m4a'),
  vorbis: join(FIXTURE_DIR, 'tone.ogg'),
  coverPng: join(FIXTURE_DIR, 'cover.png'),
  coverJpg: join(FIXTURE_DIR, 'cover.jpg'),
  notAudio: join(FIXTURE_DIR, 'not-audio.txt'),
} as const;

const TAGS = ['-metadata', 'title=Test Tone', '-metadata', 'artist=Test Artist', '-metadata', 'album=Test Album'];

const SOURCE = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1:sample_rate=44100'];

async function ffmpeg(args: string[]): Promise<void> {
  await run('ffmpeg', ['-v', 'error', '-y', ...args]);
}

/**
 * Builds the small audio files the tests run against.
 *
 * They are generated with ffmpeg rather than committed, so the repository never
 * carries binary audio and every fixture is reproducible.
 */
export async function generateFixtures(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });

  await ffmpeg([...SOURCE, '-c:a', 'pcm_s16le', '-ac', '2', ...TAGS, FIXTURES.wav16]);
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1:sample_rate=48000',
    '-c:a',
    'pcm_s24le',
    '-ac',
    '2',
    FIXTURES.wav24,
  ]);
  await ffmpeg([...SOURCE, '-c:a', 'flac', ...TAGS, FIXTURES.flac]);
  await ffmpeg([...SOURCE, '-c:a', 'libmp3lame', '-b:a', '128k', ...TAGS, FIXTURES.mp3]);
  await ffmpeg([...SOURCE, '-c:a', 'aac', '-b:a', '128k', ...TAGS, FIXTURES.aac]);
  await ffmpeg([...SOURCE, '-c:a', 'alac', ...TAGS, FIXTURES.alac]);
  await ffmpeg([...SOURCE, '-c:a', 'libvorbis', ...TAGS, FIXTURES.vorbis]);

  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'color=c=#2f6f5e:s=200x200',
    '-frames:v',
    '1',
    FIXTURES.coverPng,
  ]);
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'color=c=#2f6f5e:s=200x200',
    '-frames:v',
    '1',
    FIXTURES.coverJpg,
  ]);

  await ffmpeg([
    ...SOURCE,
    '-i',
    FIXTURES.coverPng,
    '-map',
    '0:a',
    '-map',
    '1:v',
    '-c:a',
    'flac',
    '-c:v',
    'copy',
    '-disposition:v:0',
    'attached_pic',
    ...TAGS,
    FIXTURES.flacWithArt,
  ]);

  await writeFile(FIXTURES.notAudio, 'This is not audio. AirFLAC should refuse it.\n');
}

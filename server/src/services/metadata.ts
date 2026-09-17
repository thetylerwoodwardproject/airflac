import { open } from 'node:fs/promises';

import type { Metadata } from '@airflac/shared';

import { logger } from '../logger.js';
import { ERROR_MESSAGES, UserFacingError } from '../utils/errors.js';
import { runCapture } from '../utils/process.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

export interface ImageInfo {
  mimeType: 'image/jpeg' | 'image/png';
  width: number | null;
  height: number | null;
}

/**
 * Identifies an image by its own bytes.
 *
 * The browser-supplied MIME type and the filename are both ignored: the magic
 * number decides, and anything that is not JPEG or PNG is rejected.
 */
export async function identifyImage(path: string): Promise<ImageInfo> {
  const handle = await open(path, 'r');
  let header: Buffer;
  try {
    header = Buffer.alloc(8);
    await handle.read(header, 0, 8, 0);
  } finally {
    await handle.close();
  }

  let mimeType: 'image/jpeg' | 'image/png';
  if (header.subarray(0, 8).equals(PNG_SIGNATURE)) {
    mimeType = 'image/png';
  } else if (header.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    mimeType = 'image/jpeg';
  } else {
    throw new UserFacingError(ERROR_MESSAGES.artworkType, 415);
  }

  const dimensions = await readImageDimensions(path);
  return { mimeType, ...dimensions };
}

async function readImageDimensions(path: string): Promise<{ width: number | null; height: number | null }> {
  const result = await runCapture(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-print_format',
      'json',
      path,
    ],
    { timeoutMs: 15_000 },
  );

  if (result.code !== 0) return { width: null, height: null };

  try {
    const parsed = JSON.parse(result.stdout) as { streams?: { width?: number; height?: number }[] };
    const stream = parsed.streams?.[0];
    return { width: stream?.width ?? null, height: stream?.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}

/**
 * Copies an embedded cover image out of a source file without re-encoding it.
 *
 * Extracting once at upload time means the preview shown in the UI, the "keep
 * existing art" path and the "replace" path all embed from a plain file on disk.
 */
export async function extractArtwork(
  sourcePath: string,
  streamIndex: number,
  destinationPath: string,
): Promise<boolean> {
  const result = await runCapture(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-i',
      sourcePath,
      '-map',
      `0:${streamIndex}`,
      '-c:v',
      'copy',
      '-frames:v',
      '1',
      // Explicit muxer: the destination is an opaque internal id with no extension to infer from.
      '-f',
      'image2',
      destinationPath,
    ],
    { timeoutMs: 60_000 },
  );

  if (result.code !== 0) {
    logger.warn('could not extract embedded artwork', {
      exitCode: result.code,
      stderr: result.stderr.trim().slice(0, 300),
    });
    return false;
  }
  return true;
}

/**
 * Builds the -metadata arguments for the FLAC output.
 *
 * Values are passed as single argv entries, so quotes, newlines and shell
 * metacharacters in a tag are inert.
 */
export function buildTagArgs(metadata: Metadata): string[] {
  return [
    '-metadata',
    `TITLE=${metadata.title}`,
    '-metadata',
    `ARTIST=${metadata.artist}`,
    '-metadata',
    `ALBUM=${metadata.album}`,
  ];
}

const FLAC_MAGIC = 'fLaC';
const PICTURE_BLOCK_TYPE = 6;
const PICTURE_TYPE_FRONT_COVER = 3;

/**
 * Rewrites a FLAC PICTURE block's picture type to "front cover".
 *
 * ffmpeg writes a structurally correct METADATA_BLOCK_PICTURE but types it 0
 * ("Other"); players and automation systems look for type 3. Only the four-byte
 * type field is touched, so the image data is never rewritten.
 */
export async function setFlacPictureTypeToFrontCover(flacPath: string): Promise<void> {
  const handle = await open(flacPath, 'r+');
  try {
    const magic = Buffer.alloc(4);
    await handle.read(magic, 0, 4, 0);
    if (magic.toString('latin1') !== FLAC_MAGIC) return;

    let offset = 4;
    for (;;) {
      const header = Buffer.alloc(4);
      const { bytesRead } = await handle.read(header, 0, 4, offset);
      if (bytesRead < 4) return;

      const isLast = (header[0]! & 0x80) !== 0;
      const blockType = header[0]! & 0x7f;
      const blockLength = (header[1]! << 16) | (header[2]! << 8) | header[3]!;

      if (blockType === PICTURE_BLOCK_TYPE) {
        const pictureType = Buffer.alloc(4);
        pictureType.writeUInt32BE(PICTURE_TYPE_FRONT_COVER, 0);
        await handle.write(pictureType, 0, 4, offset + 4);
        return;
      }

      if (isLast) return;
      offset += 4 + blockLength;
    }
  } finally {
    await handle.close();
  }
}

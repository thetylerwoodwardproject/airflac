import { stat } from 'node:fs/promises';
import { basename } from 'node:path';

import type { ArtworkInfo, ArtworkUploadResponse, Metadata, QueuedFile } from '@airflac/shared';
import type { Request, Response } from 'express';

import { logger } from '../logger.js';
import { extractArtwork, identifyImage } from '../services/metadata.js';
import { probeFile } from '../services/ffprobe.js';
import { isAcceptingWork } from '../services/lifecycle.js';
import { addFile, type InternalFile, toPublicFile, updateFile } from '../services/queue.js';
import { removeFile, storageFilePath } from '../services/storage.js';
import { ERROR_MESSAGES, UserFacingError } from '../utils/errors.js';
import { replaceExtension, sanitizeFilename } from '../utils/sanitizeFilename.js';

const EMPTY_METADATA: Metadata = { title: '', artist: '', album: '' };

async function ingestFile(file: Express.Multer.File): Promise<QueuedFile> {
  const id = file.filename;
  const displayName = sanitizeFilename(file.originalname);

  const record: InternalFile = {
    id,
    filename: displayName,
    outputFilename: replaceExtension(displayName, 'flac'),
    status: 'inspecting',
    tech: null,
    metadata: { ...EMPTY_METADATA },
    sourceMetadata: { ...EMPTY_METADATA },
    artwork: null,
    originalSize: file.size,
    convertedSize: null,
    progress: null,
    error: null,
    jobId: null,
    createdAt: Date.now(),
    uploadPath: file.path,
    convertedPath: null,
    artworkPath: null,
    artworkMimeType: null,
  };
  addFile(record);

  try {
    const probe = await probeFile(record.uploadPath);

    let artwork: ArtworkInfo | null = null;
    let artworkPath: string | null = null;
    let artworkMimeType: string | null = null;

    if (probe.artwork) {
      const destination = storageFilePath('uploads', id, '.art');
      const extracted = await extractArtwork(record.uploadPath, probe.artwork.streamIndex, destination);
      if (extracted) {
        artworkPath = destination;
        artworkMimeType = probe.artwork.mimeType;
        artwork = {
          source: 'source-file',
          mimeType: probe.artwork.mimeType,
          width: probe.artwork.width,
          height: probe.artwork.height,
          byteSize: (await stat(destination)).size,
        };
      }
    }

    const updated = updateFile(id, {
      status: 'ready',
      tech: probe.tech,
      metadata: { ...probe.metadata },
      sourceMetadata: { ...probe.metadata },
      artwork,
      artworkPath,
      artworkMimeType,
    });

    logger.info('file inspected', {
      fileId: id,
      codec: probe.tech.codec,
      lossless: probe.tech.lossless,
      sampleRate: probe.tech.sampleRate,
      channels: probe.tech.channels,
      bytes: file.size,
    });

    return toPublicFile(updated ?? record);
  } catch (error) {
    const message =
      error instanceof UserFacingError ? error.message : ERROR_MESSAGES.unreadableMedia;

    logger.warn('file inspection failed', {
      fileId: id,
      reason: message,
      cause: error instanceof Error && !(error instanceof UserFacingError) ? error.message : undefined,
    });

    // The source is unusable, so there is nothing to convert later.
    await removeFile(record.uploadPath);
    const updated = updateFile(id, { status: 'failed', error: message });
    return toPublicFile(updated ?? record);
  }
}

export async function uploadHandler(req: Request, res: Response): Promise<void> {
  if (!isAcceptingWork()) {
    throw new UserFacingError(ERROR_MESSAGES.serverShuttingDown, 503);
  }

  const uploaded = (req.files ?? []) as Express.Multer.File[];
  if (uploaded.length === 0) {
    throw new UserFacingError(ERROR_MESSAGES.noFiles, 400);
  }

  logger.info('upload received', { fileCount: uploaded.length });

  const files: QueuedFile[] = [];
  for (const file of uploaded) {
    files.push(await ingestFile(file));
  }

  res.status(201).json({ files });
}

export async function artworkUploadHandler(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) {
    throw new UserFacingError('No image was uploaded.', 400);
  }

  try {
    const image = await identifyImage(file.path);
    const artworkId = basename(file.path).replace(/\.art$/, '');

    const artwork: ArtworkInfo = {
      source: 'uploaded',
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      byteSize: file.size,
    };

    const body: ArtworkUploadResponse = { artworkId, artwork };
    res.status(201).json(body);
  } catch (error) {
    await removeFile(file.path);
    throw error;
  }
}

import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';

import { logger } from '../logger.js';
import { ERROR_MESSAGES, UserFacingError } from '../utils/errors.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: ERROR_MESSAGES.notFound });
}

/**
 * Translates anything thrown in a route into a safe JSON response.
 *
 * Only curated messages reach the browser. Stack traces, ffmpeg output and
 * filesystem paths stay in the server log.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof UserFacingError) {
    logger.warn('request rejected', {
      method: req.method,
      path: req.path,
      status: error.status,
      reason: error.message,
      detail: error.detail,
    });
    res.status(error.status).json({ error: error.message });
    return;
  }

  if (error instanceof MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE' ? ERROR_MESSAGES.tooLarge : ERROR_MESSAGES.unexpected;
    logger.warn('upload rejected', { method: req.method, path: req.path, code: error.code });
    res.status(413).json({ error: message });
    return;
  }

  logger.error('unhandled error', {
    method: req.method,
    path: req.path,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
  });
  res.status(500).json({ error: ERROR_MESSAGES.unexpected });
}

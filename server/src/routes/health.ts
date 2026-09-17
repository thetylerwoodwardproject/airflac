import type { HealthResponse } from '@airflac/shared';
import type { Request, Response } from 'express';

import { config } from '../config.js';
import { checkDependencies } from '../services/dependencies.js';

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const dependencies = await checkDependencies();
  const healthy = dependencies.ffmpeg && dependencies.ffprobe;

  const body: HealthResponse = {
    status: healthy ? 'ok' : 'degraded',
    version: config().version,
    ffmpeg: dependencies.ffmpeg,
    ffprobe: dependencies.ffprobe,
  };

  res.status(healthy ? 200 : 503).json(body);
}

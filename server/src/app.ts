import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type Express } from 'express';

import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createApiRouter } from './routes/index.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** The built frontend, served by the same process in production. */
export const clientDistPath = resolve(moduleDir, '../../client/dist');

export function createApp(): Express {
  const app = express();
  const cfg = config();

  app.disable('x-powered-by');
  if (cfg.trustProxy) {
    app.set('trust proxy', true);
  }

  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createApiRouter());

  if (existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath, { index: 'index.html', maxAge: '1h' }));
    // Single-page fallback. /api is handled above, so anything reaching here is a UI route.
    app.use((_req, res) => {
      res.sendFile(join(clientDistPath, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

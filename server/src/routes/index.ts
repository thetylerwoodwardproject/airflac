import { Router } from 'express';

import { artworkUploadMiddleware, audioUploadMiddleware } from '../middleware/upload.js';
import { notFoundHandler } from '../middleware/errorHandler.js';
import { convertHandler } from './convert.js';
import { downloadFileHandler, downloadJobHandler } from './download.js';
import { eventsHandler } from './events.js';
import { healthHandler } from './health.js';
import { deleteJobHandler, getJobHandler } from './jobs.js';
import { artworkHandler, clearQueueHandler, queueHandler } from './queue.js';
import { artworkUploadHandler, uploadHandler } from './upload.js';

export function createApiRouter(): Router {
  const router = Router();

  router.get('/health', healthHandler);

  router.get('/queue', queueHandler);
  router.delete('/queue', clearQueueHandler);
  router.get('/events', eventsHandler);

  router.post('/upload', audioUploadMiddleware(), uploadHandler);
  router.post('/artwork', artworkUploadMiddleware(), artworkUploadHandler);
  router.get('/files/:fileId/artwork', artworkHandler);

  router.post('/convert', convertHandler);
  router.get('/jobs/:jobId', getJobHandler);
  router.delete('/jobs/:jobId', deleteJobHandler);

  router.get('/download/:fileId', downloadFileHandler);
  router.get('/download-job/:jobId', downloadJobHandler);

  router.use(notFoundHandler);
  return router;
}

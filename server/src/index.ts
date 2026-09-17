import type { Server } from 'node:http';

import { createApp } from './app.js';
import { config } from './config.js';
import { logger, setLogLevel } from './logger.js';
import { checkDependencies } from './services/dependencies.js';
import { killAllConversions } from './services/ffmpeg.js';
import { startCleanupScheduler, stopCleanupScheduler, sweepExpiredFiles } from './services/cleanup.js';
import { stopAcceptingWork } from './services/lifecycle.js';
import { closeAllEventStreams } from './routes/events.js';
import { ensureStorageDirs, isWritable, storageDir, STORAGE_AREAS } from './services/storage.js';

const SHUTDOWN_GRACE_MS = 10_000;

async function verifyEnvironment(): Promise<void> {
  const cfg = config();

  await ensureStorageDirs();
  for (const area of STORAGE_AREAS) {
    const directory = storageDir(area);
    if (!(await isWritable(directory))) {
      logger.error('storage directory is not writable', { directory });
      logger.error('AirFLAC cannot run without writable storage. Check AIRFLAC_STORAGE_PATH and its permissions.');
      process.exit(1);
    }
  }
  logger.info('storage ready', { path: cfg.storagePath, retentionHours: cfg.retentionHours });

  const dependencies = await checkDependencies(true);
  logger.info('dependency check', { ffmpeg: dependencies.ffmpeg, ffprobe: dependencies.ffprobe });

  if (!dependencies.ffmpeg || !dependencies.ffprobe) {
    logger.error(
      'FFmpeg and ffprobe are required. Install them with: sudo apt install ffmpeg. AirFLAC will start but cannot inspect or convert audio until they are available.',
    );
  }
}

function installShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('shutdown requested', { signal });
    stopAcceptingWork();
    stopCleanupScheduler();

    // Conversions in flight are stopped straight away; systemd and Docker both
    // expect the process to go down promptly rather than finish a long encode.
    killAllConversions();
    closeAllEventStreams();

    server.close(() => {
      logger.info('shutdown complete');
    });
    server.closeIdleConnections();

    const forceClose = setTimeout(() => {
      logger.warn('shutdown grace period elapsed, closing remaining connections');
      server.closeAllConnections();
    }, SHUTDOWN_GRACE_MS);
    forceClose.unref();

    // The process is left to exit once the event loop drains, rather than being
    // torn down with process.exit(): that would discard buffered log output and
    // an operator reading the journal would never see the shutdown recorded.
    process.exitCode = 0;
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main(): Promise<void> {
  const cfg = config();
  setLogLevel(cfg.logLevel);

  logger.info('AirFLAC starting', { version: cfg.version, node: process.version });

  await verifyEnvironment();
  await sweepExpiredFiles();
  startCleanupScheduler();

  const app = createApp();
  const server = app.listen(cfg.port, cfg.host, () => {
    logger.info('listening', { url: `http://${cfg.host}:${cfg.port}` });
  });

  installShutdownHandlers(server);
}

main().catch((error: unknown) => {
  logger.error('fatal startup error', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

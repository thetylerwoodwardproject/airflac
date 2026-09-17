import type { ServerEvent } from '@airflac/shared';
import type { Request, Response } from 'express';

import { snapshot, subscribe } from '../services/queue.js';

const KEEP_ALIVE_MS = 20_000;

/** Open streams, so shutdown can end them instead of waiting for idle clients. */
const openStreams = new Set<Response>();

/**
 * Streams queue changes to every connected browser.
 *
 * The queue is shared, so there is one stream for the whole server rather than
 * one per job. A full snapshot is sent immediately so a client that connects
 * late is never out of step.
 */
export function eventsHandler(req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Stops nginx from buffering the stream when AirFLAC sits behind a reverse proxy.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: ServerEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const current = snapshot();
  send({ type: 'snapshot', files: current.files, jobs: current.jobs });

  const unsubscribe = subscribe(send);
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), KEEP_ALIVE_MS);
  openStreams.add(res);

  const close = () => {
    clearInterval(keepAlive);
    unsubscribe();
    openStreams.delete(res);
  };

  req.on('close', close);
  res.on('close', close);
}

/**
 * Ends every open stream.
 *
 * These connections are long-lived by design, so without this the HTTP server
 * would stay open until each browser happened to disconnect.
 */
export function closeAllEventStreams(): void {
  for (const stream of openStreams) {
    stream.end();
  }
  openStreams.clear();
}

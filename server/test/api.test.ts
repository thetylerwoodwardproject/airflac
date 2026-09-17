import { readFile } from 'node:fs/promises';

import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { clearQueue } from '../src/services/queue.js';
import { FIXTURES } from './fixtures/generateFixtures.js';
import { useTemporaryStorage, type TestStorage } from './helpers.js';

let storage: TestStorage;
let app: Express;

beforeEach(async () => {
  // A 1 MB cap keeps the oversized-upload test small.
  storage = await useTemporaryStorage({ AIRFLAC_MAX_UPLOAD_MB: '1' });
  clearQueue();
  app = createApp();
});

afterEach(async () => {
  clearQueue();
  await storage.cleanup();
});

describe('GET /api/health', () => {
  it('reports the version and that ffmpeg and ffprobe are present', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', ffmpeg: true, ffprobe: true });
    expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('POST /api/upload', () => {
  it('inspects an uploaded file and returns its technical detail', async () => {
    const response = await request(app)
      .post('/api/upload')
      .attach('files', FIXTURES.wav16, 'Morning Promo.wav');

    expect(response.status).toBe(201);
    expect(response.body.files).toHaveLength(1);

    const file = response.body.files[0];
    expect(file.filename).toBe('Morning Promo.wav');
    expect(file.outputFilename).toBe('Morning Promo.flac');
    expect(file.status).toBe('ready');
    expect(file.tech.lossless).toBe(true);
    expect(file.tech.codecLabel).toBe('PCM');
  });

  it('rejects a file over the configured size limit with a message the user can act on', async () => {
    const oversized = Buffer.alloc(2 * 1024 * 1024, 0);

    const response = await request(app)
      .post('/api/upload')
      .attach('files', oversized, 'huge.wav');

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('The uploaded file exceeds the configured size limit.');
  });

  it('records a file it cannot read as failed rather than rejecting the whole batch', async () => {
    const response = await request(app)
      .post('/api/upload')
      .attach('files', FIXTURES.wav16, 'Good.wav')
      .attach('files', FIXTURES.notAudio, 'notes.txt');

    expect(response.status).toBe(201);
    expect(response.body.files).toHaveLength(2);
    expect(response.body.files[0].status).toBe('ready');
    expect(response.body.files[1].status).toBe('failed');
    expect(response.body.files[1].error).toBe('FFmpeg could not read this file.');
  });

  it('strips directory components from the uploaded filename', async () => {
    const response = await request(app)
      .post('/api/upload')
      .attach('files', FIXTURES.wav16, '../../../etc/passwd.wav');

    const file = response.body.files[0];
    expect(file.filename).not.toContain('/');
    expect(file.filename).not.toContain('..');
    expect(file.filename).toBe('passwd.wav');
  });

  it('refuses an empty upload', async () => {
    const response = await request(app).post('/api/upload');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No files were uploaded.');
  });

  it('never returns a filesystem path', async () => {
    const response = await request(app)
      .post('/api/upload')
      .attach('files', FIXTURES.wav16, 'Promo.wav');

    expect(JSON.stringify(response.body)).not.toContain(storage.path);
    expect(JSON.stringify(response.body)).not.toContain('/uploads/');
  });
});

describe('POST /api/convert validation', () => {
  it('rejects a compression level outside 0-12', async () => {
    for (const level of [-1, 13, 5.5, '5', null]) {
      const response = await request(app)
        .post('/api/convert')
        .send({ settings: { compressionLevel: level, sampleRate: 'source', bitDepth: 'source' }, files: [] });

      expect(response.status).toBe(400);
    }
  });

  it('rejects sample rates and bit depths that are not offered', async () => {
    const badRate = await request(app)
      .post('/api/convert')
      .send({ settings: { compressionLevel: 5, sampleRate: 22050, bitDepth: 'source' }, files: [] });
    expect(badRate.status).toBe(400);

    const badDepth = await request(app)
      .post('/api/convert')
      .send({ settings: { compressionLevel: 5, sampleRate: 'source', bitDepth: 8 }, files: [] });
    expect(badDepth.status).toBe(400);
  });

  it('rejects a file reference that is not an internal id', async () => {
    const response = await request(app)
      .post('/api/convert')
      .send({
        settings: { compressionLevel: 5, sampleRate: 'source', bitDepth: 'source' },
        files: [{ fileId: '../../etc/passwd' }],
      });

    expect(response.status).toBe(400);
  });

  it('does not accept extra ffmpeg arguments smuggled through the request', async () => {
    const upload = await request(app).post('/api/upload').attach('files', FIXTURES.wav16, 'a.wav');
    const fileId = upload.body.files[0].id;

    const response = await request(app)
      .post('/api/convert')
      .send({
        settings: {
          compressionLevel: 5,
          sampleRate: 'source',
          bitDepth: 'source',
          extraArgs: ['-af', 'loudnorm'],
          outputPath: '/etc/passwd',
        },
        files: [{ fileId }],
      });

    // The unknown fields are ignored rather than honoured.
    expect(response.status).toBe(202);
    expect(response.body.settings).toEqual({
      compressionLevel: 5,
      sampleRate: 'source',
      bitDepth: 'source',
    });
  });
});

describe('downloads', () => {
  it('returns a friendly 404 for an unknown file', async () => {
    const response = await request(app).get('/api/download/00000000-0000-0000-0000-000000000000');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('That file is no longer available. It may have been cleared or expired.');
  });

  it('refuses traversal attempts in a download id', async () => {
    for (const id of ['..%2f..%2f..%2fetc%2fpasswd', 'not-a-uuid', '....//etc/passwd']) {
      const response = await request(app).get(`/api/download/${id}`);
      expect(response.status).toBe(404);
      expect(response.text).not.toContain('root:');
    }
  });

  it('serves a converted file under the original display name', async () => {
    const upload = await request(app)
      .post('/api/upload')
      .attach('files', FIXTURES.wav16, 'Station Promo Final.wav');
    const fileId = upload.body.files[0].id;

    await request(app)
      .post('/api/convert')
      .send({
        settings: { compressionLevel: 0, sampleRate: 'source', bitDepth: 'source' },
        files: [{ fileId, metadata: { title: 'Promo' } }],
      });

    // Wait for the conversion to finish.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const queue = await request(app).get('/api/queue');
      if (queue.body.files[0].status === 'complete') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const download = await request(app).get(`/api/download/${fileId}`);

    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('Station Promo Final.flac');
    expect(download.body.subarray(0, 4).toString('latin1')).toBe('fLaC');
  });
});

describe('artwork upload', () => {
  it('accepts a PNG', async () => {
    const response = await request(app)
      .post('/api/artwork')
      .attach('artwork', FIXTURES.coverPng, 'cover.png');

    expect(response.status).toBe(201);
    expect(response.body.artwork.mimeType).toBe('image/png');
    expect(response.body.artworkId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a file that is not really an image, whatever it is called', async () => {
    const notAnImage = await readFile(FIXTURES.notAudio);

    const response = await request(app)
      .post('/api/artwork')
      .attach('artwork', notAnImage, 'cover.png');

    expect(response.status).toBe(415);
    expect(response.body.error).toBe('Album art must be a JPEG or PNG image.');
  });
});

describe('queue', () => {
  it('clears the queue', async () => {
    await request(app).post('/api/upload').attach('files', FIXTURES.wav16, 'a.wav');
    expect((await request(app).get('/api/queue')).body.files).toHaveLength(1);

    const cleared = await request(app).delete('/api/queue');
    expect(cleared.status).toBe(204);
    expect((await request(app).get('/api/queue')).body.files).toHaveLength(0);
  });

  it('returns a friendly 404 for an unknown API route', async () => {
    const response = await request(app).get('/api/nope');
    expect(response.status).toBe(404);
    expect(response.body.error).toBeDefined();
  });
});

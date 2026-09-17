import type {
  ArtworkUploadResponse,
  ConversionJob,
  ConvertRequest,
  HealthResponse,
  QueueSnapshot,
  ServerEvent,
  UploadResponse,
} from '@airflac/shared';

const GENERIC_ERROR = 'AirFLAC could not reach the server.';

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? GENERIC_ERROR;
  } catch {
    return GENERIC_ERROR;
  }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new Error(GENERIC_ERROR);
  }

  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

export function fetchQueue(): Promise<QueueSnapshot> {
  return requestJson<QueueSnapshot>('/api/queue');
}

/**
 * Uploads files.
 *
 * XMLHttpRequest is used rather than fetch because it reports upload progress,
 * which matters when a batch of broadcast masters can run to hundreds of megabytes.
 */
export function uploadFiles(
  files: File[],
  onProgress?: (percent: number | null) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);

    const request = new XMLHttpRequest();
    request.open('POST', '/api/upload');

    request.upload.addEventListener('progress', (event) => {
      if (!onProgress) return;
      onProgress(event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null);
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText) as UploadResponse);
        } catch {
          reject(new Error(GENERIC_ERROR));
        }
        return;
      }

      try {
        const body = JSON.parse(request.responseText) as { error?: string };
        reject(new Error(body.error ?? GENERIC_ERROR));
      } catch {
        reject(new Error(GENERIC_ERROR));
      }
    });

    request.addEventListener('error', () => reject(new Error(GENERIC_ERROR)));
    request.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

    request.send(form);
  });
}

export function uploadArtwork(file: File): Promise<ArtworkUploadResponse> {
  const form = new FormData();
  form.append('artwork', file, file.name);
  return requestJson<ArtworkUploadResponse>('/api/artwork', { method: 'POST', body: form });
}

export function requestConversion(request: ConvertRequest): Promise<ConversionJob> {
  return requestJson<ConversionJob>('/api/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function clearQueue(): Promise<void> {
  const response = await fetch('/api/queue', { method: 'DELETE' });
  if (!response.ok) throw new Error(await readError(response));
}

export const downloadFileUrl = (fileId: string): string => `/api/download/${fileId}`;
export const downloadJobUrl = (jobId: string): string => `/api/download-job/${jobId}`;
export const artworkUrl = (fileId: string): string => `/api/files/${fileId}/artwork`;

/** Subscribes to the shared queue stream. Returns a function that closes it. */
export function connectEvents(
  onEvent: (event: ServerEvent) => void,
  onStatusChange?: (connected: boolean) => void,
): () => void {
  const source = new EventSource('/api/events');

  source.addEventListener('open', () => onStatusChange?.(true));
  source.addEventListener('error', () => onStatusChange?.(false));
  source.addEventListener('message', (event) => {
    try {
      onEvent(JSON.parse(event.data as string) as ServerEvent);
    } catch {
      // A malformed frame is skipped; the next snapshot corrects any drift.
    }
  });

  return () => source.close();
}

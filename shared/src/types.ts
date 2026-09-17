/** Lifecycle of a single file in the shared queue. */
export const FILE_STATUSES = [
  'uploading',
  'inspecting',
  'ready',
  'waiting',
  'converting',
  'finalizing',
  'complete',
  'failed',
] as const;

export type FileStatus = (typeof FILE_STATUSES)[number];

/** Technical detail read from the file itself by ffprobe. Never inferred from the filename. */
export interface TechInfo {
  container: string;
  containerLongName: string;
  codec: string;
  codecLongName: string;
  /** Human-facing codec name, e.g. "MP3", "FLAC", "PCM". */
  codecLabel: string;
  sampleRate: number | null;
  sampleFormat: string | null;
  bitDepth: number | null;
  channels: number | null;
  channelLayout: string | null;
  durationSec: number | null;
  /** Bits per second, where the container or codec reports it. */
  bitrate: number | null;
  lossless: boolean;
}

/** The only metadata fields AirFLAC reads and writes in v1. */
export interface Metadata {
  title: string;
  artist: string;
  album: string;
}

export interface ArtworkInfo {
  /** Where the current artwork came from: the source file, or an upload replacing it. */
  source: 'source-file' | 'uploaded';
  mimeType: string;
  width: number | null;
  height: number | null;
  byteSize: number;
}

export type ArtworkAction =
  | { action: 'keep' }
  | { action: 'remove' }
  | { action: 'replace'; artworkId: string };

export interface QueuedFile {
  id: string;
  /** Original display name as uploaded, e.g. "Morning Promo.wav". Never a filesystem path. */
  filename: string;
  /** Name the converted file is downloaded as, e.g. "Morning Promo.flac". */
  outputFilename: string;
  status: FileStatus;
  tech: TechInfo | null;
  metadata: Metadata;
  /** Metadata as read from the source file, so the UI can show what was changed. */
  sourceMetadata: Metadata;
  artwork: ArtworkInfo | null;
  originalSize: number;
  convertedSize: number | null;
  /** 0-100 when real progress is known, null when it is not. Never estimated. */
  progress: number | null;
  error: string | null;
  jobId: string | null;
  createdAt: number;
}

export const SAMPLE_RATE_CHOICES = ['source', 44100, 48000, 96000] as const;
export type SampleRateChoice = (typeof SAMPLE_RATE_CHOICES)[number];

export const BIT_DEPTH_CHOICES = ['source', 16, 24] as const;
export type BitDepthChoice = (typeof BIT_DEPTH_CHOICES)[number];

export interface ConversionSettings {
  /** 0-12. Affects encoding time and file size, not audio quality. */
  compressionLevel: number;
  sampleRate: SampleRateChoice;
  bitDepth: BitDepthChoice;
}

export interface FileConversionRequest {
  fileId: string;
  metadata?: Partial<Metadata>;
  artwork?: ArtworkAction;
}

export interface ConvertRequest {
  files: FileConversionRequest[];
  settings: ConversionSettings;
}

export type JobStatus = 'pending' | 'converting' | 'complete' | 'partial' | 'failed';

export interface ConversionJob {
  id: string;
  fileIds: string[];
  status: JobStatus;
  settings: ConversionSettings;
  createdAt: number;
  /** Files that reached a terminal state, for "Converting 3 of 8". */
  finishedCount: number;
  totalCount: number;
}

export interface QueueSnapshot {
  files: QueuedFile[];
  jobs: ConversionJob[];
}

export type ServerEvent =
  | { type: 'snapshot'; files: QueuedFile[]; jobs: ConversionJob[] }
  | { type: 'file:update'; file: QueuedFile }
  | { type: 'file:remove'; fileId: string }
  | { type: 'job:update'; job: ConversionJob }
  | { type: 'queue:cleared' };

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  ffmpeg: boolean;
  ffprobe: boolean;
}

export interface UploadResponse {
  files: QueuedFile[];
}

export interface ArtworkUploadResponse {
  artworkId: string;
  artwork: ArtworkInfo;
}

export interface ApiError {
  error: string;
}

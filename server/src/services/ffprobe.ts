import { codecLabel, isLosslessCodec, type Metadata, type TechInfo } from '@airflac/shared';

import { logger } from '../logger.js';
import { ERROR_MESSAGES, UserFacingError } from '../utils/errors.js';
import { runCapture } from '../utils/process.js';

interface FfprobeStream {
  index?: number;
  codec_name?: string;
  codec_long_name?: string;
  codec_type?: string;
  sample_rate?: string;
  sample_fmt?: string;
  bits_per_raw_sample?: string;
  bits_per_sample?: number | string;
  channels?: number;
  channel_layout?: string;
  duration?: string;
  bit_rate?: string;
  disposition?: Record<string, number>;
  tags?: Record<string, string>;
  width?: number;
  height?: number;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: {
    format_name?: string;
    format_long_name?: string;
    duration?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  };
}

export interface SourceArtwork {
  streamIndex: number;
  codec: string;
  mimeType: string;
  width: number | null;
  height: number | null;
}

export interface ProbeResult {
  tech: TechInfo;
  metadata: Metadata;
  artwork: SourceArtwork | null;
}

/** Image codecs we can carry into a FLAC PICTURE block. */
const ARTWORK_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  mjpeg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpeg2000: 'image/jp2',
};

function toNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Tag keys vary in case and location between containers (WAV RIFF INFO, ID3,
 * Vorbis comments, MP4 atoms), so both tag sets are folded into one lower-cased map.
 */
function collectTags(output: FfprobeOutput, audioStream: FfprobeStream): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const source of [output.format?.tags, audioStream.tags]) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (typeof value !== 'string') continue;
      const normalized = key.toLowerCase();
      if (tags[normalized] === undefined || tags[normalized] === '') {
        tags[normalized] = value;
      }
    }
  }
  return tags;
}

function readBitDepth(stream: FfprobeStream): number | null {
  return toNumber(stream.bits_per_raw_sample) ?? toNumber(stream.bits_per_sample);
}

function findArtwork(streams: FfprobeStream[]): SourceArtwork | null {
  for (const stream of streams) {
    if (stream.codec_type !== 'video') continue;
    if (stream.disposition?.['attached_pic'] !== 1) continue;

    const codec = (stream.codec_name ?? '').toLowerCase();
    const mimeType = ARTWORK_MIME_TYPES[codec];
    if (!mimeType) continue;

    return {
      streamIndex: stream.index ?? 0,
      codec,
      mimeType,
      width: stream.width ?? null,
      height: stream.height ?? null,
    };
  }
  return null;
}

/**
 * Inspects a file with ffprobe.
 *
 * Every technical fact AirFLAC reports comes from here, including whether the
 * source is lossless: the extension and the browser-supplied MIME type are never
 * consulted, because a .m4a holds either lossy AAC or lossless ALAC.
 */
export async function probeFile(path: string): Promise<ProbeResult> {
  const result = await runCapture(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
    { timeoutMs: 60_000 },
  );

  if (result.code !== 0 || result.stdout.trim() === '') {
    logger.warn('ffprobe could not inspect a file', {
      exitCode: result.code,
      timedOut: result.timedOut,
      stderr: result.stderr.trim().slice(0, 500),
    });
    throw new UserFacingError(ERROR_MESSAGES.unreadableMedia, 422);
  }

  let output: FfprobeOutput;
  try {
    output = JSON.parse(result.stdout) as FfprobeOutput;
  } catch {
    logger.warn('ffprobe returned output that could not be parsed');
    throw new UserFacingError(ERROR_MESSAGES.unreadableMedia, 422);
  }

  const streams = output.streams ?? [];
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');
  if (!audioStream || !audioStream.codec_name) {
    throw new UserFacingError(ERROR_MESSAGES.noAudioStream, 422);
  }

  const codec = audioStream.codec_name;
  const tags = collectTags(output, audioStream);

  const tech: TechInfo = {
    container: output.format?.format_name ?? 'unknown',
    containerLongName: output.format?.format_long_name ?? 'Unknown',
    codec,
    codecLongName: audioStream.codec_long_name ?? codec,
    codecLabel: codecLabel(codec),
    sampleRate: toNumber(audioStream.sample_rate),
    sampleFormat: audioStream.sample_fmt ?? null,
    bitDepth: readBitDepth(audioStream),
    channels: audioStream.channels ?? null,
    channelLayout: audioStream.channel_layout ?? null,
    durationSec: toNumber(audioStream.duration) ?? toNumber(output.format?.duration),
    bitrate: toNumber(audioStream.bit_rate) ?? toNumber(output.format?.bit_rate),
    lossless: isLosslessCodec(codec),
  };

  const metadata: Metadata = {
    title: tags['title'] ?? '',
    artist: tags['artist'] ?? '',
    album: tags['album'] ?? '',
  };

  return { tech, metadata, artwork: findArtwork(streams) };
}

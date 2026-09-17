import { uncompressedPcmBytes, type TechInfo } from '@airflac/shared';

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const paddedSeconds = String(secs).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
  return `${minutes}:${paddedSeconds}`;
}

export function formatSampleRate(hz: number | null | undefined): string {
  if (!hz) return '—';
  const khz = hz / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
}

export function formatBitDepth(bits: number | null | undefined): string {
  return bits ? `${bits}-bit` : '—';
}

export function formatBitrate(bitsPerSecond: number | null | undefined): string {
  if (!bitsPerSecond) return '—';
  return `${Math.round(bitsPerSecond / 1000)} kbps`;
}

export function formatChannels(channels: number | null | undefined): string {
  if (!channels) return '—';
  if (channels === 1) return 'Mono';
  if (channels === 2) return 'Stereo';
  return `${channels} ch`;
}

export interface SizeComparison {
  text: string;
  larger: boolean;
}

/**
 * Describes the size change after conversion.
 *
 * A larger output is reported as the actual increase rather than dressed up as a
 * saving: converting a lossy source to FLAC usually does grow the file.
 */
export function compareSizes(original: number, converted: number): SizeComparison {
  const difference = converted - original;

  if (difference > 0) {
    return { text: `${formatBytes(difference)} larger`, larger: true };
  }

  if (difference === 0 || original === 0) {
    return { text: 'same size', larger: false };
  }

  const percent = (Math.abs(difference) / original) * 100;
  return { text: `${percent.toFixed(1)}% smaller`, larger: false };
}

/**
 * Describes what a source file costs on disk, and for a compressed lossless
 * source how that compares with raw PCM.
 *
 * This is the number the whole exercise is about: it shows a WAV as the
 * uncompressed baseline, and an existing FLAC as the saving it already has,
 * which is also why re-encoding one has little left to give.
 */
export function describeStorage(originalSize: number, tech: TechInfo | null): string {
  const size = formatBytes(originalSize);
  if (!tech) return size;

  if (tech.codec.toLowerCase().startsWith('pcm_')) {
    return `${size} · uncompressed PCM`;
  }

  const raw = uncompressedPcmBytes(tech);
  if (!tech.lossless || raw === null || raw === 0) return size;

  const percent = Math.round((originalSize / raw) * 100);
  return `${size} · ${percent}% of uncompressed PCM`;
}

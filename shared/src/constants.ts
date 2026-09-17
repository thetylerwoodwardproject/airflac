import type { ConversionSettings, TechInfo } from './types.js';

export const APP_NAME = 'AirFLAC';
export const APP_TAGLINE = 'Lossless audio conversion for broadcast.';

/**
 * Codecs that encode audio without discarding information.
 * Anything matching PCM_CODEC_PREFIX is also lossless.
 * Classification is always made from the ffprobe codec name, never a file extension:
 * the same .m4a container holds lossy AAC or lossless ALAC.
 */
export const LOSSLESS_CODECS: ReadonlySet<string> = new Set([
  'flac',
  'alac',
  'wavpack',
  'tta',
  'truehd',
  'mlp',
  'ape',
  'shorten',
  'als',
  'ralf',
  'dst',
  'wmalossless',
  's302m',
]);

export const PCM_CODEC_PREFIX = 'pcm_';

export function isLosslessCodec(codecName: string): boolean {
  const codec = codecName.toLowerCase();
  return codec.startsWith(PCM_CODEC_PREFIX) || LOSSLESS_CODECS.has(codec);
}

/** Presentable names for codecs ffprobe reports in lower case shorthand. */
const CODEC_LABELS: Readonly<Record<string, string>> = {
  aac: 'AAC',
  ac3: 'AC-3',
  alac: 'ALAC',
  ape: "Monkey's Audio",
  dts: 'DTS',
  eac3: 'E-AC-3',
  flac: 'FLAC',
  mp1: 'MP1',
  mp2: 'MP2',
  mp3: 'MP3',
  opus: 'Opus',
  tta: 'TTA',
  truehd: 'TrueHD',
  vorbis: 'Vorbis',
  wavpack: 'WavPack',
  wmalossless: 'WMA Lossless',
  wmapro: 'WMA Pro',
  wmav1: 'WMA',
  wmav2: 'WMA',
};

export function codecLabel(codecName: string): string {
  const codec = codecName.toLowerCase();
  if (CODEC_LABELS[codec]) return CODEC_LABELS[codec];
  if (codec.startsWith(PCM_CODEC_PREFIX)) return 'PCM';
  return codecName.toUpperCase();
}

/**
 * Codec name as it reads in "Really? ___? For broadcast?".
 * MP3 is the only one that takes an article, matching how an engineer would say it.
 */
export function lossyCodecPhrase(codecName: string): string {
  const label = codecLabel(codecName);
  return label === 'MP3' ? 'An MP3' : label;
}

export const DEFAULT_COMPRESSION_LEVEL = 5;
export const MIN_COMPRESSION_LEVEL = 0;
export const MAX_COMPRESSION_LEVEL = 12;

export const DEFAULT_SETTINGS: ConversionSettings = {
  compressionLevel: DEFAULT_COMPRESSION_LEVEL,
  sampleRate: 'source',
  bitDepth: 'source',
};

export const ACCEPTED_ARTWORK_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png']);

/** Terminal states: a file in one of these is no longer being worked on. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['complete', 'failed']);

/**
 * True when producing the FLAC needs nothing but a tag rewrite.
 *
 * A FLAC source whose sample rate and bit depth are being preserved has its
 * audio stream copied verbatim rather than re-encoded, so the compression level
 * does not apply to it. Both sides of the app depend on this: the server to
 * decide how to invoke ffmpeg, the interface to say so before the user converts.
 */
export function isMetadataOnlyChange(settings: ConversionSettings, tech: TechInfo): boolean {
  if (tech.codec.toLowerCase() !== 'flac') return false;

  const rateUnchanged = settings.sampleRate === 'source' || settings.sampleRate === tech.sampleRate;
  const depthUnchanged = settings.bitDepth === 'source' || settings.bitDepth === tech.bitDepth;
  return rateUnchanged && depthUnchanged;
}

/**
 * What this audio would occupy as uncompressed PCM.
 *
 * Returns null for a lossy source, which has no fixed sample size to calculate
 * from. Used to show how much space a lossless file is already saving, which is
 * the whole reason for converting to FLAC in the first place.
 */
export function uncompressedPcmBytes(
  tech: Pick<TechInfo, 'sampleRate' | 'channels' | 'bitDepth' | 'durationSec'>,
): number | null {
  const { sampleRate, channels, bitDepth, durationSec } = tech;
  if (!sampleRate || !channels || !bitDepth || !durationSec) return null;

  return Math.round(sampleRate * channels * (bitDepth / 8) * durationSec);
}

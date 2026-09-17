import { spawn, type ChildProcess } from 'node:child_process';

import type { ConversionSettings, Metadata, TechInfo } from '@airflac/shared';

import { logger } from '../logger.js';
import { buildTagArgs } from './metadata.js';

/** Every ffmpeg process currently running, so shutdown can stop them all. */
const activeProcesses = new Set<ChildProcess>();

export interface ConversionPlan {
  inputPath: string;
  outputPath: string;
  artworkPath: string | null;
  metadata: Metadata;
  settings: ConversionSettings;
  sourceTech: TechInfo;
}

/**
 * True when the output can be produced without re-encoding the audio.
 *
 * A FLAC source whose sample rate and bit depth are being preserved only needs
 * its tags rewritten, so the audio stream is copied verbatim. Asking for a
 * different rate or depth is the explicit request that forces a re-encode.
 */
export function canStreamCopy(settings: ConversionSettings, tech: TechInfo): boolean {
  if (tech.codec.toLowerCase() !== 'flac') return false;

  const rateUnchanged = settings.sampleRate === 'source' || settings.sampleRate === tech.sampleRate;
  const depthUnchanged = settings.bitDepth === 'source' || settings.bitDepth === tech.bitDepth;
  return rateUnchanged && depthUnchanged;
}

/** FLAC carries 16-bit samples as s16 and 24-bit samples as s32. */
function sampleFormatFor(bitDepth: 16 | 24): string {
  return bitDepth === 16 ? 's16' : 's32';
}

export function buildFfmpegArgs(plan: ConversionPlan): string[] {
  const { settings, sourceTech, artworkPath } = plan;
  const streamCopy = canStreamCopy(settings, sourceTech);

  const args = ['-v', 'error', '-y', '-nostdin', '-progress', 'pipe:1', '-nostats'];

  args.push('-i', plan.inputPath);
  if (artworkPath) args.push('-i', artworkPath);

  args.push('-map', '0:a:0');
  if (artworkPath) args.push('-map', '1:v:0');

  // Carry existing tags across by default; the explicit -metadata flags below
  // then override only the fields AirFLAC manages.
  args.push('-map_metadata', '0');

  if (streamCopy) {
    args.push('-c:a', 'copy');
  } else {
    args.push('-c:a', 'flac', '-compression_level', String(settings.compressionLevel));

    if (settings.sampleRate !== 'source') {
      // soxr only runs when the user explicitly asked for a different rate.
      args.push('-af', 'aresample=resampler=soxr', '-ar', String(settings.sampleRate));
    }
    if (settings.bitDepth !== 'source') {
      args.push('-sample_fmt', sampleFormatFor(settings.bitDepth));
    }
  }

  if (artworkPath) {
    args.push('-c:v', 'copy', '-disposition:v:0', 'attached_pic');
  }

  args.push(...buildTagArgs(plan.metadata));
  args.push(plan.outputPath);

  return args;
}

export interface ConversionResult {
  ok: boolean;
  stderr: string;
}

/**
 * Runs one conversion.
 *
 * Progress comes from ffmpeg's own -progress output measured against the
 * duration ffprobe reported. When the duration is unknown the callback receives
 * null rather than an invented percentage.
 */
export function runConversion(
  plan: ConversionPlan,
  onProgress: (percent: number | null) => void,
): Promise<ConversionResult> {
  const args = buildFfmpegArgs(plan);
  const durationSec = plan.sourceTech.durationSec;

  return new Promise((resolve) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    activeProcesses.add(child);

    let stderr = '';
    let stdoutBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8');

      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key !== 'out_time_us' || value === undefined) continue;

        const microseconds = Number(value);
        if (!Number.isFinite(microseconds) || !durationSec || durationSec <= 0) {
          onProgress(null);
          continue;
        }

        const percent = (microseconds / 1_000_000 / durationSec) * 100;
        onProgress(Math.max(0, Math.min(100, Math.round(percent))));
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 64_000) stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      activeProcesses.delete(child);
      resolve({ ok: false, stderr: error.message });
    });

    child.on('close', (code) => {
      activeProcesses.delete(child);
      resolve({ ok: code === 0, stderr });
    });
  });
}

/** Stops every running conversion. Used on SIGTERM/SIGINT so no ffmpeg is orphaned. */
export function killAllConversions(): void {
  if (activeProcesses.size === 0) return;

  logger.info('terminating running conversions', { count: activeProcesses.size });
  for (const child of activeProcesses) {
    child.kill('SIGTERM');
  }
  activeProcesses.clear();
}

export function activeConversionCount(): number {
  return activeProcesses.size;
}

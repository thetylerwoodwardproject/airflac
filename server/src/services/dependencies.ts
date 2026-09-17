import { commandExists } from '../utils/process.js';

export interface DependencyStatus {
  ffmpeg: boolean;
  ffprobe: boolean;
}

const CACHE_TTL_MS = 30_000;

let cached: { value: DependencyStatus; checkedAt: number } | null = null;

/**
 * Reports whether ffmpeg and ffprobe are runnable.
 *
 * Results are cached briefly so that polling /api/health cannot be used to make
 * the server spawn processes in a loop.
 */
export async function checkDependencies(force = false): Promise<DependencyStatus> {
  if (!force && cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const [ffmpeg, ffprobe] = await Promise.all([commandExists('ffmpeg'), commandExists('ffprobe')]);
  const value = { ffmpeg, ffprobe };
  cached = { value, checkedAt: Date.now() };
  return value;
}

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Config {
  host: string;
  port: number;
  maxUploadBytes: number;
  maxArtworkBytes: number;
  retentionHours: number;
  defaultCompressionLevel: number;
  storagePath: string;
  maxConcurrentConversions: number;
  trustProxy: boolean;
  logLevel: LogLevel;
  version: string;
}

class ConfigError extends Error {}

function envString(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim();
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ConfigError(`${name} must be a number, got "${raw}".`);
  }
  if (value < min || value > max) {
    throw new ConfigError(`${name} must be between ${min} and ${max}, got ${value}.`);
  }
  return value;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new ConfigError(`${name} must be true or false, got "${raw}".`);
}

function readVersion(): string {
  try {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(moduleDir, '../package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function loadConfig(): Config {
  const logLevel = envString('AIRFLAC_LOG_LEVEL', 'info') as LogLevel;
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new ConfigError(`AIRFLAC_LOG_LEVEL must be debug, info, warn or error, got "${logLevel}".`);
  }

  return {
    host: envString('AIRFLAC_HOST', '0.0.0.0'),
    port: envNumber('AIRFLAC_PORT', 8080, 1, 65535),
    maxUploadBytes: envNumber('AIRFLAC_MAX_UPLOAD_MB', 1000, 1, 100_000) * 1024 * 1024,
    maxArtworkBytes: envNumber('AIRFLAC_MAX_ARTWORK_MB', 10, 1, 100) * 1024 * 1024,
    retentionHours: envNumber('AIRFLAC_FILE_RETENTION_HOURS', 24, 0.25, 8760),
    defaultCompressionLevel: envNumber('AIRFLAC_FLAC_COMPRESSION_LEVEL', 5, 0, 12),
    storagePath: resolve(process.cwd(), envString('AIRFLAC_STORAGE_PATH', './storage')),
    maxConcurrentConversions: envNumber('AIRFLAC_MAX_CONCURRENT_CONVERSIONS', 2, 1, 32),
    trustProxy: envBoolean('AIRFLAC_TRUST_PROXY', false),
    logLevel,
    version: readVersion(),
  };
}

let cached: Config | null = null;

/** The active configuration. Parsed once on first use. */
export function config(): Config {
  cached ??= loadConfig();
  return cached;
}

/** Test seam: forces the next config() call to re-read the environment. */
export function resetConfig(): void {
  cached = null;
}

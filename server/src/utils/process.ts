import { spawn } from 'node:child_process';

export interface CaptureResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Runs a command with an argument array and captures its output.
 *
 * Arguments are always passed as an array and never through a shell, so no
 * user-supplied value can be interpreted as a command.
 */
export function runCapture(
  command: string,
  args: readonly string[],
  options: { timeoutMs?: number; maxOutputBytes?: number } = {},
): Promise<CaptureResult> {
  const { timeoutMs = 30_000, maxOutputBytes = 8 * 1024 * 1024 } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOutputBytes) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutputBytes) stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/** True when the binary is present and runnable. Used for startup checks and /api/health. */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const result = await runCapture(command, ['-version'], { timeoutMs: 10_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

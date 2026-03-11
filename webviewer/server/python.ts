import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Invoke a Python script using the system's python3.
 */
export function spawnPython(
  agentDir: string,
  args: string[],
  timeout = 30_000,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const pythonBin = 'python3';
    const repoRoot = path.resolve(agentDir, '..');

    const proc = spawn(pythonBin, args, {
      cwd: repoRoot,
      timeout,
      env: process.env,
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    proc.stdout.on('data', (data: Buffer) => {
      stdoutChunks.push(data.toString());
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderrChunks.push(data.toString());
    });

    proc.on('close', (code: number | null) => {
      resolve({
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err: Error) => {
      reject(err);
    });
  });
}

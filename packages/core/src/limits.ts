import { PdfToolsError } from './errors.ts';

const MB = 1024 * 1024;

export interface Limits {
  /** Above this, the UI warns that processing may be slow or run out of memory. */
  warnBytes: number;
  /** Above this, files are refused. */
  maxBytes: number;
  /** Total pages an operation will touch. Guards against page-tree bombs. */
  maxPages: number;
  /** Per-operation wall clock before the worker is terminated. */
  timeoutMs: number;
}

export const DEFAULT_LIMITS: Limits = {
  warnBytes: 200 * MB,
  maxBytes: 1024 * MB,
  maxPages: 10_000,
  timeoutMs: 5 * 60_000,
};

export type SizeVerdict = 'ok' | 'warn';

/** Throws `too_large` above the cap; returns 'warn' above the warning threshold. */
export function checkFileSize(bytes: number, limits: Limits = DEFAULT_LIMITS): SizeVerdict {
  if (bytes > limits.maxBytes) {
    throw new PdfToolsError(
      'too_large',
      `This file is ${formatBytes(bytes)}. The limit is ${formatBytes(limits.maxBytes)}.`,
    );
  }
  return bytes > limits.warnBytes ? 'warn' : 'ok';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / (1024 * MB)).toFixed(2)} GB`;
}

import {
  PdfToolsError,
  toOpError,
  type OpArgs,
  type OpError,
  type OpName,
  type OpOutput,
} from '@pdf-tools/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pool } from '../worker/pool.ts';
import { startBusy } from './busy.ts';
import { revokeAll, toDownloads, type DownloadableFile } from './download.ts';

export type OperationState =
  | { status: 'idle' }
  | { status: 'running'; progress: number | null }
  | { status: 'done'; files: DownloadableFile[]; data?: unknown }
  | { status: 'error'; error: OpError };

export interface Prepared<K extends OpName> {
  args: OpArgs[K];
  transfer: Transferable[];
}

/** Drives one op on the worker pool: progress, cancel, result URLs, typed errors. */
export function useOperation<K extends OpName>(op?: K) {
  const [state, setState] = useState<OperationState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const results = useRef<DownloadableFile[]>([]);

  const clearResults = () => {
    revokeAll(results.current);
    results.current = [];
  };

  /** Shared lifecycle: progress, cancel, result URLs, typed errors. */
  const execute = useCallback(
    async (task: (signal: AbortSignal, onProgress: (f: number) => void) => Promise<OpOutput>) => {
      controller.current?.abort();
      clearResults();
      const ctl = new AbortController();
      controller.current = ctl;
      setState({ status: 'running', progress: null });
      const endBusy = startBusy();
      try {
        const output = await task(ctl.signal, (progress) => {
          if (!ctl.signal.aborted) setState({ status: 'running', progress });
        });
        if (ctl.signal.aborted) throw new PdfToolsError('cancelled');
        results.current = toDownloads(output.files);
        setState({ status: 'done', files: results.current, data: output.data });
      } catch (err) {
        const error = toOpError(err);
        setState(error.code === 'cancelled' ? { status: 'idle' } : { status: 'error', error });
      } finally {
        endBusy();
        if (controller.current === ctl) controller.current = null;
      }
    },
    [],
  );

  /** Run the op in the worker pool. */
  const run = useCallback(
    (prepare: () => Promise<Prepared<K>>) =>
      execute(async (signal, onProgress) => {
        if (!op) throw new PdfToolsError('internal');
        const { args, transfer } = await prepare();
        if (signal.aborted) throw new PdfToolsError('cancelled');
        return pool().run(op, args, { transfer, signal, onProgress });
      }),
    [execute, op],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(() => {
    controller.current?.abort();
    clearResults();
    setState({ status: 'idle' });
  }, []);

  useEffect(
    () => () => {
      controller.current?.abort();
      clearResults();
    },
    [],
  );

  /** Run work that must stay on the page (e.g. canvas rendering) with the same lifecycle. */
  const runLocal = execute;

  return { state, run, runLocal, cancel, reset };
}

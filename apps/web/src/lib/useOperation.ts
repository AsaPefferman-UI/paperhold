import { PdfToolsError, toOpError, type OpArgs, type OpError, type OpName } from '@pdf-tools/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pool } from '../worker/pool.ts';
import { revokeAll, toDownloads, type DownloadableFile } from './download.ts';

export type OperationState =
  | { status: 'idle' }
  | { status: 'running'; progress: number | null }
  | { status: 'done'; files: DownloadableFile[] }
  | { status: 'error'; error: OpError };

export interface Prepared<K extends OpName> {
  args: OpArgs[K];
  transfer: Transferable[];
}

/** Drives one op on the worker pool: progress, cancel, result URLs, typed errors. */
export function useOperation<K extends OpName>(op: K) {
  const [state, setState] = useState<OperationState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const results = useRef<DownloadableFile[]>([]);

  const clearResults = () => {
    revokeAll(results.current);
    results.current = [];
  };

  const run = useCallback(
    async (prepare: () => Promise<Prepared<K>>) => {
      controller.current?.abort();
      clearResults();
      const ctl = new AbortController();
      controller.current = ctl;
      setState({ status: 'running', progress: null });
      try {
        const { args, transfer } = await prepare();
        if (ctl.signal.aborted) throw new PdfToolsError('cancelled');
        const output = await pool().run(op, args, {
          transfer,
          signal: ctl.signal,
          onProgress: (progress) => setState({ status: 'running', progress }),
        });
        results.current = toDownloads(output.files);
        setState({ status: 'done', files: results.current });
      } catch (err) {
        const error = toOpError(err);
        setState(error.code === 'cancelled' ? { status: 'idle' } : { status: 'error', error });
      } finally {
        if (controller.current === ctl) controller.current = null;
      }
    },
    [op],
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

  return { state, run, cancel, reset };
}

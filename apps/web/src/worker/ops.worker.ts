/// <reference lib="webworker" />
import { runOp } from '@pdf-tools/core/run';
import {
  outputTransferables,
  toOpError,
  type OpArgs,
  type OpName,
  type WorkerRequest,
  type WorkerResponse,
} from '@pdf-tools/core';

declare const self: DedicatedWorkerGlobalScope;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  self.postMessage(msg, transfer);

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req?.type !== 'run') return;
  const { id } = req;
  let last = 0;
  const progress = (fraction: number) => {
    // Throttle: at most one message per 1% step.
    if (fraction - last < 0.01 && fraction < 1) return;
    last = fraction;
    post({ type: 'progress', id, fraction });
  };
  runOp(req.op as OpName, req.args as OpArgs[OpName], { progress }).then(
    (output) => post({ type: 'done', id, output }, outputTransferables(output)),
    (err: unknown) => post({ type: 'error', id, error: toOpError(err) }),
  );
});

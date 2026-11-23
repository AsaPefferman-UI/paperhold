/// <reference lib="webworker" />
import { runOp } from '@pdf-tools/core/run';
import {
  PdfToolsError,
  outputTransferables,
  toOpError,
  type CanvasCall,
  type OpArgs,
  type OpName,
  type WorkerRequest,
  type WorkerResponse,
} from '@pdf-tools/core';
import { browserServices } from './services.ts';

declare const self: DedicatedWorkerGlobalScope;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  self.postMessage(msg, transfer);

let currentJob = 0;
let nextCall = 1;
const pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();

/** Fallback for browsers without OffscreenCanvas in workers: the page does the canvas step. */
function askPage(call: CanvasCall): Promise<Uint8Array> {
  const callId = nextCall++;
  return new Promise((resolve, reject) => {
    pending.set(callId, { resolve, reject });
    post({ type: 'canvas', id: currentJob, callId, call });
  });
}

const services = browserServices(askPage);

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req?.type === 'canvasResult') {
    const p = pending.get(req.callId);
    pending.delete(req.callId);
    if (req.bytes) p?.resolve(req.bytes);
    else p?.reject(new PdfToolsError(req.error?.code ?? 'internal', req.error?.message));
    return;
  }
  if (req?.type !== 'run') return;
  const { id } = req;
  currentJob = id;
  let last = 0;
  const progress = (fraction: number) => {
    // Throttle: at most one message per 1% step.
    if (fraction - last < 0.01 && fraction < 1) return;
    last = fraction;
    post({ type: 'progress', id, fraction });
  };
  runOp(req.op as OpName, req.args as OpArgs[OpName], { progress, services }).then(
    (output) => post({ type: 'done', id, output }, outputTransferables(output)),
    (err: unknown) => post({ type: 'error', id, error: toOpError(err) }),
  );
});

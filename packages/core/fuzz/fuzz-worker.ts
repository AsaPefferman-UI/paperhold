// Runs one fuzz case per message in a worker thread, so the parent can terminate a case that
// hangs (a synchronous loop cannot be interrupted from the same thread).
import { parentPort } from 'node:worker_threads';
import { runOp } from '../src/dispatch.ts';
import { PdfToolsError } from '../src/errors.ts';
import type { OpContext, OpName } from '../src/protocol.ts';
import { nodeServices } from '../test/services.ts';

export type CaseResult =
  { outcome: 'ok' } | { outcome: 'typed'; code: string } | { outcome: 'untyped'; error: string };

const ctx: OpContext = { progress: () => {}, services: nodeServices };
// Parsers warn loudly on broken input; keep the fuzz log readable.
// eslint-disable-next-line no-console -- silencing third-party parser warnings in this thread
console.log = () => {};
console.warn = () => {};

parentPort!.on('message', async ({ op, args }: { op: OpName; args: never }) => {
  let result: CaseResult;
  try {
    await runOp(op, args, ctx);
    result = { outcome: 'ok' };
  } catch (err) {
    result =
      err instanceof PdfToolsError
        ? { outcome: 'typed', code: err.code }
        : {
            outcome: 'untyped',
            error: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : String(err),
          };
  }
  parentPort!.postMessage(result);
});

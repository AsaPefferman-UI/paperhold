import type { OpError } from './errors.ts';
import type { MergeArgs } from './ops/merge.ts';
import type { OrganizeArgs } from './ops/organize.ts';
import type { SplitArgs } from './ops/split.ts';
import type { PageNumbersArgs, WatermarkArgs } from './ops/stamp-ops.ts';

/** A file produced by an operation. */
export interface OutputFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface OpOutput {
  files: OutputFile[];
}

/** Every operation's argument type, keyed by op name. Adding an op = one line here + one in registry. */
export interface OpArgs {
  merge: MergeArgs;
  split: SplitArgs;
  organize: OrganizeArgs;
  pageNumbers: PageNumbersArgs;
  watermark: WatermarkArgs;
}

export type OpName = keyof OpArgs;

export interface OpContext {
  /** Fraction in [0, 1]. */
  progress(fraction: number): void;
}

/** Main thread -> worker. `args` buffers are transferred, never cloned. */
export type WorkerRequest = {
  [K in OpName]: { type: 'run'; id: number; op: K; args: OpArgs[K] };
}[OpName];

/** Worker -> main thread. */
export type WorkerResponse =
  | { type: 'progress'; id: number; fraction: number }
  | { type: 'done'; id: number; output: OpOutput }
  | { type: 'error'; id: number; error: OpError };

/** Collect the distinct ArrayBuffers in an output so they can be transferred back zero-copy. */
export function outputTransferables(output: OpOutput): ArrayBuffer[] {
  return [...new Set(output.files.map((f) => f.bytes.buffer as ArrayBuffer))];
}

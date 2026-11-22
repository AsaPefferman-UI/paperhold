// Node-side qpdf for tests and fixture generation.
import createModule from '@neslinesli93/qpdf-wasm';
import { runQpdf, type QpdfFactory, type QpdfResult } from '../src/qpdf.ts';

export const nodeQpdf = createModule as unknown as QpdfFactory;

export function qpdf(
  args: string[],
  inputs: Record<string, Uint8Array> = {},
  outputs: string[] = [],
): Promise<QpdfResult> {
  return runQpdf(nodeQpdf, args, inputs, outputs);
}

/** `qpdf --check`: exit 0 = valid, 3 = warnings only, 2 = errors. */
export function qpdfCheck(bytes: Uint8Array): Promise<QpdfResult> {
  return qpdf(['--check', '/in.pdf'], { 'in.pdf': bytes });
}

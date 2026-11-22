import { PdfToolsError } from './errors.ts';
import { merge } from './ops/merge.ts';
import type { OpArgs, OpContext, OpName, OpOutput } from './protocol.ts';

type Registry = { [K in OpName]: (args: OpArgs[K], ctx: OpContext) => Promise<OpOutput> };

const registry: Registry = {
  merge,
};

export function isOpName(op: unknown): op is OpName {
  return typeof op === 'string' && Object.hasOwn(registry, op);
}

/** Run a named op. The single entry point used by the worker and by tests. */
export async function runOp<K extends OpName>(
  op: K,
  args: OpArgs[K],
  ctx: OpContext,
): Promise<OpOutput> {
  if (!isOpName(op)) throw new PdfToolsError('unsupported', 'Unknown operation.');
  if (typeof args !== 'object' || args === null) throw new PdfToolsError('invalid_input');
  return registry[op](args, ctx);
}

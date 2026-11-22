// UI-safe entry: types, errors and limits only. PDF libraries live behind '@pdf-tools/core/run'
// so they load in workers, never in the page bundle.
export * from './errors.ts';
export * from './limits.ts';
export * from './protocol.ts';
export * from './ranges.ts';
export type { SplitMode } from './ops/split.ts';
export type { QuarterTurn } from './ops/organize.ts';
export type { NumberPosition } from './ops/stamp-ops.ts';

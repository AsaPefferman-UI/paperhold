// UI-safe entry: types, errors and limits only. PDF libraries live behind '@pdf-tools/core/run'
// so they load in workers, never in the page bundle.
export * from './errors.ts';
export * from './limits.ts';
export * from './protocol.ts';
export * from './ranges.ts';
export type { SplitMode } from './ops/split.ts';
export type { QuarterTurn } from './ops/organize.ts';
export type { NumberPosition } from './ops/stamp-ops.ts';
export type { CompressPreset } from './ops/compress.ts';
export type { PageSizeChoice } from './ops/images-to-pdf.ts';
export { pdfToImages, MAX_PIXELS, type PageRenderer, type ImageType } from './ops/pdf-to-images.ts';
export { sniffImage, type ImageFormat } from './images.ts';

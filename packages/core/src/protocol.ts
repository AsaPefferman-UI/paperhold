import type { OpError } from './errors.ts';
import type { MergeArgs } from './ops/merge.ts';
import type { OrganizeArgs } from './ops/organize.ts';
import type { SplitArgs } from './ops/split.ts';
import type { PageNumbersArgs, WatermarkArgs } from './ops/stamp-ops.ts';
import type { CompressArgs } from './ops/compress.ts';
import type { ImagesToPdfArgs } from './ops/images-to-pdf.ts';
import type { FillFormArgs, InspectFormArgs } from './ops/forms.ts';
import type { ProtectArgs, UnlockArgs } from './ops/encryption.ts';
import type { SignArgs } from './ops/sign.ts';
import type { TextLayerArgs } from './ops/text-layer.ts';
import type { QpdfFactory } from './qpdf.ts';

/** A file produced by an operation. */
export interface OutputFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface OpOutput {
  files: OutputFile[];
  /** Structured, JSON-safe results for ops that inspect rather than produce (e.g. form fields). */
  data?: unknown;
}

/** Every operation's argument type, keyed by op name. Adding an op = one line here + one in registry. */
export interface OpArgs {
  merge: MergeArgs;
  split: SplitArgs;
  organize: OrganizeArgs;
  pageNumbers: PageNumbersArgs;
  watermark: WatermarkArgs;
  imagesToPdf: ImagesToPdfArgs;
  compress: CompressArgs;
  inspectForm: InspectFormArgs;
  fillForm: FillFormArgs;
  sign: SignArgs;
  protect: ProtectArgs;
  unlock: UnlockArgs;
  addTextLayer: TextLayerArgs;
}

export type OpName = keyof OpArgs;

/** Pixels handed to an image service: either an encoded JPEG or raw 8-bit samples. */
export type SourceImage =
  | { kind: 'jpeg'; bytes: Uint8Array }
  | { kind: 'raw'; width: number; height: number; channels: 1 | 3 | 4; pixels: Uint8Array };

/**
 * Platform capabilities an op may need but core cannot provide portably (pixel codecs, qpdf).
 * The browser worker supplies OffscreenCanvas/libheif/qpdf.wasm; tests supply Node versions.
 */
export interface Services {
  /** Turn any image the platform can decode (HEIC, WebP, GIF, ...) into PNG or JPEG bytes. */
  decodeImage?(
    bytes: Uint8Array,
    mime: string,
  ): Promise<{ bytes: Uint8Array; format: 'png' | 'jpeg' }>;
  /** Re-encode an image as JPEG at the given size and quality (0..1). */
  encodeJpeg?(
    src: SourceImage,
    width: number,
    height: number,
    quality: number,
  ): Promise<Uint8Array>;
  qpdf?: { factory: QpdfFactory; locateFile?: (path: string) => string };
}

export interface OpContext {
  /** Fraction in [0, 1]. */
  progress(fraction: number): void;
  services?: Services;
}

/**
 * Canvas work a worker can hand back to the page when the browser has no OffscreenCanvas
 * (SPEC §8 fallback). Pixels only ever move between our own threads.
 */
export type CanvasCall =
  | { method: 'decodeToPng'; bytes: Uint8Array; mime: string }
  | { method: 'encodeJpeg'; src: SourceImage; width: number; height: number; quality: number };

/** Main thread -> worker. `args` buffers are transferred, never cloned. */
export type RunRequest = {
  [K in OpName]: { type: 'run'; id: number; op: K; args: OpArgs[K] };
}[OpName];

export type WorkerRequest =
  RunRequest | { type: 'canvasResult'; callId: number; bytes?: Uint8Array; error?: OpError };

/** Worker -> main thread. */
export type WorkerResponse =
  | { type: 'progress'; id: number; fraction: number }
  | { type: 'done'; id: number; output: OpOutput }
  | { type: 'error'; id: number; error: OpError }
  | { type: 'canvas'; id: number; callId: number; call: CanvasCall };

/** Collect the distinct ArrayBuffers in an output so they can be transferred back zero-copy. */
export function outputTransferables(output: OpOutput): ArrayBuffer[] {
  return [...new Set(output.files.map((f) => f.bytes.buffer as ArrayBuffer))];
}

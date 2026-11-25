/// <reference lib="webworker" />
// OCR worker: downloads the engine and language data from our own origin, checks each file
// against the SHA-256 compiled into the app, then recognises page images one at a time.
import {
  createOcrEngine,
  PdfToolsError,
  toOpError,
  type OcrEngine,
  type OcrWord,
  type OpError,
  type TessFactory,
} from '@pdf-tools/core';
import { gunzipSync } from 'fflate';

declare const self: DedicatedWorkerGlobalScope;

export type OcrRequest =
  { type: 'init'; languages: string[] } | { type: 'recognize'; id: number; image: Uint8Array };

export type OcrResponse =
  | { type: 'loading'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'words'; id: number; words: OcrWord[] }
  | { type: 'error'; id?: number; error: OpError };

const post = (msg: OcrResponse) => self.postMessage(msg);

// Smallest module using a SIMD instruction (from wasm-feature-detect).
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** Fetch a manifest file and verify its SHA-256 before anyone touches the bytes. */
async function fetchVerified(name: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const entry = __OCR_MANIFEST__.files[name];
  if (!entry) throw new PdfToolsError('unsupported', 'That OCR language is not available.');
  const res = await fetch(`${__OCR_MANIFEST__.base}${name}`);
  if (!res.ok)
    throw new PdfToolsError(
      'internal',
      'The OCR engine could not be downloaded. Check your connection and try again.',
    );
  const bytes = new Uint8Array(await res.arrayBuffer());
  onBytes(bytes.length);
  if (toHex(await crypto.subtle.digest('SHA-256', bytes)) !== entry.sha256) {
    throw new PdfToolsError(
      'internal',
      'A downloaded OCR file failed its integrity check, so it was not used.',
    );
  }
  return bytes;
}

let engine: OcrEngine | undefined;

async function init(languages: string[]): Promise<void> {
  const simd = WebAssembly.validate(SIMD_PROBE);
  const wasmName = simd ? 'tesseract-core-simd-lstm.wasm' : 'tesseract-core-lstm.wasm';
  const langFiles = languages.map((code) => {
    const name = Object.keys(__OCR_MANIFEST__.files).find((f) => f.startsWith(`${code}-`));
    if (!name) throw new PdfToolsError('unsupported', 'That OCR language is not available.');
    return { code, name };
  });
  const names = [wasmName, ...langFiles.map((l) => l.name)];
  const total = names.reduce((n, f) => n + (__OCR_MANIFEST__.files[f]?.bytes ?? 0), 0);
  let loaded = 0;
  const progress = (n: number) => post({ type: 'loading', loaded: (loaded += n), total });
  const [core, wasm, ...langs] = await Promise.all([
    simd
      ? import('tesseract.js-core/tesseract-core-simd-lstm.js')
      : import('tesseract.js-core/tesseract-core-lstm.js'),
    ...names.map((n) => fetchVerified(n, progress)),
  ]);
  const factory = ((core as { default?: unknown }).default ?? core) as TessFactory;
  engine = await createOcrEngine(
    factory,
    wasm as Uint8Array,
    langFiles.map((l, i) => ({ code: l.code, data: gunzipSync(langs[i] as Uint8Array) })),
  );
}

self.addEventListener('message', (event: MessageEvent<OcrRequest>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    init(msg.languages).then(
      () => post({ type: 'ready' }),
      (err: unknown) => post({ type: 'error', error: toOpError(err) }),
    );
  } else if (msg.type === 'recognize') {
    try {
      if (!engine) throw new PdfToolsError('internal');
      post({ type: 'words', id: msg.id, words: engine.recognize(msg.image) });
    } catch (err) {
      post({ type: 'error', id: msg.id, error: toOpError(err) });
    }
  }
});

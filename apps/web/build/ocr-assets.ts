// OCR binaries (tesseract.js-core WASM and traineddata) self-hosted under a versioned path.
// Their SHA-256 hashes are compiled into the app, and the OCR worker refuses any download that
// does not match: a tampered or truncated file can never reach the engine.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = (name: string) => dirname(require.resolve(`${name}/package.json`));
const version = (name: string) =>
  (JSON.parse(readFileSync(join(pkgDir(name), 'package.json'), 'utf8')) as { version: string })
    .version;

const CORE = 'tesseract.js-core';
const LANGS = ['eng', 'deu', 'fra', 'spa'] as const;
const MODEL = '4.0.0_best_int';

export const OCR_BASE = `/ocr-${version(CORE)}/`;

export interface OcrAsset {
  /** Published file name under OCR_BASE. */
  name: string;
  source: string;
  sha256: string;
  bytes: number;
}

function asset(name: string, source: string): OcrAsset {
  const data = readFileSync(source);
  return {
    name,
    source,
    sha256: createHash('sha256').update(data).digest('hex'),
    bytes: data.length,
  };
}

let cached: OcrAsset[] | undefined;

export function ocrAssets(): OcrAsset[] {
  cached ??= [
    asset('tesseract-core-simd-lstm.wasm', join(pkgDir(CORE), 'tesseract-core-simd-lstm.wasm')),
    asset('tesseract-core-lstm.wasm', join(pkgDir(CORE), 'tesseract-core-lstm.wasm')),
    ...LANGS.map((l) =>
      asset(
        // Not ".gz": static servers would add Content-Encoding: gzip, the browser would inflate it,
        // and the bytes would no longer match their hash. The worker inflates it itself.
        `${l}-${version(`@tesseract.js-data/${l}`)}-${MODEL}.traineddata-gzip.bin`,
        join(pkgDir(`@tesseract.js-data/${l}`), MODEL, `${l}.traineddata.gz`),
      ),
    ),
  ];
  return cached;
}

/** What the app needs at runtime: where each file is and the hash it must have. */
export function ocrManifest() {
  return {
    base: OCR_BASE,
    files: Object.fromEntries(
      ocrAssets().map((a) => [a.name, { sha256: a.sha256, bytes: a.bytes }]),
    ),
  };
}

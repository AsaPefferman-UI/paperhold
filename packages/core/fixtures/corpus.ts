// Fixture corpus manifest. Tests iterate this; generate.ts makes exactly these files.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ErrorCode } from '../src/errors.ts';

export type Fixture =
  | { kind: 'valid'; pages: number; text?: string; form?: boolean; images?: boolean }
  | { kind: 'encrypted'; pages: number }
  /** Must either be recovered (any page count) or rejected with one of `errors`. */
  | { kind: 'malformed'; errors: ErrorCode[] }
  /** Image inputs for the convert tools. */
  | { kind: 'image'; width: number; height: number };

export const ENCRYPTED_PASSWORD = 'correct horse';

export const SCANNED_TEXT = [
  'The quick brown fox jumps over the lazy dog.\nInvoice number 4417, total due 1,250.',
  'Second scanned page.\nPrivate documents stay on your device.',
];

export const CORPUS: Record<string, Fixture> = {
  'simple.pdf': { kind: 'valid', pages: 3, text: 'Hello from page 1' },
  'large-page-count.pdf': { kind: 'valid', pages: 1000, text: 'Page 1' },
  'pdf-1.4.pdf': { kind: 'valid', pages: 2, text: 'PDF 1.4 page 1' },
  'pdf-2.0.pdf': { kind: 'valid', pages: 2, text: 'PDF 2.0 page 1' },
  'acroform.pdf': { kind: 'valid', pages: 1, text: 'Form page 1', form: true },
  'annotations.pdf': { kind: 'valid', pages: 1, text: 'Annotated page 1' },
  'unicode-résumé-日本語.pdf': { kind: 'valid', pages: 2, text: 'Unicode file page 1' },
  'images.pdf': { kind: 'valid', pages: 2, text: 'Image page 1', images: true },
  'scanned.pdf': { kind: 'valid', pages: 2, images: true },
  'encrypted.pdf': { kind: 'encrypted', pages: 3 },
  'truncated.pdf': { kind: 'malformed', errors: ['damaged'] },
  'broken-xref.pdf': { kind: 'malformed', errors: ['damaged'] },
  'not-a-pdf.pdf': { kind: 'malformed', errors: ['damaged'] },
  'empty.pdf': { kind: 'malformed', errors: ['damaged'] },
  'nested-bomb.pdf': { kind: 'malformed', errors: ['damaged', 'too_large'] },
  'photo.jpg': { kind: 'image', width: 800, height: 600 },
  'photo-exif-rotated.jpg': { kind: 'image', width: 800, height: 600 },
  'graphic.png': { kind: 'image', width: 320, height: 200 },
  'gradient.bmp': { kind: 'image', width: 160, height: 120 },
  'pixel.gif': { kind: 'image', width: 1, height: 1 },
};

const dir = join(dirname(fileURLToPath(import.meta.url)), 'corpus');

export function fixturePath(name: string): string {
  return join(dir, name);
}

/** A fresh copy each call: ops transfer and may detach buffers. */
export function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(fixturePath(name)));
}

export function fixtureBuffer(name: string): ArrayBuffer {
  return readFixture(name).buffer as ArrayBuffer;
}

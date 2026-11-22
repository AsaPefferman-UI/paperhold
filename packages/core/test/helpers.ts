// Independent verification of outputs: re-open with pdf.js (a different parser than pdf-lib) and qpdf.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { expect } from 'vitest';
import { qpdfCheck } from './qpdf.ts';
import type { OpContext } from '../src/protocol.ts';

export const noopCtx: OpContext = { progress: () => {} };

export function openWithPdfjs(bytes: Uint8Array, password?: string) {
  return getDocument({
    data: bytes.slice(),
    ...(password ? { password } : {}),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
}

export async function pageTexts(bytes: Uint8Array, password?: string): Promise<string[]> {
  const task = openWithPdfjs(bytes, password);
  const doc = await task.promise;
  const texts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    texts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  await task.destroy();
  return texts;
}

/** Asserts the output is a structurally valid PDF per qpdf and pdf.js, and returns its page count. */
export async function expectValidPdf(bytes: Uint8Array): Promise<number> {
  const check = await qpdfCheck(bytes);
  expect(check.code, `qpdf --check failed: ${check.stderr}`).toBe(0);
  const task = openWithPdfjs(bytes);
  const n = (await task.promise).numPages;
  await task.destroy();
  return n;
}

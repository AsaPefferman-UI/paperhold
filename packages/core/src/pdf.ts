import { PDFDocument } from 'pdf-lib';
import { PdfToolsError } from './errors.ts';
import { DEFAULT_LIMITS } from './limits.ts';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/** The header may be preceded by junk; the spec allows it within the first 1024 bytes. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length - PDF_MAGIC.length, 1024);
  outer: for (let i = 0; i <= end; i++) {
    for (let j = 0; j < PDF_MAGIC.length; j++) if (bytes[i + j] !== PDF_MAGIC[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Reject structures that make pdf-lib's parser spin for minutes on a tiny file (found by the
 * fuzzer): cross-reference streams with absurd field widths (`/W`) or entry counts (`/Index`).
 * Scans in overlapping chunks so large files are not decoded to one huge string.
 */
export function preflight(bytes: Uint8Array): void {
  const CHUNK = 4 * 1024 * 1024;
  const OVERLAP = 256;
  const decoder = new TextDecoder('latin1');
  const widths = /\/W\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const index = /\/Index\s*\[([\d\s]{1,2000})\]/g;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const text = decoder.decode(
      bytes.subarray(start, Math.min(bytes.length, start + CHUNK + OVERLAP)),
    );
    for (const m of text.matchAll(widths)) {
      if ([m[1], m[2], m[3]].some((w) => Number(w) > 8)) {
        throw new PdfToolsError('damaged', 'This PDF has an invalid cross-reference table.');
      }
    }
    for (const m of text.matchAll(index)) {
      const nums = m[1]!.trim().split(/\s+/).map(Number);
      let total = 0;
      for (let i = 1; i < nums.length; i += 2) total += nums[i]!;
      if (total > 10_000_000) {
        throw new PdfToolsError('damaged', 'This PDF has an invalid cross-reference table.');
      }
    }
  }
}

export interface LoadOptions {
  maxPages?: number;
}

/**
 * Parse untrusted bytes with pdf-lib, mapping every failure to a typed error.
 * Encrypted files are refused: pdf-lib cannot decrypt, and silently writing
 * garbled output would be worse than a clear message.
 */
export async function loadPdf(
  input: Uint8Array | ArrayBuffer,
  { maxPages = DEFAULT_LIMITS.maxPages }: LoadOptions = {},
): Promise<PDFDocument> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!looksLikePdf(bytes)) throw new PdfToolsError('damaged', 'This file is not a PDF.');
  preflight(bytes);
  let doc: PDFDocument;
  try {
    // pdf-lib's EncryptedPDFError breaks `instanceof` (ES5 output), so check the flag instead.
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  } catch {
    throw new PdfToolsError('damaged');
  }
  if (doc.isEncrypted) throw new PdfToolsError('encrypted');
  let count: number;
  try {
    count = doc.getPageCount();
  } catch {
    throw new PdfToolsError('damaged');
  }
  if (count === 0) throw new PdfToolsError('damaged', 'This PDF has no readable pages.');
  if (count > maxPages) {
    throw new PdfToolsError(
      'too_many_pages',
      `This PDF has ${count} pages. The limit is ${maxPages}.`,
    );
  }
  return doc;
}

/** Save with object streams for smaller output and a fixed producer (no version fingerprinting of users). */
export async function savePdf(doc: PDFDocument): Promise<Uint8Array> {
  doc.setProducer('pdf-tools');
  doc.setCreator('pdf-tools');
  return doc.save({ useObjectStreams: true });
}

/** Run pdf-lib work on an untrusted document; any untyped failure means the file is malformed. */
export async function guard<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof PdfToolsError) throw err;
    if (err instanceof RangeError) throw new PdfToolsError('too_large');
    throw new PdfToolsError('damaged', 'This PDF is damaged or uses a structure we cannot read.');
  }
}

/** Prefix typed errors with the file they came from, so batch failures say which file broke. */
export async function forFile<T>(name: string, work: () => Promise<T>): Promise<T> {
  try {
    return await guard(work);
  } catch (err) {
    if (err instanceof PdfToolsError) throw new PdfToolsError(err.code, `${name}: ${err.message}`);
    throw err;
  }
}

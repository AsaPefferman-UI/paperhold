// OCR orchestration on the page: render each page with pdf.js, recognise it in the OCR worker,
// then write the invisible text layer in the ops worker. Cancel terminates the OCR worker.
import {
  DEFAULT_LIMITS,
  MAX_PIXELS,
  PdfToolsError,
  type OpOutput,
  type TextLayerPage,
} from '@pdf-tools/core';
import type { OcrRequest, OcrResponse } from '../worker/ocr.worker.ts';
import { pool } from '../worker/pool.ts';

/** 200 DPI is enough for body text and keeps phones within memory. */
const OCR_DPI = 200;

export interface OcrProgress {
  /** 0..1 overall. */
  fraction: number;
  phase: 'download' | 'pages' | 'saving';
  pagesDone: number;
  pageCount: number;
  /** Seconds left, once at least one page is done. */
  secondsLeft?: number;
}

export async function makeSearchable(
  file: File,
  languages: string[],
  signal: AbortSignal,
  onProgress: (p: OcrProgress) => void,
): Promise<OpOutput> {
  const worker = new Worker(new URL('../worker/ocr.worker.ts', import.meta.url), {
    type: 'module',
  });
  const send = (msg: OcrRequest, transfer: Transferable[] = []) =>
    worker.postMessage(msg, transfer);
  let reject: (e: unknown) => void = () => {};
  const waiters = new Map<number | 'ready', (msg: OcrResponse) => void>();
  const failed = new Promise<never>((_, r) => (reject = r));
  failed.catch(() => {}); // observed through wait(); avoid an unhandled rejection after we finish
  const abort = () => reject(new PdfToolsError('cancelled'));
  signal.addEventListener('abort', abort, { once: true });
  worker.addEventListener('error', () =>
    reject(new PdfToolsError('internal', 'The OCR engine stopped unexpectedly.')),
  );
  worker.addEventListener('message', (e: MessageEvent<OcrResponse>) => {
    const msg = e.data;
    if (msg.type === 'loading') {
      onProgress({
        fraction: 0.1 * (msg.loaded / msg.total),
        phase: 'download',
        pagesDone: 0,
        pageCount: 0,
      });
    } else if (msg.type === 'ready') waiters.get('ready')?.(msg);
    else if (msg.type === 'words') waiters.get(msg.id)?.(msg);
    else reject(new PdfToolsError(msg.error.code, msg.error.message));
  });
  const wait = (key: number | 'ready') =>
    Promise.race([failed, new Promise<OcrResponse>((resolve) => waiters.set(key, resolve))]);

  const { pageRenderer } = await import('./thumbnails.ts');
  const bytes = await file.arrayBuffer();
  const renderer = await pageRenderer(bytes);
  try {
    if (renderer.pageCount > DEFAULT_LIMITS.maxPages) throw new PdfToolsError('too_many_pages');
    send({ type: 'init', languages });
    await wait('ready');
    const pages: TextLayerPage[] = [];
    const started = performance.now();
    for (let i = 0; i < renderer.pageCount; i++) {
      if (signal.aborted) throw new PdfToolsError('cancelled');
      const size = await renderer.pageSize(i);
      let scale = OCR_DPI / 72;
      const px = size.width * size.height * scale * scale;
      if (px > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / px);
      const image = await renderer.render(i, scale, 'png', 1);
      const imageWidth = Math.ceil(size.width * scale);
      const imageHeight = Math.ceil(size.height * scale);
      send({ type: 'recognize', id: i, image }, [image.buffer]);
      const msg = await wait(i);
      if (msg.type !== 'words') throw new PdfToolsError('internal');
      pages.push({ index: i, imageWidth, imageHeight, words: msg.words });
      const perPage = (performance.now() - started) / (i + 1) / 1000;
      onProgress({
        fraction: 0.1 + 0.85 * ((i + 1) / renderer.pageCount),
        phase: 'pages',
        pagesDone: i + 1,
        pageCount: renderer.pageCount,
        secondsLeft: Math.round(perPage * (renderer.pageCount - i - 1)),
      });
    }
    onProgress({
      fraction: 0.96,
      phase: 'saving',
      pagesDone: renderer.pageCount,
      pageCount: renderer.pageCount,
    });
    return await pool().run(
      'addTextLayer',
      { file: { name: file.name, bytes }, pages },
      { transfer: [bytes], signal },
    );
  } finally {
    signal.removeEventListener('abort', abort);
    worker.terminate();
    await renderer.destroy();
  }
}

/** Approximate first-use download for the chosen languages (engine + data), in bytes. */
export function downloadSize(languages: string[]): number {
  const files = __OCR_MANIFEST__.files;
  const engine = files['tesseract-core-simd-lstm.wasm']?.bytes ?? 0;
  return languages.reduce(
    (n, code) =>
      n + (Object.entries(files).find(([name]) => name.startsWith(`${code}-`))?.[1].bytes ?? 0),
    engine,
  );
}

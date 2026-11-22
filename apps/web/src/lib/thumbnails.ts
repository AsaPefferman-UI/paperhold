// Page thumbnails with pdf.js. Parsing runs in pdf.js's own worker; only drawing the small
// bitmaps happens on the main thread. Loaded lazily by the tools that show pages.
import { PdfToolsError } from '@pdf-tools/core';
import {
  getDocument,
  GlobalWorkerOptions,
  PasswordException,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface PageInfo {
  /** The page's own /Rotate, so the UI can add to it. */
  rotation: number;
  /** Width / height as displayed. */
  aspect: number;
}

export async function openDocument(
  bytes: ArrayBuffer,
): Promise<{ doc: PDFDocumentProxy; destroy: () => Promise<void> }> {
  const task = getDocument({
    // A copy: pdf.js takes ownership of the buffer it is given.
    data: new Uint8Array(bytes.slice(0)),
    wasmUrl: `${__PDFJS_BASE__}wasm/`,
    cMapUrl: `${__PDFJS_BASE__}cmaps/`,
    standardFontDataUrl: `${__PDFJS_BASE__}standard_fonts/`,
    iccUrl: `${__PDFJS_BASE__}iccs/`,
    enableXfa: false,
    // Guard against image bombs: skip images above ~64 megapixels in previews.
    maxImageSize: 64_000_000,
  });
  try {
    return { doc: await task.promise, destroy: () => task.destroy() };
  } catch (err) {
    void task.destroy();
    if (err instanceof PasswordException) throw new PdfToolsError('encrypted');
    throw new PdfToolsError('damaged');
  }
}

/** Render one page to an object URL of a PNG `width` CSS pixels wide (device-pixel aware). */
export async function renderThumbnail(
  doc: PDFDocumentProxy,
  pageNumber: number,
  width: number,
): Promise<{ url: string; info: PageInfo }> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = (width * Math.min(2, globalThis.devicePixelRatio || 1)) / base.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  page.cleanup();
  if (!blob) throw new PdfToolsError('internal');
  return {
    url: URL.createObjectURL(blob),
    info: { rotation: page.rotate, aspect: base.width / base.height },
  };
}

import { toOpError, type OpError } from '@pdf-tools/core';
import { useEffect, useState } from 'react';

export interface Thumbnails {
  pageCount: number | null;
  urls: (string | undefined)[];
  error: OpError | null;
}

const FIRST_BATCH = 20;
const THUMB_WIDTH = 160;
const EMPTY: Thumbnails = { pageCount: null, urls: [], error: null };

/**
 * Open a PDF and render its thumbnails: the first 20 straight away, the rest progressively
 * (yielding between pages so the UI stays responsive). Cleans up URLs and the document.
 */
export function useThumbnails(file: File | null): Thumbnails {
  // State is tagged with the file it belongs to, so a new file never shows stale pages.
  const [state, setStateFor] = useState<Thumbnails & { file: File | null }>({
    ...EMPTY,
    file: null,
  });

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const urls: (string | undefined)[] = [];
    let destroy: (() => void) | undefined;
    const setState = (next: Thumbnails | ((s: Thumbnails) => Thumbnails)) =>
      setStateFor((prev) => ({
        ...(typeof next === 'function' ? next(prev.file === file ? prev : EMPTY) : next),
        file,
      }));
    (async () => {
      const { openDocument, renderThumbnail } = await import('./thumbnails.ts');
      const opened = await openDocument(await file.arrayBuffer());
      const doc = opened.doc;
      destroy = () => void opened.destroy();
      if (cancelled) return destroy();
      setState({ pageCount: doc.numPages, urls: [], error: null });
      for (let n = 1; n <= doc.numPages && !cancelled; n++) {
        try {
          urls[n - 1] = (await renderThumbnail(doc, n, THUMB_WIDTH)).url;
        } catch {
          urls[n - 1] = undefined; // a page that fails to render keeps its placeholder
        }
        if (cancelled) break;
        if (n <= FIRST_BATCH || n % 10 === 0 || n === doc.numPages) {
          setState((s) => ({ ...s, urls: [...urls] }));
        }
        if (n >= FIRST_BATCH) await new Promise((r) => setTimeout(r, 0));
      }
    })().catch((err: unknown) => {
      if (!cancelled) setState({ pageCount: null, urls: [], error: toOpError(err) });
    });
    return () => {
      cancelled = true;
      destroy?.();
      for (const u of urls) if (u) URL.revokeObjectURL(u);
    };
  }, [file]);

  return file && state.file === file ? state : EMPTY;
}

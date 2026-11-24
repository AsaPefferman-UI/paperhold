import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { RunPanel } from '../components/RunPanel.tsx';
import { SignatureMaker } from '../components/SignatureMaker.tsx';
import { SingleFile } from '../components/SingleFile.tsx';
import { ToolPage } from '../components/ToolPage.tsx';
import { isPdf, type PickedFile } from '../lib/files.ts';
import { forgetSignature, loadSignature, saveSignature } from '../lib/signatureStore.ts';
import { useOperation } from '../lib/useOperation.ts';
import { useThumbnails } from '../lib/useThumbnails.ts';
import type { ToolMeta } from '../tools.ts';

interface Box {
  x: number;
  y: number;
  width: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Hook: an object URL for a Blob, revoked when it changes. */
function useBlobUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

export default function Sign({ tool }: { tool: ToolMeta }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [signature, setSignature] = useState<Blob | null>(null);
  const [saved, setSaved] = useState<Blob | null>(null);
  const [useSaved, setUseSaved] = useState(false);
  const [remember, setRemember] = useState(false);
  const [page, setPage] = useState(0);
  const [allPages, setAllPages] = useState(false);
  const [box, setBox] = useState<Box>({ x: 0.55, y: 0.8, width: 0.3 });
  const thumbs = useThumbnails(file?.file ?? null, 480);
  const { state, run, cancel, reset } = useOperation('sign');
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    void loadSignature().then((b) => {
      setSaved(b);
      setUseSaved(!!b);
    });
  }, []);

  const active = useSaved ? saved : signature;
  const sigUrl = useBlobUrl(active);
  const pageUrl = thumbs.urls[page];
  const pageCount = thumbs.pageCount ?? 0;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const r = area.current!.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      dx: (e.clientX - r.left) / r.width - box.x,
      dy: (e.clientY - r.top) / r.height - box.y,
    };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const r = area.current!.getBoundingClientRect();
    setBox((b) => ({
      ...b,
      x: clamp((e.clientX - r.left) / r.width - drag.current!.dx, 0, 1 - b.width),
      y: clamp((e.clientY - r.top) / r.height - drag.current!.dy, 0, 0.98),
    }));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, (b: Box) => Box> = {
      ArrowLeft: (b) => ({ ...b, x: clamp(b.x - step, 0, 1 - b.width) }),
      ArrowRight: (b) => ({ ...b, x: clamp(b.x + step, 0, 1 - b.width) }),
      ArrowUp: (b) => ({ ...b, y: clamp(b.y - step, 0, 0.98) }),
      ArrowDown: (b) => ({ ...b, y: clamp(b.y + step, 0, 0.98) }),
      '+': (b) => ({ ...b, width: clamp(b.width + 0.02, 0.05, 1 - b.x) }),
      '=': (b) => ({ ...b, width: clamp(b.width + 0.02, 0.05, 1 - b.x) }),
      '-': (b) => ({ ...b, width: clamp(b.width - 0.02, 0.05, 1) }),
    };
    const f = moves[e.key];
    if (f) {
      e.preventDefault();
      setBox(f);
    }
  };

  const go = () =>
    run(async () => {
      if (remember && !useSaved && signature)
        setSaved((await saveSignature(signature)) ? signature : null);
      const [bytes, image] = await Promise.all([file!.file.arrayBuffer(), active!.arrayBuffer()]);
      const pages = allPages ? [...Array(pageCount).keys()] : [page];
      return {
        args: {
          file: { name: file!.file.name, bytes },
          image,
          placements: pages.map((p) => ({ page: p, ...box })),
        },
        transfer: [bytes, image],
      };
    });

  const forget = async () => {
    await forgetSignature();
    setSaved(null);
    setUseSaved(false);
  };

  return (
    <ToolPage
      tool={tool}
      notice="This adds a picture of your signature to the page. It is a visual signature, not a certified or cryptographic e-signature, and it does not prove who signed."
    >
      <section className="sheet" aria-labelledby="step-file">
        <h2 id="step-file">1. Choose a PDF and place your signature</h2>
        <SingleFile
          accept={tool.accept}
          isAccepted={isPdf}
          label="Choose a PDF or drop it here"
          hint="Drag the signature into place, or focus it and use the arrow keys."
          file={file}
          onChange={(f) => {
            setFile(f);
            setPage(0);
            reset();
          }}
        />
        {thumbs.error && (
          <p className="stamp stamp-error" role="alert">
            {thumbs.error.message}
          </p>
        )}
        {pageCount > 0 && (
          <>
            <div className="toolbar">
              <label className="field inline-field">
                <span>Page</span>
                <select value={page} onChange={(e) => setPage(Number(e.target.value))}>
                  {Array.from({ length: pageCount }, (_, i) => (
                    <option key={i} value={i}>
                      {i + 1} of {pageCount}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={allPages}
                  onChange={(e) => setAllPages(e.target.checked)}
                />
                <span>Same place on every page</span>
              </label>
            </div>
            <div className="place-area" ref={area}>
              {pageUrl ? (
                <img src={pageUrl} alt={`Page ${page + 1}`} className="place-page" />
              ) : (
                <span className="page-placeholder" />
              )}
              {sigUrl && (
                <div
                  className="place-sig"
                  role="slider"
                  tabIndex={0}
                  aria-label="Signature position. Arrow keys move it, plus and minus resize it."
                  aria-valuetext={`${Math.round(box.x * 100)}% from left, ${Math.round(box.y * 100)}% from top, ${Math.round(box.width * 100)}% wide`}
                  aria-valuenow={Math.round(box.x * 100)}
                  style={{
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.width * 100}%`,
                  }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={() => (drag.current = null)}
                  onPointerCancel={() => (drag.current = null)}
                  onKeyDown={onKeyDown}
                >
                  <img src={sigUrl} alt="" draggable={false} />
                </div>
              )}
            </div>
          </>
        )}
      </section>
      <section className="sheet" aria-labelledby="step-sig">
        <h2 id="step-sig">2. Your signature</h2>
        {saved && (
          <div className="saved-sig">
            <label className="check">
              <input
                type="checkbox"
                checked={useSaved}
                onChange={(e) => setUseSaved(e.target.checked)}
              />
              <span>Use my saved signature</span>
            </label>
            <button type="button" className="button button-quiet" onClick={() => void forget()}>
              Forget my signature
            </button>
          </div>
        )}
        {!useSaved && (
          <>
            <SignatureMaker onChange={setSignature} />
            <label className="check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Remember this signature on this device (stored only in this browser)</span>
            </label>
          </>
        )}
        <RunPanel state={state} busyLabel="Signing" onCancel={cancel} onReset={reset}>
          <button
            type="button"
            className="button button-primary button-wide"
            disabled={!file || !active || pageCount === 0}
            onClick={go}
          >
            Add signature
          </button>
          {file && !active && <p className="hint">Draw, type or upload a signature first.</p>}
        </RunPanel>
      </section>
    </ToolPage>
  );
}

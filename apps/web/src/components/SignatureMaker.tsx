import { useEffect, useRef, useState, type PointerEvent } from 'react';

type Mode = 'draw' | 'type' | 'upload';

interface Props {
  /** PNG with a transparent background, or null when cleared. */
  onChange: (png: Blob | null) => void;
}

const W = 600;
const H = 200;
const INK = '#14215c';
const SCRIPT_FONTS =
  "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', 'URW Chancery L', cursive";

/**
 * Synchronous PNG encode. Chromium may defer `toBlob` on detached canvases for seconds; the
 * signature is small, so a data URL decoded in place is both fast and predictable.
 */
function toPng(c: HTMLCanvasElement): Blob {
  const b64 = c.toDataURL('image/png').split(',')[1] ?? '';
  return new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], { type: 'image/png' });
}

/** Crop to the inked area so the placed signature is not mostly empty space. */
function trimmed(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = src.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, src.width, src.height);
  let x0 = src.width;
  let y0 = src.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (data[(y * src.width + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad = 6;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1 + pad * 2;
  out.height = y1 - y0 + 1 + pad * 2;
  out
    .getContext('2d')!
    .drawImage(src, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1);
  return out;
}

/** Draw, type, or upload a signature. Every path produces a trimmed, transparent PNG. */
export function SignatureMaker({ onChange }: Props) {
  const [mode, setMode] = useState<Mode>('draw');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const emit = (c: HTMLCanvasElement) => {
    const t = trimmed(c);
    onChange(t ? toPng(t) : null);
  };

  const clear = () => {
    const c = canvas.current;
    c?.getContext('2d')!.clearRect(0, 0, W, H);
    onChange(null);
  };

  // Typed signatures re-render whenever the text changes.
  useEffect(() => {
    if (mode !== 'type' || !canvas.current) return;
    const c = canvas.current;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    if (!typed.trim()) {
      onChange(null);
      return;
    }
    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';
    let size = 96;
    do {
      ctx.font = `${size}px ${SCRIPT_FONTS}`;
      size -= 4;
    } while (ctx.measureText(typed).width > W - 24 && size > 24);
    ctx.fillText(typed, 12, H / 2);
    emit(c);
    // emit/onChange are stable enough for this purpose; re-run only on input changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, mode]);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
  };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(...point(e));
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.lineTo(...point(e));
    ctx.stroke();
  };
  const up = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    emit(e.currentTarget);
  };

  const upload = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / bitmap.width, 600 / bitmap.height);
      const c = document.createElement('canvas');
      c.width = Math.round(bitmap.width * scale);
      c.height = Math.round(bitmap.height * scale);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, c.width, c.height);
      bitmap.close();
      // A photo of a signature on paper: make the near-white paper transparent.
      const img = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const light = Math.min(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
        if (light > 200) img.data[i + 3] = 0;
      }
      ctx.putImageData(img, 0, 0);
      const preview = canvas.current?.getContext('2d');
      if (preview) {
        const fit = Math.min(W / c.width, H / c.height);
        preview.clearRect(0, 0, W, H);
        preview.drawImage(
          c,
          (W - c.width * fit) / 2,
          (H - c.height * fit) / 2,
          c.width * fit,
          c.height * fit,
        );
      }
      emit(c);
    } catch {
      setError('That image could not be read. Try a PNG or JPG.');
      onChange(null);
    }
  };

  return (
    <div className="sigmaker">
      <div className="segmented" role="radiogroup" aria-label="How to make your signature">
        {(['draw', 'type', 'upload'] as const).map((m) => (
          <label key={m} className="segment">
            <input
              type="radio"
              name="sig-mode"
              checked={mode === m}
              onChange={() => {
                setMode(m);
                setError('');
                clear();
              }}
            />
            <span>{m === 'draw' ? 'Draw' : m === 'type' ? 'Type' : 'Upload image'}</span>
          </label>
        ))}
      </div>
      {mode === 'type' && (
        <label className="field">
          <span>Your name</span>
          <input
            type="text"
            value={typed}
            maxLength={60}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="name"
          />
        </label>
      )}
      {mode === 'upload' && (
        <label className="field">
          <span>Signature image (PNG or JPG)</span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
      )}
      <canvas
        ref={canvas}
        width={W}
        height={H}
        className="sig-canvas"
        data-mode={mode}
        aria-label={
          mode === 'draw'
            ? 'Signature drawing area. Draw with a mouse, pen or finger.'
            : 'Signature preview'
        }
        role="img"
        onPointerDown={mode === 'draw' ? down : undefined}
        onPointerMove={mode === 'draw' ? move : undefined}
        onPointerUp={mode === 'draw' ? up : undefined}
        onPointerCancel={mode === 'draw' ? up : undefined}
      />
      {mode === 'draw' && (
        <button type="button" className="button button-quiet" onClick={clear}>
          Clear drawing
        </button>
      )}
      {error && (
        <p className="stamp stamp-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

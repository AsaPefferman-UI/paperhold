// Independent verification of outputs: re-open with pdf.js (a different parser than pdf-lib) and qpdf.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const pdfjsRoot = new URL('../node_modules/pdfjs-dist/', import.meta.url);

/** Render one page to RGBA pixels with pdf.js + @napi-rs/canvas (for golden tests). */
export async function renderPage(
  bytes: Uint8Array,
  pageNumber = 1,
  scale = 0.5,
): Promise<{ width: number; height: number; data: Uint8ClampedArray; png: Uint8Array }> {
  const task = getDocument({
    data: bytes.slice(),
    standardFontDataUrl: fileURLToPath(new URL('standard_fonts/', pdfjsRoot)).replaceAll('\\', '/'),
    verbosity: 0,
  });
  const doc = await task.promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const png = new Uint8Array(await canvas.encode('png'));
  await task.destroy();
  return { width: canvas.width, height: canvas.height, data: image.data, png };
}

/**
 * Compare a rendered page with a stored golden PNG. Set UPDATE_GOLDEN=1 to (re)write goldens.
 * Fails when more than `tolerance` of pixels differ by more than 32 on any channel.
 */
export async function expectMatchesGolden(
  rendered: { width: number; height: number; data: Uint8ClampedArray; png: Uint8Array },
  name: string,
  tolerance = 0.01,
): Promise<void> {
  const path = fileURLToPath(new URL(`./golden/${name}.png`, import.meta.url));
  if (process.env.UPDATE_GOLDEN || !existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, rendered.png);
    if (!process.env.UPDATE_GOLDEN && process.env.CI) throw new Error(`Missing golden ${name}`);
    return;
  }
  const { loadImage, createCanvas } = await import('@napi-rs/canvas');
  const img = await loadImage(readFileSync(path));
  expect([img.width, img.height], `${name} size`).toEqual([rendered.width, rendered.height]);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const golden = ctx.getImageData(0, 0, img.width, img.height).data;
  let diff = 0;
  for (let i = 0; i < golden.length; i += 4) {
    if (
      Math.abs(golden[i]! - rendered.data[i]!) > 32 ||
      Math.abs(golden[i + 1]! - rendered.data[i + 1]!) > 32 ||
      Math.abs(golden[i + 2]! - rendered.data[i + 2]!) > 32
    ) {
      diff++;
    }
  }
  expect(diff / (golden.length / 4), `${name} differing pixel ratio`).toBeLessThanOrEqual(
    tolerance,
  );
}

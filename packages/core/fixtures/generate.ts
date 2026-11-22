// Generates the fixture corpus into fixtures/corpus/. Run: pnpm fixtures
// Everything here is synthetic and created by this script (no third-party files),
// so the corpus is covered by the project's own license.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { PDFDocument, PDFHeader, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import { chromium } from '@playwright/test';
import { qpdf } from '../test/qpdf.ts';
import { CORPUS, ENCRYPTED_PASSWORD, SCANNED_TEXT } from './corpus.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'corpus');
mkdirSync(outDir, { recursive: true });
const FIXED_DATE = new Date('2024-01-01T00:00:00Z');

async function textDoc(pages: number, label = 'Hello from page'): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setTitle('pdf-tools fixture');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${label} ${i}`, { x: 72, y: 700, size: 24, font });
  }
  return doc;
}

const save = (doc: PDFDocument, objectStreams = true) =>
  doc.save({ useObjectStreams: objectStreams, updateFieldAppearances: true });

/** Tiny PNG encoder: RGB, filter 0. Noise on a gradient so it compresses badly as Flate. */
function png(width: number, height: number, seed: number): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let s = seed;
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s >> 16) & 0x0f;
      const i = row + 1 + x * 3;
      raw[i] = ((x / width) * 200 + n) | 0;
      raw[i + 1] = ((y / height) * 200 + n) | 0;
      raw[i + 2] = (120 + n) | 0;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Render printed-looking text to JPEG with a real browser, to stand in for a scan. */
async function scannedJpegs(): Promise<Uint8Array[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1275, height: 1650 } });
    const shots: Uint8Array[] = [];
    for (const text of SCANNED_TEXT) {
      await page.setContent(
        `<body style="margin:0;background:#f4f1ea;font:44px/1.5 Georgia,serif;color:#222">
           <div style="padding:180px 150px;transform:rotate(0.4deg)">${text
             .split('\n')
             .map((l) => `<p>${l}</p>`)
             .join('')}</div></body>`,
      );
      shots.push(await page.screenshot({ type: 'jpeg', quality: 80 }));
    }
    return shots;
  } finally {
    await browser.close();
  }
}

const files: Record<string, Uint8Array> = {};

files['simple.pdf'] = await save(await textDoc(3));
files['large-page-count.pdf'] = await save(await textDoc(1000, 'Page'));

{
  const doc = await textDoc(2, 'PDF 1.4 page');
  doc.context.header = PDFHeader.forVersion(1, 4);
  files['pdf-1.4.pdf'] = await save(doc, false);
}
{
  const doc = await textDoc(2, 'PDF 2.0 page');
  doc.context.header = PDFHeader.forVersion(2, 0);
  files['pdf-2.0.pdf'] = await save(doc);
}
{
  const doc = await textDoc(1, 'Form page');
  const form = doc.getForm();
  const page = doc.getPage(0);
  form.createTextField('full_name').addToPage(page, { x: 72, y: 600, width: 300, height: 24 });
  form.createCheckBox('agree').addToPage(page, { x: 72, y: 560, width: 18, height: 18 });
  const color = form.createDropdown('color');
  color.addOptions(['Red', 'Green', 'Blue']);
  color.addToPage(page, { x: 72, y: 510, width: 160, height: 24 });
  files['acroform.pdf'] = await save(doc);
}
{
  const doc = await textDoc(1, 'Annotated page');
  const page = doc.getPage(0);
  const ctx = doc.context;
  const link = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [72, 690, 300, 730],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.org/') },
    }),
  );
  const note = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [400, 690, 420, 710],
      Contents: PDFString.of('A sticky note'),
      Open: false,
    }),
  );
  page.node.set(PDFName.of('Annots'), ctx.obj([link, note]));
  files['annotations.pdf'] = await save(doc);
}
files['unicode-résumé-日本語.pdf'] = await save(await textDoc(2, 'Unicode file page'));
{
  const doc = await textDoc(0);
  for (let i = 0; i < 2; i++) {
    const image = await doc.embedPng(png(900, 1200, i + 1));
    const page = doc.addPage([612, 792]);
    page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
    page.drawText(`Image page ${i + 1}`, { x: 72, y: 72, size: 18, color: rgb(1, 1, 1) });
  }
  files['images.pdf'] = await save(doc);
}
{
  const doc = await textDoc(0);
  for (const jpg of await scannedJpegs()) {
    const image = await doc.embedJpg(jpg);
    doc.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  }
  files['scanned.pdf'] = await save(doc);
}
{
  const r = await qpdf(
    ['--encrypt', ENCRYPTED_PASSWORD, 'owner-pass', '256', '--', '/in.pdf', '/out.pdf'],
    { 'in.pdf': files['simple.pdf'] },
    ['out.pdf'],
  );
  if (r.code !== 0 || !r.files['out.pdf']) throw new Error(`qpdf encrypt failed: ${r.stderr}`);
  files['encrypted.pdf'] = r.files['out.pdf'];
}

// Malformed inputs.
{
  const simple = files['simple.pdf'];
  files['truncated.pdf'] = simple.slice(0, Math.floor(simple.length * 0.55));
  const plain = Buffer.from(await save(await textDoc(3), false));
  // Corrupt every xref offset and the startxref pointer; readers must recover or fail cleanly.
  const text = plain.toString('latin1').replace(/(\d{10}) (\d{5}) n/g, '9999999999 $2 n');
  files['broken-xref.pdf'] = Buffer.from(
    text.replace(/startxref\s+\d+/, 'startxref\n123456789'),
    'latin1',
  );
  files['not-a-pdf.pdf'] = Buffer.from('This is a text file pretending to be a PDF.\n');
  files['empty.pdf'] = new Uint8Array(0);
  // Deeply nested arrays: a classic parser-recursion bomb.
  const depth = 50_000;
  const nested = `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Bomb ${'['.repeat(depth)}${']'.repeat(depth)} >> endobj
trailer << /Root 1 0 R >>
%%EOF
`;
  files['nested-bomb.pdf'] = Buffer.from(nested, 'latin1');
}

for (const name of Object.keys(CORPUS)) {
  if (!files[name]) throw new Error(`corpus.ts lists ${name} but the generator did not make it`);
}
for (const [name, bytes] of Object.entries(files)) {
  if (!CORPUS[name]) throw new Error(`${name} is missing from corpus.ts`);
  writeFileSync(join(outDir, name), bytes);
  console.info(`${name.padEnd(32)} ${bytes.length} bytes`);
}

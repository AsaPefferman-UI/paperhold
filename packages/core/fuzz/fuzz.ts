// Mutation fuzzer: feeds mutated corpus files through every op. The only acceptable outcomes
// are a result or a typed PdfToolsError; anything else (TypeError, RangeError escaping,
// unhandled rejection, a hang past the time budget) is a failure and its input is saved.
//
//   pnpm fuzz                         short deterministic pass (CI)
//   FUZZ_ITERATIONS=5000 FUZZ_SEED=random pnpm fuzz    long pass (nightly)
//   FUZZ_SEED=1234 FUZZ_ONLY=compress pnpm fuzz         reproduce
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFixture } from '../fixtures/corpus.ts';
import { runOp } from '../src/dispatch.ts';
import { PdfToolsError } from '../src/errors.ts';
import type { OpArgs, OpContext, OpName } from '../src/protocol.ts';
import { nodeServices } from '../test/services.ts';
import { mutate, rng } from './mutate.ts';

const here = dirname(fileURLToPath(import.meta.url));

const ITERATIONS = Number(process.env.FUZZ_ITERATIONS ?? 40);
const SEED =
  process.env.FUZZ_SEED === 'random'
    ? Math.floor(Math.random() * 2 ** 31)
    : Number(process.env.FUZZ_SEED ?? 20241122);
const ONLY = process.env.FUZZ_ONLY?.split(',');
const TIME_BUDGET_MS = Number(process.env.FUZZ_TIMEOUT_MS ?? 15_000);

const PDFS = [
  'simple.pdf',
  'pdf-1.4.pdf',
  'pdf-2.0.pdf',
  'acroform.pdf',
  'annotations.pdf',
  'scanned.pdf',
  'broken-xref.pdf',
  'encrypted.pdf',
].map((name) => ({ name, bytes: readFixture(name) }));
const IMAGES = [
  'photo.jpg',
  'photo-exif-rotated.jpg',
  'graphic.png',
  'gradient.bmp',
  'pixel.gif',
].map((name) => ({
  name,
  bytes: readFixture(name),
}));
const SIGNATURE = readFixture('graphic.png');
const buf = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;
const ctx: OpContext = { progress: () => {}, services: nodeServices };

type Case = {
  op: OpName;
  input: 'pdf' | 'image';
  args: (file: { name: string; bytes: Uint8Array }) => OpArgs[OpName];
};

const CASES: Case[] = [
  {
    op: 'merge',
    input: 'pdf',
    args: (f) => ({
      files: [
        { name: f.name, bytes: buf(f.bytes) },
        { name: 'simple.pdf', bytes: buf(PDFS[0]!.bytes) },
      ],
    }),
  },
  {
    op: 'split',
    input: 'pdf',
    args: (f) => ({
      file: { name: f.name, bytes: buf(f.bytes) },
      mode: { kind: 'every', every: 1 },
    }),
  },
  {
    op: 'organize',
    input: 'pdf',
    args: (f) => ({
      file: { name: f.name, bytes: buf(f.bytes) },
      pages: [{ index: 0, rotate: 90 }],
    }),
  },
  {
    op: 'pageNumbers',
    input: 'pdf',
    args: (f) => ({
      file: { name: f.name, bytes: buf(f.bytes) },
      position: 'bottom-center',
      format: '{n} of {total}',
      startAt: 1,
      fontSize: 10,
    }),
  },
  {
    op: 'watermark',
    input: 'pdf',
    args: (f) => ({
      file: { name: f.name, bytes: buf(f.bytes) },
      text: 'DRAFT',
      fontSize: 48,
      opacity: 0.3,
      angle: 45,
      color: 'gray',
    }),
  },
  {
    op: 'compress',
    input: 'pdf',
    args: (f) => ({ file: { name: f.name, bytes: buf(f.bytes) }, preset: 'smallest' }),
  },
  {
    op: 'inspectForm',
    input: 'pdf',
    args: (f) => ({ file: { name: f.name, bytes: buf(f.bytes) } }),
  },
  {
    op: 'fillForm',
    input: 'pdf',
    args: (f) => ({ file: { name: f.name, bytes: buf(f.bytes) }, values: {}, flatten: true }),
  },
  {
    op: 'sign',
    input: 'pdf',
    args: (f) => ({
      file: { name: f.name, bytes: buf(f.bytes) },
      image: buf(SIGNATURE),
      placements: [{ page: 0, x: 0.5, y: 0.8, width: 0.3 }],
    }),
  },
  {
    op: 'protect',
    input: 'pdf',
    args: (f) => ({
      file: { name: f.name, bytes: buf(f.bytes) },
      userPassword: 'fuzz',
      allowPrinting: true,
      allowCopying: false,
      allowEditing: false,
    }),
  },
  {
    op: 'unlock',
    input: 'pdf',
    args: (f) => ({ file: { name: f.name, bytes: buf(f.bytes) }, password: 'correct horse' }),
  },
  {
    op: 'addTextLayer',
    input: 'pdf',
    args: (f) => ({
      file: { name: f.name, bytes: buf(f.bytes) },
      pages: [
        {
          index: 0,
          imageWidth: 100,
          imageHeight: 100,
          words: [{ text: 'fuzz', left: 1, top: 1, width: 10, height: 5, confidence: 90 }],
        },
      ],
    }),
  },
  {
    op: 'imagesToPdf',
    input: 'image',
    args: (f) => ({
      files: [{ name: f.name, bytes: buf(f.bytes), mime: '' }],
      pageSize: 'a4',
      margin: 36,
    }),
  },
];

async function withBudget<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`exceeded ${TIME_BUDGET_MS} ms`)), TIME_BUDGET_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Make console noise from parsers (pdf-lib warns on bad objects) not drown the report.
const quiet = () => {};
const { log, warn } = console;

const random = rng(SEED);
const crashes: { op: string; file: string; mutations: string[]; error: string; saved: string }[] =
  [];
let runs = 0;
const outcomes = { ok: 0, typed: 0 };
const codes: Record<string, number> = {};
const outDir = join(here, 'crashes');
const started = Date.now();
console.info(`fuzz: seed=${SEED} iterations=${ITERATIONS} ops=${ONLY?.join(',') ?? 'all'}`);

for (let i = 0; i < ITERATIONS; i++) {
  for (const c of CASES) {
    if (ONLY && !ONLY.includes(c.op)) continue;
    const pool = c.input === 'pdf' ? PDFS : IMAGES;
    const base = pool[Math.floor(random() * pool.length)]!;
    const other = pool[Math.floor(random() * pool.length)]!.bytes;
    const { bytes, applied } = mutate(base.bytes, random, other);
    runs++;
    // eslint-disable-next-line no-console -- silencing third-party parser warnings during the run
    console.log = quiet;
    console.warn = quiet;
    try {
      await withBudget(runOp(c.op, c.args({ name: base.name, bytes }) as never, ctx));
      outcomes.ok++;
    } catch (err) {
      if (err instanceof PdfToolsError) {
        outcomes.typed++;
        const key = `${c.op}:${err.code}`;
        codes[key] = (codes[key] ?? 0) + 1;
      } else {
        mkdirSync(outDir, { recursive: true });
        const saved = join(outDir, `${SEED}-${i}-${c.op}-${base.name}`);
        writeFileSync(saved, bytes);
        crashes.push({
          op: c.op,
          file: base.name,
          mutations: applied,
          error: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : String(err),
          saved,
        });
      }
    } finally {
      // eslint-disable-next-line no-console -- restore
      console.log = log;
      console.warn = warn;
    }
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (crashes.length) {
  console.error(`fuzz: ${crashes.length} untyped failure(s) in ${runs} runs (${secs}s):`);
  for (const c of crashes)
    console.error(
      `  ${c.op} <- ${c.file} [${c.mutations.join(', ')}]: ${c.error}\n    saved: ${c.saved}`,
    );
  writeFileSync(
    join(outDir, `${SEED}-report.json`),
    JSON.stringify({ seed: SEED, crashes }, null, 2),
  );
  process.exit(1);
}
if (process.env.FUZZ_VERBOSE) console.info(codes);
console.info(
  `fuzz: ${runs} runs (${outcomes.ok} succeeded, ${outcomes.typed} typed errors), 0 untyped failures (${secs}s). Reproduce with FUZZ_SEED=${SEED}.`,
);

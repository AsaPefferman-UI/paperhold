// Mutation fuzzer: feeds mutated corpus files through every op. The only acceptable outcomes
// are a result or a typed PdfToolsError. Anything else fails and its input is saved: an untyped
// error (TypeError, RangeError escaping), or a case that exceeds its time budget. Each case runs
// in a worker thread that is terminated on timeout, the same way the app's pool stops a runaway
// parser.
//
//   pnpm fuzz                                           short deterministic pass (CI)
//   FUZZ_ITERATIONS=3000 FUZZ_SEED=random pnpm fuzz     long pass (nightly)
//   FUZZ_SEED=1234 FUZZ_ONLY=compress pnpm fuzz         reproduce
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { readFixture } from '../fixtures/corpus.ts';
import type { OpArgs, OpName } from '../src/protocol.ts';
import type { CaseResult } from './fuzz-worker.ts';
import { mutate, rng } from './mutate.ts';

const here = dirname(fileURLToPath(import.meta.url));

const ITERATIONS = Number(process.env.FUZZ_ITERATIONS ?? 40);
const SEED =
  process.env.FUZZ_SEED === 'random'
    ? Math.floor(Math.random() * 2 ** 31)
    : Number(process.env.FUZZ_SEED ?? 20241122);
const ONLY = process.env.FUZZ_ONLY?.split(',');
const TIME_BUDGET_MS = Number(process.env.FUZZ_TIMEOUT_MS ?? 20_000);

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
].map((name) => ({ name, bytes: readFixture(name) }));
const SIGNATURE = readFixture('graphic.png');
const buf = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;

type FileIn = { name: string; bytes: Uint8Array };
type Case = { op: OpName; input: 'pdf' | 'image'; args: (f: FileIn) => OpArgs[OpName] };
const one = (f: FileIn) => ({ name: f.name, bytes: buf(f.bytes) });

const CASES: Case[] = [
  { op: 'merge', input: 'pdf', args: (f) => ({ files: [one(f), one(PDFS[0]!)] }) },
  { op: 'split', input: 'pdf', args: (f) => ({ file: one(f), mode: { kind: 'every', every: 1 } }) },
  {
    op: 'organize',
    input: 'pdf',
    args: (f) => ({ file: one(f), pages: [{ index: 0, rotate: 90 }] }),
  },
  {
    op: 'pageNumbers',
    input: 'pdf',
    args: (f) => ({
      file: one(f),
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
      file: one(f),
      text: 'DRAFT',
      fontSize: 48,
      opacity: 0.3,
      angle: 45,
      color: 'gray',
    }),
  },
  { op: 'compress', input: 'pdf', args: (f) => ({ file: one(f), preset: 'smallest' }) },
  { op: 'inspectForm', input: 'pdf', args: (f) => ({ file: one(f) }) },
  { op: 'fillForm', input: 'pdf', args: (f) => ({ file: one(f), values: {}, flatten: true }) },
  {
    op: 'sign',
    input: 'pdf',
    args: (f) => ({
      file: one(f),
      image: buf(SIGNATURE),
      placements: [{ page: 0, x: 0.5, y: 0.8, width: 0.3 }],
    }),
  },
  {
    op: 'protect',
    input: 'pdf',
    args: (f) => ({
      file: one(f),
      userPassword: 'fuzz',
      allowPrinting: true,
      allowCopying: false,
      allowEditing: false,
    }),
  },
  { op: 'unlock', input: 'pdf', args: (f) => ({ file: one(f), password: 'correct horse' }) },
  {
    op: 'addTextLayer',
    input: 'pdf',
    args: (f) => ({
      file: one(f),
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
    args: (f) => ({ files: [{ ...one(f), mime: '' }], pageSize: 'a4', margin: 36 }),
  },
];

let worker: Worker | undefined;
const workerUrl = new URL('./fuzz-worker.ts', import.meta.url);

/** Run one case in the worker; terminate and replace the worker if it exceeds the budget. */
function runCase(op: OpName, args: unknown): Promise<CaseResult | { outcome: 'hang' }> {
  worker ??= new Worker(workerUrl);
  const w = worker;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      w.removeAllListeners();
      void w.terminate();
      worker = undefined;
      resolve({ outcome: 'hang' });
    }, TIME_BUDGET_MS);
    w.once('message', (r: CaseResult) => {
      clearTimeout(timer);
      w.removeAllListeners('error');
      resolve(r);
    });
    w.once('error', (e) => {
      clearTimeout(timer);
      w.removeAllListeners('message');
      worker = undefined;
      resolve({ outcome: 'untyped', error: `worker crashed: ${String(e).slice(0, 200)}` });
    });
    w.postMessage({ op, args });
  });
}

const random = rng(SEED);
const failures: { op: string; file: string; mutations: string[]; error: string; saved: string }[] =
  [];
const outcomes = { ok: 0, typed: 0 };
const codes: Record<string, number> = {};
let runs = 0;
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
    const r = await runCase(c.op, c.args({ name: base.name, bytes }));
    if (r.outcome === 'ok') outcomes.ok++;
    else if (r.outcome === 'typed') {
      outcomes.typed++;
      codes[`${c.op}:${r.code}`] = (codes[`${c.op}:${r.code}`] ?? 0) + 1;
    } else {
      mkdirSync(outDir, { recursive: true });
      const saved = join(outDir, `${SEED}-${i}-${c.op}-${base.name}`);
      writeFileSync(saved, bytes);
      const error = r.outcome === 'hang' ? `exceeded ${TIME_BUDGET_MS} ms` : r.error;
      failures.push({ op: c.op, file: base.name, mutations: applied, error, saved });
      console.error(`  FAIL ${c.op} <- ${base.name} [${applied.join(', ')}]: ${error}`);
    }
  }
}
await worker?.terminate();

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (process.env.FUZZ_VERBOSE) console.info(codes);
if (failures.length) {
  console.error(
    `fuzz: ${failures.length} failure(s) in ${runs} runs (${secs}s); inputs saved in ${outDir}`,
  );
  writeFileSync(
    join(outDir, `${SEED}-report.json`),
    JSON.stringify({ seed: SEED, failures }, null, 2),
  );
  process.exitCode = 1;
} else {
  console.info(
    `fuzz: ${runs} runs (${outcomes.ok} succeeded, ${outcomes.typed} typed errors), 0 failures (${secs}s). Reproduce with FUZZ_SEED=${SEED}.`,
  );
}

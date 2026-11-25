// Lighthouse gate: Performance >= 90 and Accessibility = 100 on the landing page, the privacy
// page and every tool page, against the production build served by `pnpm preview`.
// Lighthouse is run with `npx` in an isolated cache, install scripts off (not a project dependency): it pulls in a telemetry package
// under a licence outside our allowlist, and it is a CI tool that never ships (ADR 0006).
//   pnpm build && pnpm preview &   then   node scripts/lighthouse.ts
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PAGES, TOOLS } from '../apps/web/src/tools.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:3103';
const LIGHTHOUSE = 'lighthouse@13.6.0';
const MIN = { performance: 0.9, accessibility: 1 };
const paths = (process.env.LH_PATHS?.split(',') ??
  [...PAGES, ...TOOLS].map((p) => p.path)) as string[];
const out = mkdtempSync(join(tmpdir(), 'lh-'));
// CHROME_PATH wins; otherwise Playwright's Chromium (same browser the e2e tests use).
const chrome = process.env.CHROME_PATH ?? chromium.executablePath();

const failures: string[] = [];
for (const path of paths) {
  const report = join(out, `${path === '/' ? 'home' : path.slice(1)}.json`);
  const args = [
    '--yes',
    `--package=${LIGHTHOUSE}`,
    '--',
    'lighthouse',
    `${BASE}${path}`,
    '--quiet',
    '--only-categories=performance,accessibility',
    '--output=json',
    `--output-path=${report}`,
    '--chrome-flags=--headless=new --no-sandbox',
  ];
  // On Windows the command goes through a shell, so quote arguments that contain spaces.
  const quoted =
    process.platform === 'win32' ? args.map((x) => (x.includes(' ') ? `"${x}"` : x)) : args;
  // Lighthouse sometimes crashes while tracing headless Chrome on CI runners (e.g. NO_NAVSTART).
  // Retry only those crashes; a completed run with low scores still fails below.
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync('npx', quoted, {
        stdio: ['ignore', 'ignore', 'inherit'],
        env: { ...process.env, CHROME_PATH: chrome, npm_config_ignore_scripts: 'true' },
        shell: process.platform === 'win32',
      });
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      console.warn(`Lighthouse crashed on ${path} (attempt ${attempt}/3); retrying.`);
    }
  }
  const lhr = JSON.parse(readFileSync(report, 'utf8')) as {
    categories: Record<string, { score: number | null }>;
    audits: Record<string, { score: number | null; title: string }>;
  };
  const perf = lhr.categories.performance?.score ?? 0;
  const a11y = lhr.categories.accessibility?.score ?? 0;
  const ok = perf >= MIN.performance && a11y >= MIN.accessibility;
  console.info(
    `${ok ? 'ok  ' : 'FAIL'} ${path.padEnd(16)} performance ${Math.round(perf * 100)}  accessibility ${Math.round(a11y * 100)}`,
  );
  if (!ok) {
    failures.push(path);
    for (const [id, a] of Object.entries(lhr.audits)) {
      if (a.score !== null && a.score < 0.9 && !id.includes('metric'))
        console.info(`       - ${id}: ${a.title} (${a.score})`);
    }
  }
}
if (failures.length) {
  console.error(`Lighthouse thresholds not met on: ${failures.join(', ')}`);
  process.exit(1);
}

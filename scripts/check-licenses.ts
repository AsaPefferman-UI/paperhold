// Fails if any installed dependency's license is outside the allowlist (STANDARDS §9).
import { execSync } from 'node:child_process';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'MPL-2.0',
  'LGPL-2.1',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'OFL-1.1',
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  // Permissive licenses equivalent to MIT/BSD (recorded in docs/adr/0002):
  '0BSD',
  'BlueOak-1.0.0',
  'Zlib',
]);

/** True if an SPDX expression is satisfied by the allowlist (handles AND / OR, no nesting). */
export function allowed(expr: string): boolean {
  const clean = expr.replace(/[()]/g, '').trim();
  return clean
    .split(/\s+OR\s+/)
    .some((alt) => alt.split(/\s+AND\s+/).every((id) => ALLOWED.has(id.trim())));
}

if (import.meta.main) {
  const pnpm = process.env.PNPM ?? 'pnpm';
  const out = execSync(`${pnpm} licenses list --json`, { encoding: 'utf8' });
  const byLicense = JSON.parse(out) as Record<string, { name: string; versions: string[] }[]>;
  const bad = Object.entries(byLicense).filter(([license]) => !allowed(license));
  for (const [license, pkgs] of bad) {
    console.error(`Disallowed license ${license}: ${pkgs.map((p) => p.name).join(', ')}`);
  }
  if (bad.length) process.exit(1);
  console.info(`Licenses OK: ${Object.keys(byLicense).join(', ')}`);
}

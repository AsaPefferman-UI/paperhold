# 0002: Toolchain versions and supply-chain controls

- Status: accepted
- Date: 2026-11-22

## Decision

- **pnpm 10.34.9**, pinned via `packageManager`. pnpm 11/12 exist, but 10.x has the documented
  `onlyBuiltDependencies` / `strictDepBuilds` behaviour SPEC.md asks for. pnpm is not installed
  on the build machine, so it runs through `npx pnpm@10.34.9` or `corepack pnpm` (CI uses
  `pnpm/action-setup`, which reads `packageManager`).
- **No install scripts**: `onlyBuiltDependencies: []` and `strictDepBuilds: true`. Native pieces
  (rolldown, lightningcss, @napi-rs/canvas) ship prebuilt optional packages and need none.
- **minimumReleaseAge 7 days** in `pnpm-workspace.yaml` and in Renovate: fresh releases are where
  hijacked packages land.
- **Exact versions** for every dependency, lockfile committed, `--frozen-lockfile` in CI.
- **TypeScript 6.0.3**, not 7.x: typescript-eslint 8 supports `<6.1`.
- **pdfjs-dist 6.x** (latest). pdf.js 6 has removed its `eval` code path entirely (the
  `isEvalSupported` option no longer exists), and we never load `pdf.sandbox` (no scripting).
  The CSP has no `'unsafe-eval'`, so any eval would be blocked regardless.
- **License allowlist** (`scripts/check-licenses.ts`, run in CI): the STANDARDS list plus three
  permissive licenses equivalent to MIT/BSD found in dev tooling: `0BSD` (tslib), `BlueOak-1.0.0`
  (minimatch) and `Zlib` (pako, dual with MIT).
- GitHub Actions pinned to commit SHAs; Renovate keeps the digests current; CodeQL,
  dependency review, `pnpm audit --audit-level=high`, gitleaks (full history) and Trivy (on the
  self-host image) run in CI. Socket.dev (or similar) is a GitHub App the owner must install;
  it cannot be configured from the repository.

## Consequences

Major-version upgrades arrive as reviewed Renovate PRs. pdf.js updates are grouped and flagged
as security-sensitive so they are reviewed and shipped quickly.

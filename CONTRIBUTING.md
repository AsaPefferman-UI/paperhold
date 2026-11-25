# Contributing

Thanks for helping. pdf-tools is free, private, and runs entirely in the browser; every change
must keep it that way.

## Setup

Requires Node 24 (see `.nvmrc`) and pnpm (the exact version is pinned in `package.json`; use
`corepack pnpm` or `npx pnpm@<version>` if you do not have it).

```sh
pnpm install
pnpm dev          # http://localhost:3103
pnpm test         # unit tests (Vitest)
pnpm build && pnpm test:e2e   # end-to-end tests against the production build
```

`pnpm fixtures` regenerates the synthetic PDF corpus in `packages/core/fixtures/corpus`.
`pnpm fuzz` runs the mutation fuzzer (`FUZZ_ITERATIONS`, `FUZZ_SEED`, `FUZZ_ONLY` to reproduce).
`pnpm lighthouse` checks performance and accessibility against a running `pnpm preview`.
`pnpm images` regenerates icons, Open Graph images and the landing screenshot (needs a preview).

## Layout

- `packages/core`: pure PDF operations and the worker message protocol. No DOM, no React.
  Every op is unit-tested in Node against the fixture corpus.
- `apps/web`: the Vite + React app. PDF work runs in Web Workers via `src/worker/pool.ts`.
- `docs/adr`: architecture decisions. Write one before adding a framework or a heavy dependency.

## Rules that CI enforces

- TypeScript strict, ESLint strict with zero warnings, Prettier.
- Unit coverage on `packages/core` at 80% or more.
- E2E: every test fails if a request leaves our origin, uses a method other than GET/HEAD, or
  carries a body over 1 KB, and if any CSP violation happens.
- `pnpm audit --audit-level=high`, gitleaks on full history, CodeQL, license allowlist.
- No install scripts: dependencies that need build scripts must be added to
  `onlyBuiltDependencies` in `pnpm-workspace.yaml` with a justification in the PR.

## Rules we review for

- No runtime requests to third-party hosts (no CDNs, fonts, or analytics beyond the one
  configurable origin). WASM and data files are self-hosted.
- Never render untrusted strings as HTML; file names and PDF metadata are untrusted.
- Heavy work belongs in a worker, with progress and cancel for anything over a second.
- Every failure the user can hit shows a human message with a way forward.

## Agent skills

Maintainers who build with Claude Code use four skills in `.claude/skills/` (not committed):
ponytail (smallest complete change), impeccable (tool UI), hallmark (landing pages) and the
Cloudflare security-audit skill. Get them from their upstream repositories; they are optional
for contributors.

## Commits and PRs

Small, focused PRs with tests. Describe user-visible changes in `CHANGELOG.md` under
"Unreleased". By contributing you agree your work is licensed under AGPL-3.0-only.

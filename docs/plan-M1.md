# Plan: M1 Foundation

## Scope

Vite app, worker protocol, CSP, CI, fixture corpus, deploy configuration (SPEC.md §13). Merge is
built here as the vertical slice that proves the stack end to end (worker, transfer, progress,
typed errors, download, CSP, network guard); the rest of the M2 tools follow in M2.

## Acceptance criteria and their tests

| #   | Criterion                                                                                                                                                                      | Automated test                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Workspace builds with strict TS, lint clean                                                                                                                                    | CI `pnpm typecheck`, `pnpm lint`                                                                                                                    |
| 2   | Core ops run through one typed dispatcher; unknown ops and bad args give typed errors                                                                                          | `packages/core/test/protocol.test.ts`                                                                                                               |
| 3   | Fixture corpus covers simple, scanned, encrypted, AcroForm, annotations, PDF 1.4 and 2.0, 1000 pages, Unicode filename, truncated, broken xref, not-a-PDF, empty, nesting bomb | `packages/core/test/corpus.test.ts` (each valid fixture re-opened with pdf.js and `qpdf --check`; malformed ones recover or fail with a typed code) |
| 4   | Merge output is valid, in order, keeps text                                                                                                                                    | `packages/core/test/merge.test.ts`                                                                                                                  |
| 5   | Worker pool: size `min(4, cores-1)`, queueing, timeout terminates worker, cancel, crash recovery                                                                               | `apps/web/src/worker/pool.test.ts`                                                                                                                  |
| 6   | Size limits: warn >200 MB, refuse >1 GB                                                                                                                                        | `protocol.test.ts`, `apps/web/src/lib/files.test.ts`                                                                                                |
| 7   | Strict CSP and security headers on every route                                                                                                                                 | `e2e/security.spec.ts`                                                                                                                              |
| 8   | CSP actually blocks exfiltration from injected code                                                                                                                            | `e2e/security.spec.ts`                                                                                                                              |
| 9   | No request leaves the origin or carries a body >1 KB during any e2e test; zero CSP violations                                                                                  | `e2e/fixtures.ts` guard (auto fixture) + guard self-test                                                                                            |
| 10  | Merge happy path, friendly error on damaged input, keyboard flow                                                                                                               | `e2e/merge.spec.ts`                                                                                                                                 |
| 11  | axe clean on every route and states                                                                                                                                            | `e2e/a11y.spec.ts`                                                                                                                                  |
| 12  | Coverage of `packages/core` >= 80%                                                                                                                                             | `pnpm test:coverage` thresholds                                                                                                                     |
| 13  | License allowlist enforced                                                                                                                                                     | `scripts/check-licenses.ts` + its unit test                                                                                                         |
| 14  | Self-host image and Pages deploy configured (not deployed)                                                                                                                     | CI `image` job (Trivy), `docs/deploy.md`                                                                                                            |

## Out of scope for M1

Service worker / offline (M6), thumbnails (M2), all tools other than merge.

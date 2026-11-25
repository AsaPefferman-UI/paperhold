# Security review (M6)

## How it was done

A full audit with the `security-audit` skill, **quick profile, source-only**, run on commit
`39c7878` by 11 sub-agents: 4 reconnaissance, 4 hunters (web policy, parsers, client state, supply
chain), 1 final coverage critic, and 2 independent verifiers. Its run files are outside the
repository, in `~/security-audit-skill/pdf-tools/run-1/`. They are `run-metadata.json`,
`architecture.md`, `coverage-ledger.json` (17 coverage units) and `findings.json`. Both skill
validators passed. On Windows, Node has no `O_NOFOLLOW`, so the validators were run with a
one-line `lstat` shim. The run records this.

The run is marked **incomplete**: the sub-agent was not permitted to write the three prose
reports (`REPORT.md`, `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`). Their content is summarised
here instead. The structured records (`findings.json`, coverage ledger) are complete.

## Results

**Confirmed findings: none.** In source-only mode the skill only confirms a finding when it has
a bounded, observed result. No source path showed a crossed trust boundary.

### Needs validation (no severity; both addressed in this repository)

| Lead | What was missing | Fix |
| --- | --- | --- |
| Any pushed `v*` tag could run the release build. That build holds `id-token` and `attestations` write and has no environment gate or `main` check. | Repository tag rules and environment protection live in GitHub settings, not in the repo. | `release.yml` build job now runs in a `release` environment (required reviewers; see `docs/LAUNCH.md`) and refuses tags whose commit is not on `main`. `docs/LAUNCH.md` adds tag protection rules. |
| Lighthouse is fetched with `npx` outside the lockfile, in a job that shared the pnpm cache with release builds. | Whether pnpm would reject tampered store content after a cache restore. | The Lighthouse job no longer uses the dependency cache (`ci.yml`), so it can never save one. |

### Hardening notes from the hunters (not findings), and what changed

| Note | Change |
| --- | --- |
| `compress` inflated image streams without an output cap (a "zip bomb" could allocate memory in the user's own tab) | Inflate into a buffer of exactly the declared image size; overflow leaves the image untouched. Test: `audit-regressions.test.ts` "inflates beyond its declared size". |
| A form field named `__proto__` could misbehave in the Fill form UI's value object | UI keeps values in a `Map` and sends `Object.fromEntries`. Test: "field literally named `__proto__`". |
| Opt-in Cloudflare analytics script has no SRI | Cloudflare changes the beacon without notice, so SRI would break it. It is off by default; when enabled, the CSP allows exactly its two hosts and the privacy page says so. Documented, not changed. |
| Service-worker "busy" guard is per tab | A second tab could accept an update while the first is busy. The update only takes effect on reload in each tab, and the waiting worker never swaps code in a running page. Documented. |

### Deferred coverage gap, now covered by tests

The critic noted that no unit checked whether Split, Organize, or Merge output (pdf-lib
`copyPages`) or a flattened form could keep data from removed pages or old field values. New
regression tests uncompress the outputs with qpdf (`--qdf`). They check that removed pages'
content is absent, and that a flattened form has no field dictionaries or stored values. See
`packages/core/test/audit-regressions.test.ts`.

## What the audit could not cover

- **No execution of project code** (the skill forbids it without an OS-enforced sandbox, which
  this machine lacks): unit/e2e/fuzz runs, the Docker image, and real-browser behaviour were not
  part of the audit. They are covered separately by the test suites and the fuzzer.
- **WASM internals** of qpdf, libheif (libde265, dav1d), tesseract/Leptonica and pdf.js.
- **Deployment configuration outside the repo**: Cloudflare Pages honouring `_headers`, GitHub
  rulesets and environments, API token scope, whether analytics is enabled.
- **Git history** before `39c7878`, and **dependency CVE lookups** (CI runs `pnpm audit`,
  dependency review and CodeQL instead).

## Other M6 hardening

- Fuzzer: mutated corpus PDFs and images through all 13 ops. Only typed errors are allowed,
  and each case runs in a worker thread that is killed after 20 s (`pnpm fuzz`, nightly with
  random seeds). Findings, all fixed with regression fixtures in
  `packages/core/fixtures/regressions/`:
  - **Hang (DoS of the user's own tab):** a cross-reference stream with `/W [1 2 999999999]`
    made pdf-lib spin. `preflight()` now rejects absurd xref field widths and entry counts
    before parsing.
  - **Hang:** a PNG whose image data is truncated made pdf-lib's PNG decoder spin.
    `validatePng()` now checks the chunk structure and that the data inflates to exactly the
    declared size before embedding.
  - `protect` now repairs slightly damaged files with pdf-lib before retrying qpdf.
  In the browser these hangs were already bounded by the worker pool's 5-minute timeout, which
  terminates the worker; they now fail in milliseconds with a clear message.
- Release workflow refuses to ship while `apps/web/site.config.ts` holds placeholders.

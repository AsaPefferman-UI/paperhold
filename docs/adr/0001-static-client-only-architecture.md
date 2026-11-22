# 0001: Static, client-only architecture (Vite + React, no Next.js, no backend)

- Status: accepted
- Date: 2026-11-22

## Context

STANDARDS.md defaults to Next.js with a server, Postgres, Redis and Docker deploys. SPEC.md
overrides this: every file operation must run in the browser, there are no accounts and no
uploads, and hosting should be a static CDN.

## Decision

- Vite + React + TypeScript (strict) producing a static build. No Next.js and no server code.
- A pnpm workspace: `packages/core` holds pure PDF operations plus the typed worker protocol
  (`{ type: 'run', id, op, args }` in, `progress` / `done` / `error` out) and is unit-tested in
  Node; `apps/web` holds the UI and the worker pool.
- `@pdf-tools/core` (types, errors, limits) is the only entry the page imports;
  `@pdf-tools/core/run` (pdf-lib and friends) is imported only by the worker, so PDF libraries
  never land in the page bundle.
- Worker pool sized `min(4, max(1, cores - 1))`. Each job has a timeout; timeout or cancel
  terminates the worker (the only reliable way to stop a runaway parser). Input buffers are
  transferred, never cloned.
- Client-side router (about 30 lines) instead of a routing dependency. The build writes one
  HTML file per tool with its own title and description, so each tool is its own crawlable URL.
- Security headers are defined once in `apps/web/security-headers.ts` and emitted as Cloudflare
  Pages `_headers`, used by `vite preview` (so e2e tests run against the real CSP), and turned
  into the nginx config of the self-host image.
- Validation: worker messages are internal (same origin, our own code), so no Zod; the real
  untrusted input is PDF bytes, which go through `loadPdf` (magic-byte check, typed errors,
  page cap) and `guard` (any parser exception becomes a typed `damaged` error).

## Consequences

- Backend sections of STANDARDS (auth, tenancy, IDOR, rate limits, DB migrations, k6 load tests,
  runbooks for server alerts) do not apply; SPEC.md says so explicitly.
- `docker compose up` still works (nginx-unprivileged serving the build) to satisfy STANDARDS
  section 9 self-hosting, and CI scans that image with Trivy.
- The privacy claim becomes testable: no endpoint exists to receive files, and the CSP forbids
  connecting anywhere else.

# Engineering Standards (applies to every product spec)

Every spec in `specs/` inherits this document. When a spec is silent, this document governs. When a spec conflicts with this document, the spec wins **only** if it says so explicitly.

The bar: these products are free, public, and will be attacked and abused on day one. They must be secure by default, survive traffic spikes (a viral launch), and never ship a broken build.

---

## 1. Default stack

Use boring, well-supported technology. Do not introduce a new language, database, or framework without writing an ADR (`docs/adr/NNNN-title.md`) explaining why.

| Concern                      | Default                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language                     | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true`                                                                                                            |
| Runtime                      | Node.js current LTS, pinned in `.nvmrc` and `engines`                                                                                                                   |
| Package manager              | pnpm, lockfile committed, `pnpm install --frozen-lockfile` in CI                                                                                                        |
| Web app                      | Next.js (App Router) with server components; API via route handlers                                                                                                     |
| Validation                   | Zod at every trust boundary (HTTP input, env vars, webhooks, queue payloads, DB JSON columns)                                                                           |
| Database                     | PostgreSQL (managed: Neon, Supabase, RDS, or Crunchy). Drizzle ORM + SQL migrations                                                                                     |
| Cache / rate limits          | Redis (managed, e.g. Upstash)                                                                                                                                           |
| Background jobs              | pg-boss (Postgres-backed) unless the spec requires high-throughput queues, then BullMQ on Redis                                                                         |
| Object storage               | S3-compatible (Cloudflare R2 preferred: zero egress fees)                                                                                                               |
| Auth                         | Better Auth (or equivalent maintained library). Passkeys + email magic link. No custom crypto                                                                           |
| Email                        | AWS SES or Resend, behind an `EmailProvider` interface                                                                                                                  |
| Payments (only where needed) | Stripe; card data never touches our servers                                                                                                                             |
| Bot protection               | Cloudflare Turnstile on signup and on any anonymous write endpoint                                                                                                      |
| Observability                | OpenTelemetry traces + structured JSON logs (pino) + Sentry for errors                                                                                                  |
| Tests                        | Vitest (unit), Testcontainers Postgres/Redis (integration), Playwright (e2e)                                                                                            |
| Load tests                   | k6 scripts in `load/`                                                                                                                                                   |
| CI                           | GitHub Actions                                                                                                                                                          |
| Deploy                       | Docker image (multi-stage, distroless or `node:lts-slim`, non-root user). Fly.io, Render, or AWS ECS. Infra as code (Terraform or the platform's config file) committed |
| CDN / edge                   | Cloudflare in front of everything                                                                                                                                       |

## 2. Repository layout

```
/apps/web            Next.js app (UI + API)
/apps/worker         background job runner (same codebase, separate process)
/packages/core       domain logic, pure functions, no framework imports
/packages/db         Drizzle schema, migrations, query helpers
/packages/config     zod-validated env loader (process exits on invalid config)
/load                k6 scripts
/docs/adr            architecture decision records
/docs/runbooks       one runbook per alert
/infra               Terraform / platform config
```

Domain logic lives in `packages/core` and is unit-tested without a database or network.

## 3. Security requirements (non-negotiable)

Target: OWASP ASVS Level 2.

### 3.1 Authentication and sessions

- Passkeys (WebAuthn) and email magic links. If passwords are ever added: Argon2id, breached-password check (HIBP k-anonymity API), min length 12, no composition rules.
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix, rotated on login and privilege change, absolute timeout 30 days, idle timeout 7 days.
- Magic links: single use, 15-minute expiry, bound to the requesting browser via a cookie nonce, hashed at rest.
- Optional TOTP 2FA for account owners; required for admin accounts.
- Account enumeration: login/signup/reset responses must be identical whether or not the account exists.

### 3.2 Authorization

- Every resource row has an `owner_id` and/or `workspace_id`. **Every** query that reads or writes a resource filters by the caller's scope. Write a helper (`scopedDb(ctx)`) so unscoped queries are hard to write.
- Enable Postgres Row Level Security as defense in depth for multi-tenant tables.
- Public share links use 128-bit random IDs (base62, ≥22 chars), never sequential IDs. Internal IDs are UUIDv7.
- Write an integration test for each resource type proving user A cannot read, update, or delete user B's resource (IDOR tests).

### 3.3 Input and output

- Validate all input with Zod; reject unknown keys (`.strict()`).
- Parameterized queries only (Drizzle does this; raw SQL must use `sql` template tags).
- Render user content as text. If rich text is needed, sanitize with DOMPurify server-side against an allowlist.
- Content Security Policy: nonce-based `script-src`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors` explicitly set. Plus HSTS (preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal.
- CSRF: SameSite cookies + origin check on all state-changing requests.

### 3.4 Files and uploads

- Upload directly to object storage via short-lived presigned URLs (≤5 minutes) with size and content-type constraints in the policy.
- Verify file type by magic bytes after upload, not by extension or client header.
- Scan uploads with ClamAV (worker job) before they become publicly accessible. Quarantine on detection.
- Serve user content from a **separate registrable domain** (e.g. `usercontent-example.com`) so it can never execute script on the app origin. Set `Content-Disposition` appropriately.
- Strip EXIF/metadata from images unless the user opts in.

### 3.5 Outbound requests (SSRF)

- Any server-side fetch of a user-supplied URL goes through a single `safeFetch` helper: resolve DNS, block private/loopback/link-local/metadata ranges (IPv4 and IPv6), re-check after redirects, max 3 redirects, 10s timeout, 10 MB cap.

### 3.6 Webhooks

- Outgoing: HMAC-SHA256 signature over `timestamp.body`, timestamp header, receivers told to reject >5 minutes skew. Retry with exponential backoff, dead-letter after 24h.
- Incoming (Stripe, etc.): verify signature before parsing, store event ID for idempotency.

### 3.7 Secrets and data

- Secrets only in the platform secret store. Never in the repo, never in logs. `gitleaks` runs in CI and as a pre-commit hook.
- Encrypt sensitive columns (OAuth tokens, API keys for third parties) with envelope encryption (KMS or libsodium secretbox with a key from the secret store). API keys we issue are shown once and stored as SHA-256 hashes.
- TLS everywhere, including DB connections (`sslmode=verify-full`).
- Logs: never log tokens, cookies, full emails, file contents, or request bodies by default. Use a redaction list in pino.
- Data deletion: users can delete their account; hard-delete within 30 days, including object storage. Document retention in `docs/data-retention.md`.

### 3.8 Abuse prevention (free products attract abuse)

Every spec has an "Abuse" section; implement it. The baseline:

- Turnstile on signup and anonymous writes.
- Per-IP, per-account, and per-workspace rate limits (sliding window in Redis). Return `429` with `Retry-After`.
- Quotas per free account (storage, requests, sends). Quotas are config, not code.
- Email verification before any feature that sends email or hosts public content.
- Report-abuse link on every public page; admin queue to review and take down.
- Kill switch: admins can disable an account or a public link instantly, and the change takes effect at the CDN within 60 seconds (purge cache).
- Check public URLs against Google Safe Browsing on creation and periodically.

### 3.9 Supply chain

- Dependabot (or Renovate) weekly, grouped. `pnpm audit --audit-level=high` fails CI.
- CodeQL on every PR. Container image scanned with Trivy; fail on HIGH/CRITICAL with a fix available.
- Pin GitHub Actions to commit SHAs.
- Minimize dependencies; justify any new one with >50 transitive deps in the PR description.

### 3.10 Admin and audit

- Admin panel behind separate role, 2FA required, IP allowlist optional.
- Append-only `audit_log` table for security-relevant events (login, permission change, deletion, admin action, API key creation).

## 4. Scalability requirements

- App servers are stateless; any instance can serve any request. Sessions in DB/Redis, files in object storage.
- Scale to **at least 2 instances** in production from day one (proves statelessness, removes single point of failure).
- Anything slower than ~300ms or calling a third party goes to a background job.
- Every list endpoint is paginated (cursor-based, max page size 100).
- Every query used in a hot path has an index; `EXPLAIN ANALYZE` reviewed for new queries on tables expected to exceed 1M rows.
- Connection pooling (PgBouncer or the provider's pooler). App pool size is config.
- Public, read-heavy pages (share pages, status pages, link redirects) are served from CDN cache with explicit `Cache-Control` and purge-on-change.
- High-volume write paths (analytics events, clicks, views) are buffered: write to Redis stream or queue, batch-insert to Postgres every few seconds. Never one synchronous DB insert per pageview at scale.
- Analytics tables are partitioned by month (Postgres native partitioning) with a retention job.
- Each spec states its load target; a k6 script in `load/` proves it before launch.

## 5. Reliability requirements

- **SLO**: 99.9% monthly availability for core flows; p95 latency targets per spec.
- `/healthz` (process alive) and `/readyz` (DB and Redis reachable) endpoints.
- Graceful shutdown: on SIGTERM stop accepting, drain in-flight requests and jobs (30s), then exit.
- Timeouts on **every** outbound call (DB statement timeout 5s default, HTTP 10s). No unbounded waits.
- Retries only for idempotent operations, exponential backoff with jitter, max attempts set.
- Idempotency keys on any POST that creates something with side effects (payments, sends, signups).
- Jobs are idempotent and safe to run twice. Use unique job keys to prevent duplicates.
- Migrations: expand/contract only. Never drop or rename a column in the same deploy that stops using it. Migrations run as a separate release step, not on app boot.
- Backups: point-in-time recovery enabled; a monthly automated restore test to a scratch DB that runs a smoke query.
- Third-party outages degrade gracefully (queue and retry email; show cached data) instead of failing the request.
- Feature flags for risky features; can be turned off without a deploy.
- Alerts (on error rate, latency, queue depth, job failures, disk) each link to a runbook in `docs/runbooks/`.

## 6. Build and release quality

CI runs on every PR and must be green to merge. Branch protection on `main`.

Pipeline (fail fast, in this order):

1. `pnpm install --frozen-lockfile`
2. Typecheck (`tsc --noEmit`)
3. Lint (ESLint with `@typescript-eslint/strict`, no warnings allowed) + Prettier check
4. Unit tests (Vitest), coverage ≥ 80% on `packages/core`
5. Integration tests against real Postgres/Redis via Testcontainers
6. Build the production Docker image
7. E2E tests (Playwright) against the built image with a seeded DB
8. Security: gitleaks, `pnpm audit`, CodeQL, Trivy
9. Migration check: apply all migrations to an empty DB and to a copy of the previous schema

Release:

- Merges to `main` deploy to staging automatically; production deploy is a promoted image (same digest), never a rebuild.
- Zero-downtime rolling deploys; health-checked; automatic rollback if `/readyz` fails or error rate spikes.
- Every PR gets a preview environment when the platform supports it.
- Env vars validated at boot by `packages/config`; the process refuses to start if config is invalid.
- No `any`, no `@ts-ignore` without a linked issue, no `console.log` in committed code.
- Flaky tests are quarantined and fixed within a week, never retried until green.

## 7. Cost guardrails (keeping it free)

- Prefer client-side processing (WebAssembly, WebGPU, browser APIs) when it removes server cost without hurting security.
- Every resource that costs money per unit (storage, email, bandwidth, compute minutes) has a per-account quota and a global daily budget alarm.
- Billing alerts on every cloud account. Hard caps where the provider supports them.
- Monetization (if added later): optional paid tier for higher limits, custom domains, or teams. Never put security features behind a paywall.

## 8. Accessibility and UX

- WCAG 2.2 AA. Keyboard navigable, visible focus, labeled inputs, color contrast checked. Axe runs in Playwright tests.
- Works on mobile at 375px width.
- No dark patterns. Clear data export (JSON/CSV) for everything a user creates.

## 9. Open source

Every product is developed in public. Assume every line, commit, and issue will be read by attackers and contributors alike.

- **License: AGPL-3.0-only** (`LICENSE` at the root, SPDX `"license": "AGPL-3.0-only"` in every `package.json`). AGPL keeps hosted forks open, matches comparable open-source SaaS alternatives, and makes AGPL dependencies (Ghostscript, MuPDF) usable. Every dependency's license must be compatible; add `license-checker` (or equivalent) to CI with an allowlist (MIT, ISC, BSD-2/3, Apache-2.0, MPL-2.0, LGPL, AGPL/GPL-3.0, OFL for fonts, CC0/CC-BY for data) and fail on anything else.
- Root files: `README.md` (what it is, screenshot, self-host in ≤5 commands), `LICENSE`, `SECURITY.md` (private vulnerability reporting via GitHub Security Advisories, supported versions, response time target), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant), `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`, `CHANGELOG.md` (Keep a Changelog).
- **Self-hostable**: `docker compose up` brings up the whole product with documented env vars in `.env.example` (no real values). Managed-cloud specifics (Cloudflare, Fly.io) are adapters, not hard requirements.
- No secrets, internal URLs, customer data, or personal info in the repo or git history, ever. gitleaks runs on full history in CI.
- Security through design, never obscurity: assume attackers read the code. Rate limits, quotas, and abuse heuristics are configurable so the hosted instance can tune values in its environment.
- CI must pass on forks without secrets (secret-dependent jobs skip cleanly on fork PRs; never use `pull_request_target` with checkout of PR code).
- Sign release tags and publish build provenance (GitHub artifact attestations / SLSA) for Docker images and static builds.
- Third-party code or assets copied into the repo keep their license file and are listed in `THIRD_PARTY_NOTICES.md`.

## 10. Agent skills

Builders using Claude Code have four skills in `.claude/skills/` (not committed; see `CONTRIBUTING.md` for sources). Use each for its job:

| Skill                           | Use it for                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ponytail** (level `full`)     | All coding: the smallest complete change, no speculative abstractions, no unneeded dependencies. The spec and this document define "what was asked"; ponytail never cuts a requirement, a test, or a security control from them |
| **impeccable**                  | All app UI (Operate surfaces: dashboards, editors, settings, viewers). Run `init` once to write `PRODUCT.md`, build with it, and run `audit` then `polish` on every UI surface before a milestone is done                       |
| **hallmark**                    | New marketing and landing pages only (Persuade surfaces). Never invent metrics, testimonials, or logos                                                                                                                          |
| **security-audit** (Cloudflare) | Guidance mode while building anything on a trust boundary (auth, uploads, share links, SSRF, parsers, payments). A full audit at the hardening milestone, with output written outside the repo                                  |

When skills disagree: the spec wins, then this document, then the skill.

## 11. Definition of done (per milestone)

- [ ] All acceptance criteria in the spec pass, each covered by an automated test
- [ ] CI green, including security scans
- [ ] IDOR tests for every new resource type
- [ ] Rate limits and quotas configured for every new endpoint
- [ ] Runbook written for every new alert
- [ ] k6 load target met (for launch milestone)
- [ ] README updated: local setup in ≤5 commands, `docker compose up` for dependencies
- [ ] Threat model section of the spec reviewed and any new threat added

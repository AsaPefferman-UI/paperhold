## What and why

## How it was tested

- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] `pnpm build && pnpm test:e2e` pass (network guard and CSP check included)
- [ ] New behaviour has a test; new tool has an e2e happy path and an axe check

## Privacy and security

- [ ] No new network destinations, CDNs, or runtime third-party hosts
- [ ] No `dangerouslySetInnerHTML`; filenames and PDF metadata rendered as text
- [ ] New dependency? License is on the allowlist, and if it has >50 transitive deps, justify it here

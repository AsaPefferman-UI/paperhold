# Deploying

pdf-tools is a static site. `pnpm build` writes everything to `apps/web/dist`:

- `index.html`, one `<tool>/index.html` per tool route (own title and description for search),
  `404.html`, and hashed assets under `assets/`.
- `_headers`: the Content Security Policy and other security headers in Cloudflare Pages format,
  generated from `apps/web/security-headers.ts` (the single source of truth).
- `sitemap.xml` when `VITE_SITE_URL` is set.

## Cloudflare Pages (the hosted instance)

Nothing in this repository deploys by itself. To enable it, the owner:

1. Creates a Pages project (direct upload, no Git integration, so only CI can deploy).
2. Protects the Cloudflare account with hardware-key 2FA.
3. In GitHub, creates a `production` environment with required reviewers, then sets:
   - secrets `CLOUDFLARE_API_TOKEN` (Pages:Edit only) and `CLOUDFLARE_ACCOUNT_ID`;
   - variables `PAGES_PROJECT`, `SITE_URL`, and `DEPLOY_OWNER` (the repository owner).
4. Protects `main` (required reviews, required CI checks) and signs release tags.

Pushing a signed `v*` tag then runs `.github/workflows/release.yml`: build once, publish
`SHA256SUMS` and SLSA provenance on the GitHub release, and deploy that exact artifact.

## Verifying a deployment

Anyone can check the live site matches a release:

```sh
gh attestation verify pdf-tools-site.tar.gz --repo <owner>/<repo>
curl -sI https://<site>/ | grep -i content-security-policy
```

and compare deployed asset hashes with the release's `SHA256SUMS`.

## Other hosts

Serve `dist/` with the headers from `_headers` (or run the Docker image, whose nginx config is
generated from the same source). Requirements: `try_files $uri $uri/index.html`, `404.html` for
unknown paths, `application/wasm` MIME type, and long immutable caching for `assets/`.

# Runbook: deploy, verify, roll back

The site is static. A release is a signed `v*` tag. CI builds it once, publishes hashes and
provenance, and deploys that exact artifact to Cloudflare Pages through the protected
`production` environment. Nobody deploys from a laptop.

## Release

1. Make sure `main` is green (CI: check, e2e ×3, Lighthouse, security, image).
2. Update `CHANGELOG.md`: move "Unreleased" under the new version and date. Merge that PR.
3. Tag the merge commit and push the tag:
   ```sh
   git tag -s v1.2.3 -m "v1.2.3"
   git push origin v1.2.3
   ```
4. In GitHub Actions → Release, approve the `release` environment (build), then the
   `production` environment (deploy).
5. The build fails early if `apps/web/site.config.ts` still has placeholders, or if the tag is
   not on `main`.

## Verify after deploy (2 minutes)

```sh
curl -sI https://<your-domain>/ | grep -i content-security-policy   # strict CSP present
curl -sI https://<your-domain>/merge | grep -i x-frame-options       # headers on routes too
curl -s -o /dev/null -w '%{http_code}\n' https://<your-domain>/nope  # 404
curl -s https://<your-domain>/sw.js | head -8                        # new VERSION string
```

Then open the site, run Merge, and follow `/privacy` step 1 (Network tab: no uploads).
Optional: compare deployed files with the release's `SHA256SUMS`, and run
`gh attestation verify paperhold-site.tar.gz --repo <owner>/<repo>`.

## Roll back

Cloudflare dashboard → Workers & Pages → the project → Deployments → pick the previous
production deployment → **Rollback**. This takes seconds and needs no CI run. Then fix forward
with a new tag.

Users with the service worker keep the version they have until a new one is published and they
press "Reload for update". A rollback is a new version for them, so they will be prompted.

## If something is wrong with the privacy promise

Treat any report that a file or file name leaves the browser as a critical security incident:
roll back first, then investigate (`SECURITY.md`). Check the deployed `_headers` and that
`connect-src` is `'self'` (plus the Cloudflare analytics host only if analytics are enabled).

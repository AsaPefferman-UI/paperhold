# Launch checklist (for the owner)

Everything in the repository is ready; these steps need your accounts and decisions. Do them in
order. Each one says exactly what to do and how to know it worked.

**Progress (November 2026):** steps 1-3 and 5 are done (name Paperhold, `site.config.ts`,
`wrangler.toml`, images regenerated, `check:launch` passes). Step 6 is done (public repo
`AsaPefferman-UI/paperhold`, commits use a GitHub no-reply email) and step 7 is done (CI green).
paperhold.app is registered (Porkbun). Step 8 repository settings and step 14 environments and
variables are applied (only the Renovate app and the two Cloudflare secrets are left for you).
Next: move the domain's nameservers to Cloudflare, then step 4 (mailboxes), steps 9-13, and the
two secrets in step 14.

## A. Name, domain and contacts

1. **Choose the product name and domain.** Buy the domain (any registrar; Cloudflare Registrar
   keeps DNS in the same place as hosting).
2. **Edit `apps/web/site.config.ts`** (the only file to change):
   - `name`: product name (shown in the header, titles, manifest, social images).
   - `url`: `https://<your-domain>` with no trailing slash.
   - `repoUrl`: `https://github.com/<owner>/<repo>` (AGPL: users must be able to get the source).
   - `contact.security` and `contact.conduct`: real mailboxes you read (step 4).
   - Leave `analytics: { provider: 'none' }` unless you decide otherwise in step 13.
3. **Rename the Cloudflare project** in `wrangler.toml` (`name = "<pages-project>"`).
4. **Create the two mailboxes** (for example with Cloudflare Email Routing forwarding
   `security@` and `conduct@` to you). Send yourself a test mail to each.
5. **Regenerate the images and check the config:**
   ```sh
   corepack pnpm install
   corepack pnpm build && corepack pnpm preview      # leave running
   corepack pnpm images                              # second terminal
   corepack pnpm check:launch                        # must print "Launch config OK"
   corepack pnpm build && corepack pnpm test:e2e
   ```
   Commit the changed files (`site.config.ts`, `wrangler.toml`, `apps/web/public/{icons,og,landing}`,
   `docs/screenshot-merge.png`).

## B. Repository

6. **Create the GitHub repository** (public), add it as the remote and push `main`:
   ```sh
   git remote add origin git@github.com:<owner>/<repo>.git
   git push -u origin main
   ```
7. **First CI run.** Open Actions and watch the CI workflow on `main`. Expected jobs: check,
   e2e (chromium, firefox, webkit), lighthouse, security, image, plus CodeQL. If anything fails,
   download its artifact (Playwright report or fuzz crashes) and fix before continuing. Firefox
   and the Docker image have only ever run in CI, so look at those first.
8. **Repository settings:**
   - Settings → Code security: enable **Private vulnerability reporting**, **Dependabot alerts**,
     and **Secret scanning with push protection**.
   - Settings → Rules → Rulesets → **branch** ruleset `main` (applied): changes reach `main` only
     through a pull request, with **0 required approvals** (a sole maintainer cannot approve their
     own PR; raise it once there is a second maintainer), the eight CI checks must pass
     (`Typecheck, lint, unit tests, fuzz, build`, `E2E (chromium|firefox|webkit)`, `Lighthouse`,
     `Security`, `Self-host image`, `analyze`), no force pushes, no deletion. `dependency-review`
     runs on every PR but is not required. No bypass: to push directly in an emergency, disable
     the ruleset temporarily.
   - Rulesets → **tag** ruleset `release tags` (applied) for `v*`: only repository admins may
     create, move or delete them. GitHub rulesets cannot verify tag signatures; signing is step 9,
     and the tag shows as Verified on GitHub once your key is added.
   - Install the **Renovate** GitHub App for this repository (config is in `renovate.json`).
   - Optional: install **Socket.dev** (or similar) for dependency review on pull requests.
9. **Signed tags:** set up a GPG or SSH signing key for your Git user
   (`git config --global user.signingkey ...`, `git config --global tag.gpgSign true`) and add
   the public key to GitHub.

## C. Cloudflare Pages

10. **Cloudflare account** with **hardware-key 2FA** (Security Keys) on every member.
11. **Create the Pages project:** Workers & Pages → Create → Pages → **Direct Upload**, name it
    as in `wrangler.toml`. Do not connect Git: only CI deploys. Add your custom domain under
    the project's Custom domains, and enable "Always Use HTTPS" for the zone. Leave Cloudflare
    Web Analytics **automatic injection off** (it would be blocked by the CSP anyway).
12. **API token:** My Profile → API Tokens → Create → template "Edit Cloudflare Workers" or a
    custom token with only **Account → Cloudflare Pages → Edit**, limited to your account. Note
    your Account ID (right sidebar of the account home).
13. **Analytics (optional, default off).** To count page views: Cloudflare → Web Analytics →
    Add a site → manual setup, and copy the beacon **token**. You will set it as
    `SITE_CF_ANALYTICS_TOKEN` (step 14). The CSP then allows exactly `static.cloudflareinsights.com`
    and `cloudflareinsights.com`, and `/privacy` says analytics are on. Skip this to stay at zero
    third-party requests.

## D. GitHub environments, variables and secrets

14. Settings → Environments:
    - **`release`**: required reviewer = you. (Gates the build that signs provenance.)
    - **`production`**: required reviewer = you; deployment branches and tags = `v*` tags only.
      Add secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
    Settings → Secrets and variables → Actions → **Variables**:
    - `DEPLOY_OWNER` = your GitHub user or organisation (deploys run only in your repository).
    - `PAGES_PROJECT` = the Pages project name.
    - `SITE_URL` = `https://<your-domain>` (optional if set in `site.config.ts`).
    - `SITE_CF_ANALYTICS_TOKEN` = beacon token, only if you chose analytics in step 13.

## E. First release

15. Update `CHANGELOG.md` (move Unreleased under `1.0.0`), merge, then:
    ```sh
    git tag -s v1.0.0 -m "v1.0.0" && git push origin v1.0.0
    ```
    Approve `release`, then `production`, in the Actions run.
16. **Verify** with `docs/runbooks/deploy.md` ("Verify after deploy"): CSP header, 404, `/privacy`,
    a Merge run with the Network tab open, and the offline check (load once, go offline, Merge).
17. **Manual release check (SPEC §12.1):** open one output of each tool in Adobe Acrobat
    Reader, Chrome and macOS Preview. Convert one real iPhone HEIC photo with Images to PDF, and
    OCR one real 300 DPI scan. Note anything odd as an issue.
18. **Search engines (optional):** add the domain in Google Search Console and Bing Webmaster
    Tools and submit `https://<your-domain>/sitemap.xml`.

## F. After launch

19. Watch the **Nightly fuzz** workflow and Renovate PRs weekly. Treat pdf.js updates as
    security updates.
20. Keep `SECURITY.md` response targets (acknowledge within 3 working days).

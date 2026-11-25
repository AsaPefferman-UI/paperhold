# Deploying

Paperhold is a static site. `pnpm build` writes everything to `apps/web/dist`:

- `index.html`, one `<route>/index.html` per tool and page (own title, description, canonical
  URL and Open Graph tags), `404.html`, and hashed assets under `assets/`.
- `_headers`: the Content Security Policy, security headers and caching rules in Cloudflare
  Pages format, generated from `apps/web/security-headers.ts` (the single source of truth).
- `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, `sw.js` (offline support).
- `pdfjs-<version>/` and `ocr-<version>/`: self-hosted engine data, cached immutably.

Site name, URL, contacts and analytics come from `apps/web/site.config.ts`, with optional
`SITE_*` build-time overrides (`.env.example`).

## Cloudflare Pages (the hosted instance)

Deploys happen only from the Release workflow on a signed tag, through protected GitHub
environments. Setup is in [LAUNCH.md](LAUNCH.md) (steps 10-16); day-to-day operation, verifying
and rollback are in [runbooks/deploy.md](runbooks/deploy.md).

## Self-hosting

```sh
docker compose up --build      # http://localhost:8080
```

The image is unprivileged nginx with a config generated from the same header source
(`apps/web/build/nginx-conf.ts`). Any other static host works if it serves `_headers`' rules,
resolves `/route` to `route/index.html`, returns `404.html` for unknown paths, serves `.wasm` as
`application/wasm`, and does not add `Content-Encoding` to files that are already compressed.

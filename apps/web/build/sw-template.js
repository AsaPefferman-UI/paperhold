// Service worker for offline use. Generated at build time from apps/web/build/sw-template.js.
// - The app shell is precached on install; tool code works with no network afterwards.
// - WASM, pdf.js data and OCR files are cached the first time they are used.
// - A new version installs in the background but only takes over when the page asks
//   (the "Reload for update" button, which is disabled while a file is being processed).
// - Only same-origin GET requests are handled; nothing is ever sent anywhere.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const VERSIONED_DIRS = __VERSIONED_DIRS__;
const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key);
      }
      // Drop runtime entries from other versions (hashed assets, old pdf.js / OCR directories).
      const runtime = await caches.open(RUNTIME);
      for (const req of await runtime.keys()) {
        const path = new URL(req.url).pathname;
        const current = VERSIONED_DIRS.some((dir) => path.startsWith(dir));
        if (path.startsWith('/assets/') || (!current && /^\/(ocr|pdfjs)-/.test(path))) {
          await runtime.delete(req);
        }
      }
      await self.clients.claim();
    })(),
  );
});

const routeKey = (pathname) => {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/' ? '/index.html' : `${path}/index.html`;
};

async function navigate(request) {
  const shell = await caches.open(SHELL);
  const cached = await shell.match(routeKey(new URL(request.url).pathname), { ignoreVary: true });
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    return (await shell.match('/404.html')) ?? Response.error();
  }
}

async function cacheFirst(request) {
  // ignoreVary: servers send `Vary: Origin`, and module scripts are requested with an Origin.
  const hit = (await caches.match(request, { ignoreSearch: true, ignoreVary: true })) ?? null;
  if (hit) return hit;
  const response = await fetch(request);
  const path = new URL(request.url).pathname;
  if (response.ok && /^\/(assets|ocr-[^/]+|pdfjs-[^/]+)\//.test(path)) {
    const runtime = await caches.open(RUNTIME);
    await runtime.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.headers.has('range')) return;
  event.respondWith(request.mode === 'navigate' ? navigate(request) : cacheFirst(request));
});

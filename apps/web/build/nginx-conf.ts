// Prints an nginx server block that serves dist/ with the same headers as production.
// Used by the self-host Docker image: node apps/web/build/nginx-conf.ts > default.conf
import { securityHeaders } from '../security-headers.ts';
import { resolveSite } from '../site.config.ts';

const headers = Object.entries(securityHeaders(resolveSite(process.env).analytics))
  .map(([k, v]) => `    add_header ${k} "${v}" always;`)
  .join('\n');

console.info(`server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  server_tokens off;
  location / {
${headers}
    try_files $uri $uri/index.html =404;
  }
  location /assets/ {
${headers}
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }
  location = /sw.js {
${headers}
    add_header Cache-Control "no-cache" always;
  }
  error_page 404 /404.html;
}`);

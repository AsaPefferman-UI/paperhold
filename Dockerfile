# Self-host image: static build served by unprivileged nginx with the production CSP.
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile
COPY . .
ARG SITE_URL=""
ARG SITE_CF_ANALYTICS_TOKEN=""
RUN pnpm build && node apps/web/build/nginx-conf.ts > /tmp/default.conf

# mainline: nginx's recommended branch, and the one that gets security releases first
# (stable-alpine lagged behind fixed CVEs that apk upgrade can't patch, since nginx comes
# from nginx.org's own package repo).
FROM nginxinc/nginx-unprivileged:mainline-alpine
# Pick up Alpine security fixes released after the base image was built (Trivy gate).
USER root
RUN apk upgrade --no-cache
COPY --from=build /tmp/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080

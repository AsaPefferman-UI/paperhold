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

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --from=build /tmp/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080

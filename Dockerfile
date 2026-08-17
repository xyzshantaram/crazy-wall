FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- serve with static-web-server ---
# Binary from the official image (same convention as the luanti app).
FROM docker.io/joseluisq/static-web-server:2.44.0 AS sws

FROM busybox:stable AS runner
# Dedicated non-root user, uid 10003 (fleet convention, see VPS_STATE.md).
# Busybox adduser flags: -D no password, -S system user, -H no home dir,
# -G primary group, -u uid. /sbin/nologin does not exist in this image but is
# stored as-is in /etc/passwd; harmless since nothing ever logs in.
RUN addgroup -g 10003 -S crazywall \
    && adduser -D -S -H -s /sbin/nologin -G crazywall -u 10003 crazywall
WORKDIR /www
COPY --from=sws /static-web-server /usr/local/bin/static-web-server
COPY --from=builder /app/dist .
# SPA fallback: --page-fallback serves index.html (HTTP 200) for GET requests
# that would otherwise 404, which covers client-side routing.
# --host 0.0.0.0: SWS defaults to "::" (IPv6); dokku's nginx proxies over IPv4.
# --port 8080: a non-root user cannot bind privileged ports (<1024).
USER crazywall
EXPOSE 8080
CMD ["/usr/local/bin/static-web-server", "--host", "0.0.0.0", "--port", "8080", "--root", "/www", "--page-fallback", "/www/index.html"]

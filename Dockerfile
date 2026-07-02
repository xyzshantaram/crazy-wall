FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- serve with busybox httpd ---
# busybox httpd serves a 404.html as the error page for missing paths,
# which we point at index.html for SPA client-side routing.
FROM busybox:stable AS runner
WORKDIR /www
COPY --from=builder /app/dist .
# SPA fallback: missing paths → index.html (busybox httpd 404 handler)
RUN ln -s index.html 404.html
EXPOSE 80
CMD ["busybox", "httpd", "-f", "-p", "80", "-h", "/www"]

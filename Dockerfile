FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json ./
RUN pnpm install

COPY . .
RUN pnpm build

# --- serve with nginx ---
FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
# SPA fallback: all routes → index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

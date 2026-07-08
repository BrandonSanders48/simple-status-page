# syntax=docker/dockerfile:1

# ---- deps: install all dependencies (needed to compile better-sqlite3's native addon) ----
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the Next.js app ----
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure this always exists so the runner's COPY below never fails, even once the
# legacy include/ directory is eventually removed from the repo entirely.
RUN mkdir -p include
RUN npm run build

# ---- runner: minimal production image ----
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping openssl ca-certificates tini gosu \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

WORKDIR /app

# Production-only node_modules (better-sqlite3 has a prebuilt binary for linux-x64,
# so no build toolchain is needed in this stage).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/app/favicon.ico ./app/favicon.ico
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/migrate.ts ./migrate.ts
COPY --from=builder /app/migrate-legacy-data.ts ./migrate-legacy-data.ts
# Old (pre-database) app data, if present, so a fresh database can auto-import it on
# first boot. Safe to ship even when empty; migrate.ts only acts on it if found.
COPY --from=builder /app/include ./include
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN mkdir -p /data/uploads /data/ssl \
    && chown -R nextjs:nodejs /app /data \
    && chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
ENV HTTPS_PORT=3443

VOLUME /data
# Listens on unprivileged ports as a non-root user; map to 80/443 on the host with
# `-p 80:3000 -p 443:3443` rather than granting the container CAP_NET_BIND_SERVICE.
EXPOSE 3000 3443

ENTRYPOINT ["tini", "--", "/docker-entrypoint.sh"]

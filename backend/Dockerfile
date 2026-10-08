# syntax=docker/dockerfile:1
# SpaceEzy CRM API (Express 5 + Prisma 7, production image).
# Build:  docker build -t spaceezy-express ./backend
# Runs:    node server.js  (no nodemon, no dev watchers)

FROM node:22-bookworm-slim AS base
WORKDIR /app
# Prisma CLI needs the openssl binary to detect the platform and pick the
# correct schema-engine (Debian Bookworm = OpenSSL 3.0). Without it, `prisma
# migrate deploy` downloads/defaults to an incompatible engine build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
# Prisma CLI is a runtime dependency so `npx prisma migrate deploy` works
# inside the container. --omit=dev drops jest/nodemon/supertest.
RUN npm ci --omit=dev

FROM deps AS build
# `prisma generate` only parses config; a placeholder URL is never used to
# connect. Real DATABASE_URL is provided at runtime (never baked into images).
ENV DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/spaceezy
COPY prisma7.config.ts ./
COPY prisma ./prisma
# Generates node_modules/.prisma/client (WASM query compiler — no platform
# engine binaries needed at runtime).
RUN npx prisma generate

FROM node:22-bookworm-slim AS runner
WORKDIR /app
# Same openssl requirement as the deps stage — the CLI runs here for
# `docker compose exec express npx prisma migrate deploy`.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8000
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs backend
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY package.json package-lock.json ./
COPY prisma7.config.ts ./
COPY server.js ./
COPY src ./src
COPY scripts ./scripts
USER backend
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

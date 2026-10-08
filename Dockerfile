# syntax=docker/dockerfile:1
# SpaceEzy public website + CRM frontend (Next.js 16, production image).
# Build:  docker build --build-arg NEXT_PUBLIC_API_URL=https://spaceezy.com/api/v1 -t spaceezy-next .
# The browser-visible API base URL is inlined at build time (NEXT_PUBLIC_*).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
# Emit .next/standalone (see next.config.ts — gated behind NEXT_OUTPUT).
ENV NEXT_OUTPUT=standalone
# Inlined into the bundle — must be the PUBLIC url the browser can reach.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Optional heap cap for building on low-RAM hosts (e.g. EC2 t4g.small):
#   --build-arg NODE_OPTIONS=--max-old-space-size=1400
# (Create swap first — see docs/AWS_DEPLOYMENT.md §5.)
ARG NODE_OPTIONS=
ENV NODE_OPTIONS=$NODE_OPTIONS
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs
# Static assets + standalone server (output: "standalone" in next.config.ts).
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
# /login is a static route with no backend dependency — safe liveness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# syntax=docker/dockerfile:1.7
# Wholesale Scout — Next.js 16 standalone build for Coolify (persistent Node runtime, not serverless).
# Image ends up ~180 MB: only .next/standalone + static + public + content/help are shipped.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: full install (devDependencies are needed: the prebuild hook runs vitest, and next build needs tailwind/typescript)
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No secrets are baked in: every env var is read at request time on the server (no NEXT_PUBLIC_*).
RUN npm run build

# ---- runner: minimal, non-root
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# The help centre reads markdown at request time (outputFileTracingIncludes covers it, this is belt and braces).
COPY --from=builder --chown=nextjs:nodejs /app/content ./content
USER nextjs
EXPOSE 3000
# /favicon.ico is outside the password gate (proxy matcher), so this proves the server is up without touching the DB.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/favicon.ico').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

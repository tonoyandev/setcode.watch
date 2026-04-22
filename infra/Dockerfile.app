# App image — Nuxt 3 (Nitro node-server preset).
#
# Unlike the TS services, Nuxt needs a build step: it compiles Vue SFCs,
# tree-shakes components, and emits a standalone `.output/` bundle. We build
# inside the deploy workspace so workspace:* (shared) is fully materialised
# when the Nuxt bundler resolves imports.
#
# `NUXT_PUBLIC_*` ARGs are baked into the client bundle at build time. Keep
# the runtime env in compose in sync or SSR and the browser will disagree.

# ---------- deps ----------
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY shared/package.json   shared/package.json
COPY watcher/package.json  watcher/package.json
COPY indexer/package.json  indexer/package.json
COPY app/package.json      app/package.json
COPY contracts/package.json contracts/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile

COPY shared shared
COPY app    app

# ---------- build ----------
# Build inside the repo (not /deploy) so Nuxt's bundler sees the full
# workspace. Outputs `app/.output/` which is everything Nitro needs at runtime.
FROM deps AS build
ARG NUXT_PUBLIC_WATCHER_API_URL=/api
ARG NUXT_PUBLIC_BOT_USERNAME
ENV NUXT_PUBLIC_WATCHER_API_URL=$NUXT_PUBLIC_WATCHER_API_URL
ENV NUXT_PUBLIC_BOT_USERNAME=$NUXT_PUBLIC_BOT_USERNAME
RUN pnpm --filter=@setcode/app build

# ---------- runner ----------
# Nitro's node-server output is self-contained: no node_modules traversal at
# runtime, just `node .output/server/index.mjs`. Ship the bundle in a clean
# image without pnpm or dev deps.
FROM node:22-alpine AS runner
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=build --chown=app:app /repo/app/.output ./.output
USER app

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]

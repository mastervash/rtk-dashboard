# syntax=docker/dockerfile:1

ARG NODE_VERSION=22

# The SPA build is architecture-independent, so pin it to the builder's native
# platform. Running tsc and vite under QEMU for an arm64 target would dominate
# the build time for no benefit.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime dependencies do have to match the target architecture: better-sqlite3
# is a native module. It ships prebuilds for linux x64 and arm64, so this is a
# download rather than a compile; the toolchain is only a fallback.
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev


FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    RTKDASH_HOST=0.0.0.0 \
    RTKDASH_API_PORT=5178 \
    RTKDASH_DB=/data/history.db \
    RTKDASH_CONFIG_DIR=/config \
    # The rtk binary is not in this image, so the Tools runner cannot work.
    # See the Docker section of the README before changing this.
    RTKDASH_READONLY=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=web /app/dist ./dist
COPY server ./server
COPY scripts ./scripts
COPY package.json ./

# The mounted history database belongs to the host user that runs rtk. Override
# with `user:` in compose when that uid is not 1000.
USER node

EXPOSE 5178

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.RTKDASH_API_PORT||5178)+'/api/meta').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]

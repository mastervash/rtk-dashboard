# syntax=docker/dockerfile:1

# better-sqlite3 is a native module, so the build stage needs a toolchain that
# the runtime stage does not.
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev


FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    RTKDASH_HOST=0.0.0.0 \
    RTKDASH_API_PORT=5178 \
    RTKDASH_DB=/data/history.db \
    RTKDASH_CONFIG_DIR=/config \
    # The rtk binary is not in this image, so the Tools runner cannot work.
    # See the Docker section of the README before changing this.
    RTKDASH_READONLY=1

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./

# The mounted history database belongs to the host user that runs rtk. Override
# with `user:` in compose when that uid is not 1000.
USER node

EXPOSE 5178

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.RTKDASH_API_PORT||5178)+'/api/meta').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]

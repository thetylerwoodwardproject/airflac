# Debian rather than Alpine: it matches the apt-based native install path, so the
# ffmpeg build is the same one the documentation assumes.
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Manifests first, so dependency installation is cached independently of source edits.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server/ server/
COPY client/ client/

RUN npm run build && npm prune --omit=dev


FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    AIRFLAC_PORT=8080 \
    AIRFLAC_HOST=0.0.0.0 \
    AIRFLAC_STORAGE_PATH=/data

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

# Created before the volume is attached so a fresh named volume inherits this ownership.
RUN mkdir -p /data/uploads /data/converted /data/archives && chown -R node:node /data

USER node
EXPOSE 8080

# Uses node rather than curl, so the runtime image needs no extra packages.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.AIRFLAC_PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]

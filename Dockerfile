# Satu image, dua proses:
#   docker run -p 3000:3000 resitku              → API
#   docker run resitku node dist/worker.js       → pekerja OCR
#
# Migrasi (cwd imej ialah apps/api):
#   docker run --rm -e DATABASE_URL=... resitku npx prisma migrate deploy
#
# ECS amd64: docker build --platform linux/amd64 -t resitku .

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci

COPY tsconfig.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w @resitku/shared && npm run build -w @resitku/api

FROM node:22-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Jangan tetapkan NODE_ENV=production sebelum npm ci — npm akan skip
# optional native bindings (@node-rs/argon2) pada sesetengah platform.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --omit=dev \
  && npm install prisma@7.9.1 dotenv@17.4.2 --omit=dev --no-save

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY --from=build /app/apps/api/package.json apps/api/package.json

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app/apps/api

USER node

EXPOSE 3000

# Tiada HEALTHCHECK di sini: worker tidak mendengar HTTP. ALB memeriksa
# /healthz pada task API sahaja.
CMD ["node", "dist/server.js"]

# Debian-based (glibc) image so @node-rs/argon2 uses its prebuilt linux-x64-gnu binary
FROM node:24-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
# .pnpmfile.cjs is required: its checksum is recorded in the lockfile
COPY package.json pnpm-lock.yaml .pnpmfile.cjs ./

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER node
EXPOSE 8080
# Run migrations, then replace the shell with node so it receives SIGTERM directly
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/server.js"]

# Multi-stage production build for Openfront Restaurant

# 1. Dependency Installation
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install && npm cache clean --force

# 2. Builder
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

# Generate Prisma client, Keystone artifacts, build Next.js application, and strip duplicate standalone node_modules
RUN DATABASE_URL="postgresql://build:build@localhost:5432/openfront_restaurant" \
    SESSION_SECRET="build-time-placeholder-secret-at-least-32-chars" \
    sh -c "npx prisma generate && npx keystone build --no-ui && npx next build && rm -rf .next/standalone/node_modules"

# 3. Pruned Production Dependencies
FROM node:22-alpine AS deps-pruned
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Strip devDependencies, build-only compilers, unused glibc binaries on Alpine, unused Keystone UI, and type/map/doc files
RUN rm -rf \
    node_modules/@keystone-6/core/node_modules/next \
    node_modules/@keystone-6/core/node_modules/@next \
    node_modules/@keystone-ui \
    node_modules/@next/swc-* \
    node_modules/@img/sharp-libvips-linux-x64 \
    node_modules/@img/sharp-linux-x64 \
    node_modules/next/dist/esm \
    node_modules/next/dist/compiled/webpack \
    node_modules/next/dist/compiled/react-dom-experimental \
    node_modules/next/dist/compiled/react-server-dom-webpack-experimental \
    node_modules/next/dist/compiled/react-server-dom-turbopack* \
    node_modules/lucide-react \
    node_modules/@remixicon \
    node_modules/date-fns-jalali \
    node_modules/@shikijs \
    node_modules/shiki \
    node_modules/typescript \
    node_modules/vitest \
    node_modules/jsdom \
    node_modules/@testing-library \
    node_modules/eslint* \
    node_modules/@eslint* \
    node_modules/@typescript-eslint \
    node_modules/es-abstract \
    node_modules/@unrs \
    node_modules/caniuse-lite \
    node_modules/axe-core \
    node_modules/@types \
    node_modules/@rolldown \
    node_modules/lightningcss* \
    node_modules/tailwindcss* \
    node_modules/@tailwindcss \
    node_modules/tw-animate-css \
    node_modules/babel-plugin-react-compiler \
    && find node_modules -type f \( -name "*.map" -o -name "*.md" -o -name "*.d.ts" -o -name "*.d.mts" -o -name "*.d.cts" \) -delete

# 4. Production Runner
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV PATH="/app/node_modules/.bin:$PATH"

# Copy minimal production dependencies, generated Prisma client, and Next.js standalone build
COPY --from=deps-pruned /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy runtime schemas and scripts
COPY --from=builder /app/.keystone ./.keystone
COPY --from=builder /app/schema.prisma ./schema.prisma
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/features ./features

RUN sed -i 's/\r$//' /app/scripts/docker-entrypoint.sh && chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "server.js"]

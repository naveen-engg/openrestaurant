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
ENV DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/openfront_restaurant"
ENV SESSION_SECRET="openfront-restaurant-production-session-secret-super-secure-key-32chars"

# Generate Prisma client, Keystone artifacts and build Next.js application
RUN npx prisma generate && npx keystone build --no-ui && npx next build

# 3. Pruned Production Dependencies
FROM node:22-alpine AS deps-pruned
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Strip devDependencies, duplicated Next.js & SWC in Keystone, unused GNU binaries on Alpine, source maps, and docs
RUN rm -rf \
    node_modules/@keystone-6/core/node_modules/next \
    node_modules/@keystone-6/core/node_modules/@next \
    node_modules/@next/swc-linux-x64-gnu \
    node_modules/typescript \
    node_modules/vitest \
    node_modules/jsdom \
    node_modules/@testing-library \
    node_modules/eslint \
    node_modules/@eslint \
    node_modules/eslint-config-next \
    node_modules/@types \
    node_modules/@rolldown \
    node_modules/tailwindcss \
    node_modules/@tailwindcss \
    node_modules/tw-animate-css \
    node_modules/babel-plugin-react-compiler \
    && find node_modules -type f -name "*.map" -delete \
    && find node_modules -type f -name "*.md" -delete

# 4. Production Runner
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV PATH="/app/node_modules/.bin:$PATH"

# Copy minimal production dependencies and Next.js standalone build
COPY --from=deps-pruned /app/node_modules ./node_modules
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

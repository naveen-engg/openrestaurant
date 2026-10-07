# Multi-stage production build for Openfront Restaurant
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

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

# Production Runner
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install global tools needed for entrypoint database migration & initial seed
RUN npm install -g prisma@6.5.0 tsx@4.19.4

# Copy dependencies and standalone build
COPY --from=deps /app/node_modules ./node_modules
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

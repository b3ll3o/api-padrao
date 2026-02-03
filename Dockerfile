# Stage 1: Dependencies
FROM docker.io/library/node:20.18-alpine AS deps
# Adicionando dependências necessárias para o Prisma no Alpine
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Usar cache para npm ci
COPY package*.json ./
RUN npm ci --ignore-scripts

# Stage 2: Development
FROM docker.io/library/node:20.18-alpine AS development
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

# Stage 3: Builder
FROM docker.io/library/node:20.18-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && \
    npm run build && \
    npm prune --production

# Stage 4: Runner
FROM docker.io/library/node:20.18-alpine AS runner
# Curl para healthcheck, openssl e libc6-compat para o Prisma
RUN apk add --no-cache curl openssl libc6-compat && \
    addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package*.json ./
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=builder --chown=appuser:appgroup /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/health/live || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main"]

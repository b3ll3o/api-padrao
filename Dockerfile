# Stage 1: Dependencies
FROM docker.io/library/node:22-alpine AS deps
# Adicionando dependências necessárias para o Prisma no Alpine
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Usar cache para npm ci
COPY package*.json ./
RUN npm ci --ignore-scripts

# Stage 2: Development
FROM docker.io/library/node:22-alpine AS development
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

# Stage 3: Builder
FROM docker.io/library/node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && \
    npm run build && \
    npm prune --production

# Stage 4: Runner
FROM docker.io/library/node:22-alpine AS runner
# [Sprint2-PostMerge/Dockerfile] Curl para healthcheck, openssl e libc6-compat
# para o Prisma, tini para init (SIGTERM graceful).
# Node 22 LTS (Iron) - ativo até Out/2025, maintenance até Abr/2027.
# Tini resolve CONT-002 (Node como PID 1 não trata SIGTERM).
RUN apk add --no-cache curl openssl libc6-compat tini && \
    addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

ENV NODE_ENV=production

# [MED-001] Aumenta o thread pool do libuv de 4 (padrão) para 10 para
# acomodar chamadas concorrentes a bcrypt.hash/bcrypt.compare sem
# bloquear o event loop do Node. 10 é o valor recomendado pelo time
# do Node.js para APIs com auth que dependem de bcrypt.
ENV UV_THREADPOOL_SIZE=10

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package*.json ./
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
# [Sprint2-PostMerge/Dockerfile] Templates de e-mail transacional (.tpl) lidos
# pelo TemplateLoaderService via fs.readdirSync no boot. Sem o COPY, a
# aplicação aborta com "[TemplateLoaderService] Diretório de templates não
# encontrado" no production. Path default = src/shared/infrastructure/templates/v1.
COPY --from=builder --chown=appuser:appgroup /app/src/shared/infrastructure/templates ./src/shared/infrastructure/templates
COPY --from=builder --chown=appuser:appgroup /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/health/live || exit 1

# [Sprint2-PostMerge/Dockerfile] Tini como init - Node não vira PID 1 e
# trata SIGTERM graciosamente (docker stop respeitado em <10s).
ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
# nest build preserva a estrutura src/ dentro de dist/ (output real:
# dist/src/main.js), por isso o caminho do CMD inclui "src".
CMD ["node", "dist/src/main"]

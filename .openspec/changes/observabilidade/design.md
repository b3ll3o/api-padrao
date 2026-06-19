# Feature: Observabilidade (Metrics + Queues + Health) — Design Specification

## Overview

A feature **observabilidade** agrupa três capacidades de visibilidade
operacional que antes estavam dispersas ou ausentes:

1. **Métricas Prometheus** (RED-USE pattern) — expostas em `/metrics` em
   text format 0.0.4. Capturam RPS, latência (histogram com buckets
   5-10000ms), taxa de erro por rota, e indicadores de pool/queue
   (counters/gauges).
2. **Filas BullMQ** — desacopla trabalho assíncrono (e-mail, auditoria,
   flush de refresh tokens) do request lifecycle. Produtores enfileiram
   via `InjectQueue`; consumidores (`@Processor`) rodam em background com
   retry exponencial.
3. **Health checks** — `@nestjs/terminus` com liveness (200 sempre que o
   processo responde) e readiness (ping no Postgres + disco). Endpoint
   público (sem JWT).

**Stack**: `prom-client` (métricas, integrado via `MetricsRegistry`
custom para evitar `prom-client` direto), `@nestjs/bullmq` (queues),
`@nestjs/terminus` (health), `ioredis` (transporte subjacente).

**Não cobertos** (outras changes ou futuro):
- Tracing distribuído OpenTelemetry (já existe em
  `src/tracing.ts`, fora do escopo desta change).
- Logs estruturados via Pino (já existe em
  `src/shared/infrastructure/services/logger-email.service.ts`).
- Auto-scaling reativo às métricas.

## Requirements (RFC 2119)

### Functional Requirements — Metrics

- **REQ-METRICS-001**: The system **MUST** expor um endpoint `GET /metrics`
  em formato text Prometheus 0.0.4, sem autenticação (`@Public()`), com
  `Content-Type: text/plain; version=0.0.4; charset=utf-8`.
  - Rastreabilidade:
    - Controller: `src/shared/infrastructure/metrics/metrics.controller.ts`
    - Module: `src/shared/infrastructure/metrics/metrics.module.ts`
    - Registry: `src/shared/infrastructure/metrics/registry.ts`

- **REQ-METRICS-002**: The system **MUST** emitir histogram de latência
  HTTP com labels `(method, route, status)` e buckets
  `[5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]` ms.
  - Rastreabilidade:
    - Interceptor: `src/shared/infrastructure/metrics/http-metrics.interceptor.ts`
    - Histogram primitivo: `registry.ts` (classe `Histogram`)

- **REQ-METRICS-003**: The system **MUST** emitir counter de requests HTTP
  com labels `(method, route, status)` para o padrão RED (Rate).
  - Rastreabilidade:
    - Interceptor: `http-metrics.interceptor.ts`

- **REQ-METRICS-004**: The system **MUST** emitir counter de erros HTTP
  (status >= 500) com labels `(method, route)`.
  - Rastreabilidade:
    - Interceptor: `http-metrics.interceptor.ts` (incrementa em `tap.error`)

- **REQ-METRICS-005**: The system **MUST** excluir do scrape as rotas
  `/health/*` e `/metrics` (evitar ruído e recursão de scrape).
  - Rastreabilidade:
    - Constante `EXCLUDED_PATHS` em `http-metrics.interceptor.ts`

- **REQ-METRICS-006**: The system **MUST** usar `req.route.path`
  (parametrizado, ex: `/usuarios/:id`) em vez do `req.path` bruto, para
  evitar explosão de cardinalidade.
  - Rastreabilidade:
    - `http-metrics.interceptor.ts:48-55`

### Functional Requirements — Queues

- **REQ-QUEUE-001**: The system **MUST** processar envios de e-mail
  transacional em fila assíncrona `email` com retry exponencial
  (attempts=3, backoff 1s → 2s → 4s), isolando o request HTTP do I/O
  SMTP.
  - Rastreabilidade:
    - Constants: `src/shared/infrastructure/queues/queue.constants.ts`
    - Producer: enfileira via `InjectQueue(EMAIL_QUEUE)`
    - Consumer: `processors/email.processor.ts`
    - Module: `queues.module.ts`

- **REQ-QUEUE-002**: The system **MUST** persistir eventos de auditoria
  em fila assíncrona `audit`, desacoplando o `AuditInterceptor` do
  request. Os dados já chegam sanitizados (LGPD — cpf/cnpj/telefone/email
  mascarados como `********`) do `AuditInterceptor`.
  - Rastreabilidade:
    - Consumer: `processors/audit.processor.ts`
    - LGPD sanitization: `src/shared/infrastructure/interceptors/audit.interceptor.ts`

- **REQ-QUEUE-003**: The system **MUST** permitir flush periódico de
  refresh tokens expirados via fila assíncrona `refresh-flush`. O
  scheduling (cron) é responsabilidade de um endpoint admin ou scheduler
  externo; o processor é o consumidor da fila.
  - Rastreabilidade:
    - Consumer: `processors/refresh-flush.processor.ts`
    - Default job options: `queue.constants.ts`

- **REQ-QUEUE-004**: The system **MUST** configurar `removeOnComplete: true`
  (libera Redis após sucesso) e `removeOnFail: false` (mantém jobs
  falhos para inspeção via Bull Board) por padrão em todas as filas.
  - Rastreabilidade:
    - `queue.constants.ts:DEFAULT_JOB_OPTIONS`

- **REQ-QUEUE-005**: The system **MUST** expor as 3 filas via
  `BullModule.registerQueue` no `QueuesModule` e exportá-las para que
  outros módulos (producers) possam injetar.
  - Rastreabilidade:
    - `queues.module.ts:BullModule.registerQueue({...})`

### Functional Requirements — Health

- **REQ-BOOT-001**: The system **MUST** expor health checks via
  `@nestjs/terminus` com rotas separadas:
  - `GET /health/live` — liveness (200 enquanto o processo responde; sem
    dependências externas para não cascade-failure).
  - `GET /health/ready` — readiness (ping Postgres + disco).
  - Ambas `@Public()`.
  - Rastreabilidade:
    - Controller: `src/shared/infrastructure/health/health.controller.ts`
    - Module: `src/shared/infrastructure/health/health.module.ts`
    - **Nota de design**: `/health/network` (que pingava Google) foi
      removido em [HEALTH-002] porque causa cascading failure em prod
      quando o provedor perde internet.

## Decisões de design

### Por que `MetricsRegistry` custom em vez de `prom-client` direto?

- **Zero dependência externa** — o registry é ~300 linhas de TS puro,
  suficiente para os contadores/histogramas/gauges que precisamos. Não
  justifica a dependência de `prom-client` (~250KB).
- **Serialização determinística** — text format 0.0.4 é simples o
  suficiente para implementar in-house sem surpresas de versão.
- **Tipagem forte** — `Counter`, `Histogram`, `Gauge` são classes
  genéricas, pegam erros de tipo em compile-time.

### Por que `@nestjs/bullmq` e não jobs in-process?

- **Resiliência** — se a API reiniciar, jobs em voo sobrevivem (Redis
  é o source of truth).
- **Retry transparente** — backoff exponencial configurado uma vez, vale
  para todas as filas.
- **Múltiplas instâncias** — workers BullMQ compartilham a fila via
  Redis, sem leader election manual.

### Por que `PrismaService.$on('query')` não está ligado ao gauge de pool?

- O `prismaPoolActive`/`prismaPoolIdle` gauges estão **declarados e
  serializados** no `MetricsRegistry`, mas o binding ao pool real do
  Prisma Client está fora do escopo desta change. O requirement
  REQ-METRICS-007 (abaixo) é o trabalho de follow-up.

## Open Requirements (não implementados nesta change)

- **REQ-METRICS-007** (follow-up): Wire `prismaPoolActive`/`prismaPoolIdle`
  aos eventos do Prisma Client. Hoje emitem `0`.
- **REQ-METRICS-008** (follow-up): Wire `bullQueueWaiting/Active/Failed` aos
  eventos `Queue.on('waiting'/'active'/'failed')` do BullMQ. Hoje
  emitem `0`.
- **REQ-QUEUE-006** (follow-up): Adicionar `@nestjs/schedule` cron que
  enfileira `refresh-flush` diariamente. Hoje o processor existe mas
  nada enfileira.
- **REQ-METRICS-009** (follow-up): Allowlist de IPs em `/metrics` (atualmente
  `@Public()` — qualquer um pode raspar). O comentário no
  `metrics.controller.ts:10-13` já alerta que isso é INTENCIONAL em
  dev, mas em prod exige allowlist no ingress.

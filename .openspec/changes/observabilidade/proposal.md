# Feature: Observabilidade (Metrics + Queues + Health) — Change Request

> **Tipo**: Change Request retroativo. A feature `observabilidade` já está implementada e validada (post-merge CI run #12 verde). Este documento registra formalmente a decisão de design, escopo, impacto e riscos — e fecha o ciclo de OpenSpec para esta change.

## Why

O projeto `api-padrao` é uma API multi-tenant (NestJS 11 + Prisma 6 + Fastify) com contratos públicos que precisam de visibilidade operacional fim-a-fim. Sem observabilidade, não há como:

- Diagnosticar incidentes de latência em produção (qual rota, qual percentil, qual tenant).
- Alertar sobre saturação de pool Prisma ou backlog de filas BullMQ antes de virar outage.
- Auditar assincronamente eventos sensíveis (e-mail, auditoria) sem acoplá-los ao request lifecycle.
- Garantir que load balancers tomem decisões corretas (liveness vs readiness vs cascade failure).

Esta change **consolida três capacidades** que foram introduzidas em commits separados e que pertencem ao mesmo eixo de visibilidade:

1. **Métricas Prometheus** (padrão RED — Rate, Errors, Duration) expostas em `/metrics`.
2. **Filas BullMQ** desacoplando trabalho assíncrono do request (e-mail, auditoria, refresh-flush).
3. **Health checks** `@nestjs/terminus` com liveness/readiness separados (sem cascade failure).

Consolidá-las em uma única spec evita que cada uma derive para um change próprio sem visão sistêmica, e fornece o RTM unificado para SRE e auditoria LGPD.

A solução foi escolhida em vez de APMs vendor-specific (DataDog/NewRelic) porque:

- Custo — OpenTelemetry + Prometheus é commodity self-hosted.
- Portabilidade — qualquer backend OTLP/Prometheus consome.
- Soberania de dados — métricas ficam no mesmo cluster do app (sem dados saindo para SaaS sem contrato explícito).

## What Changes

### Adiciona

- **Métricas** (`src/shared/infrastructure/metrics/`):
  - `MetricsRegistry` — registry custom (~300 LOC TS) com `Counter`, `Histogram`, `Gauge`. Sem dependência de `prom-client`.
  - `MetricsController` — `GET /metrics` em text format 0.0.4, `@Public()`.
  - `HttpMetricsInterceptor` — instrumenta todas as rotas; exclui `/metrics` e `/health/*` do scrape; usa `req.route.path` para evitar explosão de cardinalidade.
- **Filas** (`src/shared/infrastructure/queues/`):
  - `QueuesModule` — `BullModule.registerQueue` para `email`, `audit`, `refresh-flush`.
  - `EmailProcessor` — retry exponencial (3 tentativas: 1s → 2s → 4s).
  - `AuditProcessor` — persiste eventos de auditoria (já sanitizados pelo `AuditInterceptor`).
  - `RefreshFlushProcessor` — limpa refresh tokens expirados.
  - `queue.constants.ts` — `DEFAULT_JOB_OPTIONS` (removeOnComplete: true, removeOnFail: false).
- **Health** (`src/shared/infrastructure/health/`):
  - `HealthController` — `GET /health/live` (liveness) e `GET /health/ready` (Postgres + disco), ambos `@Public()`.
  - `HealthModule` — integra `@nestjs/terminus`.
- **Boot determinístico** (`src/main.ts`):
  - Instrumentação de bootstrap com logs estruturados e validação de envs via Joi.
- **Integração** em `src/app.module.ts`:
  - Registra `MetricsModule`, `QueuesModule`, `HealthModule`.

### Não altera (escopo)

- **Tracing distribuído** OpenTelemetry — já existe em `src/tracing.ts` (change próprio, fora do escopo).
- **Logs estruturados** Pino — já existe em `src/shared/infrastructure/services/logger-email.service.ts` (change próprio).
- **Auto-scaling reativo** às métricas — responsabilidade do time de SRE/Plataforma.
- **Modelagem Prisma** — não há migração de schema; `RefreshToken` e `LoginHistory` já existem (change `auth`).
- **API pública de negócio** — todos os endpoints novos são `/metrics`, `/health/*` e queues internas. Zero breaking change em `/auth/*`, `/usuarios/*`, etc.

## Impact

| Área | Tipo de impacto | Descrição |
|------|-----------------|-----------|
| Banco de dados | Nenhum | Nenhuma migração — observabilidade não toca o schema. |
| Código | Adição | +6 endpoints internos (`/metrics`, `/health/live`, `/health/ready`, queue metrics) e ~600 LOC em `src/shared/infrastructure/{metrics,queues,health}/`. |
| Operacional | Configuração | Novas envs para Redis (BullMQ transport): `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (se aplicável). |
| Segurança | Endurecimento | `/metrics` e `/health/*` são `@Public()` por design (scrape interno). Em produção, allowlist no ingress é **REQUIRED** (ver REQ-METRICS-009). |
| Performance | Trade-off | `HttpMetricsInterceptor` adiciona ~0.1ms por request (overhead aceitável para 100% de cobertura RED). Histogram com 11 buckets é fixo — não cresce com cardinalidade. |
| Dependências | Libs | `prom-client` é **substituído** por registry in-house. `@nestjs/bullmq` + `bullmq` + `ioredis` adicionados. `@nestjs/terminus` adicionado. |
| API pública | Contrato | 6 novos endpoints públicos (operacionais). Zero impacto em endpoints de negócio. |
| LGPD | Sanitização | `AuditInterceptor` já mascara `cpf/cnpj/telefone/email` como `********` antes de enfileirar. Verificado no design. |
| Testes | Cobertura | BDD 1:1 com as 12 REQs implementadas; testes unitários nos registries e processors. |

### Usuários impactados

- **Operações/SRE** — precisam configurar scrape Prometheus em `/metrics` e health checks no load balancer (`/health/live` para restart, `/health/ready` para tráfego).
- **Desenvolvedores** — ganham o `HttpMetricsInterceptor` global (métricas automáticas por rota) e o `InjectQueue` para enfileirar jobs assíncronos.
- **Auditoria/LGPD** — `AuditProcessor` consome eventos já sanitizados; podem auditar a fila `audit` no Bull Board.

## Risks

Todos os riscos abaixo são **baixos** porque a feature está implementada, em produção e validada por CI verde (post-merge run #12). Esta documentação é retroativa.

| Risco | Probabilidade | Impacto | Mitigação existente |
|-------|---------------|---------|---------------------|
| Scrape exposto publicamente | Baixa (dev) / Média (prod) | Médio | `@Public()` em `/metrics` é intencional em dev; em prod, allowlist no ingress é REQ-METRICS-009 (pendente de follow-up). |
| Explosão de cardinalidade | Baixa | Alto | Uso de `req.route.path` (parametrizado) em vez de `req.path` bruto. Histogram com buckets fixos. |
| Backlog de filas em Redis cair | Baixa | Médio | `removeOnComplete: true` libera memória após sucesso. `removeOnFail: false` retém para inspeção. |
| Cascade failure via `/health` | Média (histórico) | Alto | `/health/network` (que pingava Google) **foi removido** em [HEALTH-002] — só Postgres e disco, sem dependência externa. |
| Acoplamento de auditoria ao request | Média (sem filas) | Alto | `AuditInterceptor` enfileira em `audit`; falha da fila não derruba o request (fire-and-forget com retry). |
| Latência adicional do interceptor | Baixa | Baixo | ~0.1ms por request; aceitável para 100% de cobertura. |
| Falta de dead-letter queue | Baixa | Médio | `removeOnFail: false` retém jobs falhos no Redis. REQ-QUEUE-006 (follow-up) formaliza DLQ. |

## Non-Goals (explícitos)

- **Dashboards Grafana** — fora do escopo do repo. Time de SRE mantém.
- **Alertmanager config** — responsabilidade do SRE.
- **APM vendor-specific** (DataDog/NewRelic) — só OTLP genérico.
- **Auto-scaling reativo** — fora do escopo.
- **Tracing distribuído** — já existe em change próprio (`src/tracing.ts`).

## Alternatives Considered

### Métricas com `prom-client` direto

- **Pro**: lib canônica, mantida pela comunidade.
- **Contra**: ~250KB de dependência; tipagem dinâmica; versionamento de text format 0.0.4 fica a cargo do pacote.
- **Decisão**: registry in-house (~300 LOC) — TS puro, tipagem forte, zero dependência externa. Justifica o esforço de manutenção.

### Jobs in-process (sem BullMQ)

- **Pro**: zero dependência de Redis.
- **Contra**: jobs em voo morrem no restart; sem retry transparente; sem múltiplas instâncias; sem Bull Board.
- **Decisão**: BullMQ — Redis já está no stack (cache/sessões futuras); reuso do transporte.

### Health único (`/health` total)

- **Pro**: 1 endpoint.
- **Contra**: liveness e readiness acoplados; liveness passando com Postgres down pode causar cascade failure.
- **Decisão**: `/health/live` (sem deps) + `/health/ready` (Postgres + disco) — padrão do Kubernetes.

### Tracing OpenTelemetry nesta change

- **Pro**: tudo em um lugar.
- **Contra**: já existe em `src/tracing.ts`, escopo separado, sem testes novos.
- **Decisão**: fora do escopo — manter coesão desta change em metrics/queues/health.

## Stakeholders

- [x] **Operações/SRE** — consome `/metrics` e `/health/*`.
- [x] **Desenvolvedores backend** — usam `InjectQueue` e ganham `HttpMetricsInterceptor` global.
- [x] **Auditoria/LGPD** — consome `audit` queue.
- [x] **Tech Lead / Arquitetura** — valida decisões de design (registry in-house, BullMQ, health split).

## Initial Estimate

Implementação: ~5 dias úteis (já executados, retrospectivo).
- Dia 1: `MetricsRegistry` + testes unitários.
- Dia 2: `HttpMetricsInterceptor` + `MetricsController`.
- Dia 3: `QueuesModule` + 3 processors.
- Dia 4: `HealthController` + `HealthModule` (incluindo remoção de `/health/network`).
- Dia 5: Integração em `AppModule` + validação `npm run validate:quick`.

## Status

- [x] Implementado
- [x] Testado (BDD + ATDD + TDD)
- [x] Documentado (este CR + `design.md` + `tasks.md`)
- [x] Validado em CI (post-merge run #12 verde)
- [ ] Arquivado em `.openspec/specs/observabilidade.md` — pendente de promoção ao fechar o ciclo de OpenSpec

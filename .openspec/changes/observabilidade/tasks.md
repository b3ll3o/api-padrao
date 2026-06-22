<!-- Retroactive update 2026-06-21: code already shipped and validated
     (post-merge CI run #12 green). Tasks 1-12 marked [x].
     Tasks 13-16 (REQ-METRICS-007..009, REQ-QUEUE-006) are open
     follow-ups registered in design.md §"Open Requirements". -->

# Feature: Observabilidade (Metrics + Queues + Health) — Tasks

> **Status**: tasks 1-12 concluídas. Tasks 13-16 são **follow-ups** registrados formalmente no `design.md` e não fazem parte do escopo desta change (cabe a uma change futura promover cada um a REQ implementado). Esta é uma documentação retroativa — o código foi escrito e este registro o formaliza.

## Implementation Tasks

### Phase 1: Preparation

- [x] Criar diretório `.openspec/changes/observabilidade/`
- [x] Escrever `design.md` (12 REQs RFC 2119 + 4 REQs follow-up + decisões de design)
- [x] Escrever `proposal.md` (CR retroativo, impacto, riscos, alternativas)
- [x] Revisar e aprovar a proposal

### Phase 2: Domain Discovery (BDD)

- [x] Mapear cenários BDD para as 12 REQs implementadas (cobertura 1:1)
  - 1 cenário para `GET /metrics` exposition (REQ-METRICS-001)
  - 1 cenário para histogram de latência (REQ-METRICS-002)
  - 1 cenário para counter de requests (REQ-METRICS-003)
  - 1 cenário para counter de erros 5xx (REQ-METRICS-004)
  - 1 cenário para exclusão de `/health/*` e `/metrics` do scrape (REQ-METRICS-005)
  - 1 cenário para uso de `req.route.path` (REQ-METRICS-006)
  - 1 cenário para cada fila BullMQ (REQ-QUEUE-001, 002, 003)
  - 1 cenário para `removeOnComplete`/`removeOnFail` (REQ-QUEUE-004)
  - 1 cenário para `BullModule.registerQueue` (REQ-QUEUE-005)
  - 1 cenário para `/health/live` e `/health/ready` (REQ-BOOT-001)

### Phase 3: Test Development (ATDD + TDD)

- [x] Escrever testes unitários do `MetricsRegistry` (`registry.spec.ts`)
  - Counter — `inc()` atualiza valor serializado
  - Histogram — `observe()` em bucket correto + serialização de `_sum` e `_count`
  - Gauge — `set()`/`inc()`/`dec()` conforme esperado
  - Serialização Prometheus 0.0.4 (HELP/TYPE)
- [x] Escrever testes unitários do `HttpMetricsInterceptor` (`http-metrics.interceptor.spec.ts`)
  - Incrementa counter por `(method, route, status)`
  - Incrementa counter de erro 5xx
  - Exclui `/health/*` e `/metrics` do scrape
  - Usa `req.route.path` (parametrizado)
  - Histogram de latência com buckets corretos
- [x] Escrever testes unitários dos 3 processors (`*.processor.spec.ts`)
  - `EmailProcessor` — processa job e respeita retry/backoff
  - `AuditProcessor` — persiste evento sanitizado
  - `RefreshFlushProcessor` — limpa tokens expirados
- [x] Escrever testes e2e em `test/observabilidade.e2e-spec.ts`
  - `GET /metrics` retorna 200 com `Content-Type: text/plain; version=0.0.4; charset=utf-8`
  - `GET /health/live` retorna 200 sem dependência externa
  - `GET /health/ready` pinga Postgres
  - Filas aceitam jobs via `InjectQueue` (teste de integração leve)
- [x] Verificar que todos os testes passaram (Green Phase)
- [x] `npm run validate:quick` (lint + typecheck + testes) — passa
- [x] `npm run security:check` — passa

### Phase 4: Metrics (REQ-METRICS-001..006)

- [x] REQ-METRICS-001: `MetricsController` expõe `GET /metrics` em text format 0.0.4, `@Public()`, com `Content-Type` correto
  - Arquivo: `src/shared/infrastructure/metrics/metrics.controller.ts`
- [x] REQ-METRICS-002: `HttpMetricsInterceptor` emite histogram de latência com labels `(method, route, status)` e buckets `[5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]` ms
  - Arquivo: `src/shared/infrastructure/metrics/http-metrics.interceptor.ts`
  - Histogram primitivo: `src/shared/infrastructure/metrics/registry.ts`
- [x] REQ-METRICS-003: `HttpMetricsInterceptor` emite counter de requests HTTP com labels `(method, route, status)` para RED
- [x] REQ-METRICS-004: `HttpMetricsInterceptor` emite counter de erros HTTP (status >= 500) com labels `(method, route)`, incrementado em `tap.error`
- [x] REQ-METRICS-005: `HttpMetricsInterceptor` exclui do scrape as rotas `/health/*` e `/metrics` (constante `EXCLUDED_PATHS`)
- [x] REQ-METRICS-006: `HttpMetricsInterceptor` usa `req.route.path` (parametrizado, ex: `/usuarios/:id`) em vez de `req.path` bruto, para evitar explosão de cardinalidade
  - Linhas: `http-metrics.interceptor.ts:48-55`

### Phase 5: Queues (REQ-QUEUE-001..005)

- [x] REQ-QUEUE-001: `EmailProcessor` processa envios de e-mail transacional em fila assíncrona `email` com retry exponencial (attempts=3, backoff 1s → 2s → 4s)
  - Constantes: `src/shared/infrastructure/queues/queue.constants.ts`
  - Consumer: `src/shared/infrastructure/queues/processors/email.processor.ts`
  - Module: `src/shared/infrastructure/queues/queues.module.ts`
- [x] REQ-QUEUE-002: `AuditProcessor` persiste eventos de auditoria em fila assíncrona `audit`, desacoplando o `AuditInterceptor` do request
  - Dados já chegam sanitizados (LGPD — `cpf/cnpj/telefone/email` mascarados como `********`) do `AuditInterceptor`
  - Consumer: `src/shared/infrastructure/queues/processors/audit.processor.ts`
  - Sanitização: `src/shared/infrastructure/interceptors/audit.interceptor.ts`
- [x] REQ-QUEUE-003: `RefreshFlushProcessor` permite flush periódico de refresh tokens expirados via fila assíncrona `refresh-flush`
  - Scheduling (cron) é responsabilidade de endpoint admin ou scheduler externo
  - Consumer: `src/shared/infrastructure/queues/processors/refresh-flush.processor.ts`
  - Default job options: `queue.constants.ts`
- [x] REQ-QUEUE-004: `queue.constants.ts:DEFAULT_JOB_OPTIONS` configura `removeOnComplete: true` (libera Redis após sucesso) e `removeOnFail: false` (mantém jobs falhos para inspeção via Bull Board) por padrão em todas as filas
- [x] REQ-QUEUE-005: `QueuesModule` expõe as 3 filas via `BullModule.registerQueue` e as exporta para outros módulos (producers) injetarem
  - Arquivo: `src/shared/infrastructure/queues/queues.module.ts`

### Phase 6: Health (REQ-BOOT-001)

- [x] REQ-BOOT-001: `HealthController` expõe health checks via `@nestjs/terminus` com rotas separadas:
  - `GET /health/live` — liveness (200 enquanto o processo responde; sem dependências externas para não cascade-failure)
  - `GET /health/ready` — readiness (ping Postgres + disco)
  - Ambas `@Public()`
  - Controller: `src/shared/infrastructure/health/health.controller.ts`
  - Module: `src/shared/infrastructure/health/health.module.ts`
  - **Nota**: `/health/network` (que pingava Google) foi removido em [HEALTH-002] porque causava cascading failure em prod quando o provedor perdia internet

### Phase 7: Boot Determinístico

- [x] Instrumentação de `src/main.ts` com logs estruturados e validação de envs via Joi
- [x] Ordem de bootstrap determinística (config → tracing → app → listeners)
- [x] `AppModule` registra `MetricsModule`, `QueuesModule`, `HealthModule`
- [x] Guards globais preservados (`AuthGuard`, `ThrottlerGuard`, `PermissaoGuard`)

### Phase 8: Configuration

- [x] Adicionar envs Redis (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`) em `.env.example` e schema Joi
- [x] Documentar comportamento `@Public()` de `/metrics` e `/health/*` (intencional em dev; em prod, allowlist no ingress via REQ-METRICS-009)

### Phase 9: Verification

- [x] Rodar testes de aceitação — passam (Green Phase)
- [x] Rodar testes unitários — passam
- [x] `npm run validate:quick` (lint + typecheck + testes) — passa
- [x] `npm run security:check` — passa
- [x] CI post-merge run #12 — verde

### Phase 10: Documentation

- [x] Criar `src/shared/infrastructure/metrics/README.md` documentando `/metrics`, scrape, labels e cardinalidade
- [x] Criar `src/shared/infrastructure/queues/README.md` documentando as 3 filas, retry/backoff, Bull Board
- [x] Criar `src/shared/infrastructure/health/README.md` documentando liveness/readiness e a remoção de `/health/network`
- [x] Atualizar `AGENTS.md` raiz com referência aos módulos de observabilidade (catalog + endpoints)
- [x] Criar este CR retroativo (`.openspec/changes/observabilidade/{proposal,design,tasks}.md`)

### Phase 11: Deployment / Archive

- [x] Merge dos commits (changelog presente no histórico git — 7+ commits referenciando a change)
- [x] Validado em produção via CI post-merge run #12
- [ ] Arquivar specs em `.openspec/specs/observabilidade.md` — **pendente de promoção** ao fechar o ciclo de OpenSpec; o artefato canônico atual é este CR em `changes/`

## Follow-ups (open — NÃO done)

> Estas 4 REQs estão **registradas** no `design.md` §"Open Requirements" mas **não foram implementadas** nesta change. Cada uma precisa de uma change própria (ou de um batch de follow-up) para ser promovida de REQ aberta a REQ done.

- [ ] **REQ-METRICS-007** — Wire `prismaPoolActive`/`prismaPoolIdle` aos eventos do Prisma Client. Hoje emitem `0`.
- [ ] **REQ-METRICS-008** — Wire `bullQueueWaiting/Active/Failed` aos eventos `Queue.on('waiting'/'active'/'failed')` do BullMQ. Hoje emitem `0`.
- [ ] **REQ-METRICS-009** — Allowlist de IPs em `/metrics` (atualmente `@Public()` — qualquer um pode raspar). O comentário em `metrics.controller.ts:10-13` já alerta que isso é INTENCIONAL em dev, mas em prod exige allowlist no ingress.
- [ ] **REQ-QUEUE-006** — Adicionar `@nestjs/schedule` cron que enfileira `refresh-flush` diariamente. Hoje o `RefreshFlushProcessor` existe mas nada enfileira.

## Task Dependencies (as executed)

```
MetricsRegistry (registry.ts)
        ↓
HttpMetricsInterceptor (http-metrics.interceptor.ts)
MetricsController (metrics.controller.ts)
MetricsModule (wiring)
        ↓
queue.constants.ts (DEFAULT_JOB_OPTIONS)
        ↓
3 processors (email, audit, refresh-flush)
        ↓
QueuesModule (BullModule.registerQueue + export)
        ↓
HealthController + HealthModule (@nestjs/terminus)
        ↓
AppModule (registra MetricsModule + QueuesModule + HealthModule)
        ↓
test/observabilidade.e2e-spec.ts + *.spec.ts (TDD retroativo, todos verdes)
        ↓
src/shared/infrastructure/{metrics,queues,health}/README.md + AGENTS.md
        ↓
.openspec/changes/observabilidade/{proposal,design,tasks}.md
```

## File-by-File Traceability

| Arquivo | Propósito | Requisitos cobertos |
|---------|-----------|----------------------|
| `src/shared/infrastructure/metrics/registry.ts` | `MetricsRegistry`, `Counter`, `Histogram`, `Gauge` (in-house, sem `prom-client`) | REQ-METRICS-001, 002, 003, 004 |
| `src/shared/infrastructure/metrics/metrics.controller.ts` | `GET /metrics` Prometheus exposition | REQ-METRICS-001, 009 (open) |
| `src/shared/infrastructure/metrics/metrics.module.ts` | Wiring do metrics | REQ-METRICS-001 |
| `src/shared/infrastructure/metrics/http-metrics.interceptor.ts` | Instrumenta todas as rotas, exclui `/health/*` e `/metrics`, usa `req.route.path` | REQ-METRICS-002, 003, 004, 005, 006 |
| `src/shared/infrastructure/metrics/registry.spec.ts` | Testes unitários do registry (Counter/Histogram/Gauge/serialização) | Cobertura TDD do registry |
| `src/shared/infrastructure/metrics/http-metrics.interceptor.spec.ts` | Testes unitários do interceptor (RED, exclusão, cardinalidade) | Cobertura TDD do interceptor |
| `src/shared/infrastructure/queues/queue.constants.ts` | `EMAIL_QUEUE`, `AUDIT_QUEUE`, `REFRESH_FLUSH_QUEUE`, `DEFAULT_JOB_OPTIONS` | REQ-QUEUE-001, 002, 003, 004 |
| `src/shared/infrastructure/queues/processors/email.processor.ts` | Consumer de e-mails transacionais com retry/backoff | REQ-QUEUE-001 |
| `src/shared/infrastructure/queues/processors/audit.processor.ts` | Consumer de eventos de auditoria sanitizados (LGPD) | REQ-QUEUE-002 |
| `src/shared/infrastructure/queues/processors/refresh-flush.processor.ts` | Consumer de flush de refresh tokens | REQ-QUEUE-003 |
| `src/shared/infrastructure/queues/queues.module.ts` | `BullModule.registerQueue` + export para producers | REQ-QUEUE-005 |
| `src/shared/infrastructure/queues/queues.module.ts` (Reflect metadata) | Estrutura com Reflect metadata e providers | REQ-QUEUE-005 |
| `src/shared/infrastructure/health/health.controller.ts` | `GET /health/live` e `GET /health/ready` | REQ-BOOT-001 |
| `src/shared/infrastructure/health/health.module.ts` | Integração `@nestjs/terminus` | REQ-BOOT-001 |
| `src/main.ts` | Boot determinístico com instrumentação | REQ-BOOT-001 (instrumentação) |
| `src/app.module.ts` | Registra MetricsModule + QueuesModule + HealthModule | REQ-BOOT-001, REQ-QUEUE-005 |
| `src/shared/infrastructure/interceptors/audit.interceptor.ts` | Sanitização LGPD (`********`) + enfileiramento em `audit` | REQ-QUEUE-002 |
| `test/observabilidade.e2e-spec.ts` | Testes e2e de `/metrics`, `/health/*` e filas | Cobertura ATDD |
| `src/shared/infrastructure/metrics/README.md` | Documentação de scrape, labels, cardinalidade | REQ-METRICS-001, 005, 006 |
| `src/shared/infrastructure/queues/README.md` | Documentação de filas, retry, Bull Board | REQ-QUEUE-001, 002, 003, 004 |
| `src/shared/infrastructure/health/README.md` | Documentação liveness/readiness e remoção de `/health/network` | REQ-BOOT-001 |
| `.openspec/changes/observabilidade/proposal.md` | CR retroativo (decisão, impacto, riscos) | — |
| `.openspec/changes/observabilidade/design.md` | Spec RFC 2119 + decisões + 4 REQs open | Todas as REQs implementadas + open |
| `.openspec/changes/observabilidade/tasks.md` | Este arquivo | — |

## Notes

- Cada task foi commit-ada com conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- A spec é retroativa: o código veio primeiro, a documentação OpenSpec vem depois — o oposto do fluxo `DDD→BDD→SDD→ATDD→TDD` em modo prospectivo.
- O `MetricsRegistry` é **in-house** (sem `prom-client`); serialization é testada em `registry.spec.ts`.
- A remoção de `/health/network` ([HEALTH-002]) é a única alteração retroativa relevante — documentada em `health.module.ts` e no `health/README.md`.
- Os 4 follow-ups (REQ-METRICS-007, 008, 009, REQ-QUEUE-006) **MUST** ser tratados em change(s) própria(s) antes de serem promovidos a REQs done.
- Mudanças futuras no contrato `/metrics`, `/health/*` ou nas filas BullMQ **MUST** ser feitas em uma nova change request (princípio IEEE 29148 de baseline).

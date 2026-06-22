# Cross-Cutting Requirements (work-in-progress backlog)

> **Propósito**: este arquivo é o registro canônico de requirements
> cross-cutting (segurança, resiliência, observabilidade operacional)
> que **NÃO** foram implementados ainda, mas têm código defensável
> (`work-in-progress`) já no repositório aguardando ativação.
>
> Convenção: cada requirement vira um REQ-CC-* com rastreabilidade
> para o código existente e para os testes que o validam. Quando uma
> REQ-CC for ativada, ela migra do `cross-cutting.md` para o
> `design.md` da change correspondente e ganha um `tasks.md` entry.

## REQ-CC-IDEMPOTENT-001 — Idempotency-Key em POSTs sensíveis

### Status

- **Estado**: `work-in-progress` (código existe, NÃO está ativado).
- **Severidade**: MEDIUM (backlog post-merge 2026-06-19).
- **Origem**: analista-qualidade + analista-backend (achado convergente).
- **Issue de tracking**: backlog `docs/backlog/post-merge-2026-06-19.md`
  linha 345 — "Sem `Idempotency-Key` em POSTs sensíveis".

### Problema

Retries de rede (cliente recebe `timeout` mas servidor processou) podem
criar **2 recursos duplicados** (2 usuários, 2 cobranças, 2 e-mails de
recuperação enviados). Em B2B, isso é bilheteria para estorno +
retrabalho manual de suporte.

Solução padrão de mercado (Stripe, PayPal, Square): aceitar header
`Idempotency-Key` (UUID v4 / ULID) e cachear a primeira response por
24h. Replays retornam a response cacheada com header
`Idempotency-Replayed: true`.

### Rastreabilidade do código existente (WIP)

- **Interceptor**:
  `src/shared/infrastructure/interceptors/idempotency.interceptor.ts`
  - Lê header `Idempotency-Key` da request.
  - Se ausente ou inválido (comprimento < 8 ou > 255): **no-op** —
    comportamento padrão da API é preservado.
  - Se válido: busca em `CACHE_MANAGER` (Redis) a chave
    `idempotency:<key>`; em caso de hit, retorna a response cacheada
    com status preservado e header `Idempotency-Replayed: true`.
  - Em caso de miss: executa o handler e cacheia **somente respostas
    2xx** (4xx/5xx podem ser retentados legitimamente — transientes).
  - TTL: 24h (constante `TTL_MS`).
  - Falha de cache é **warn** (não derruba o request).
- **Spec** (5 cenários, todos verdes):
  `src/shared/infrastructure/interceptors/idempotency.interceptor.spec.ts`
  - no-op quando header ausente.
  - no-op quando header tem formato inválido (curto).
  - replay: retorna response cacheada + seta `Idempotency-Replayed`.
  - cacheia response 2xx.
  - NÃO cacheia response 4xx (cliente pode retentar).

### Por que NÃO está ativado

Decisão consciente. Razões (em ordem de peso):

1. **Activation é mudança de comportamento observável.** Mesmo com
   no-op default (header ausente), registrar o interceptor globalmente
   significa que o `HttpMetricsInterceptor` (depois do `LoggingInterceptor`
   na ordem de providers) vai medir uma rota a mais no caminho crítico.
   Precisamos de um `before/after` benchmark antes de promover.
2. **Replays precisam ser auditáveis.** Hoje o interceptor apenas loga
   `debug` em caso de replay. Para POSTs sensíveis (auth, billing) o
   replay deveria emitir um evento de auditoria (`AuditInterceptor` +
   `audit` queue), garantindo LGPD-rastreabilidade de "quem tentou
   replay".
3. **Configurabilidade ainda não decidida.** O TTL de 24h e o
   prefixo `idempotency:` são hard-coded. Para multi-tenant, faz
   sentido namespace por `empresaId` (evita colisão entre tenants
   que usem a mesma UUID v4). Falta `AppConfig` entries.
4. **Cardinalidade do Redis.** Cada `Idempotency-Key` distinta vira
   uma entrada Redis. Sem rate-limit por chave, um cliente com bug
   pode encher o Redis. Falta `IdempotencyRateLimitGuard` ou
   equivalente.
5. **Backlog priorizou MEDIUM, não HIGH.** O time escolheu conscientemente
   _não_ ativar nesta sprint. O interceptor fica no repo como
   "código pronto, decisão postergada".

### Requirements formais (RFC 2119) — para futura ativação

- **REQ-CC-IDEMPOTENT-001.1**: The system **MUST** aceitar o header
  `Idempotency-Key` (string 8-255 chars) em POSTs e **SHOULD** retornar
  a response cacheada em caso de replay dentro do TTL configurável
  (default 24h), com header `Idempotency-Replayed: true`.
  - Rastreabilidade planejada:
    `src/shared/infrastructure/interceptors/idempotency.interceptor.ts:39-90`

- **REQ-CC-IDEMPOTENT-001.2**: The system **MUST** cachear **somente**
  respostas com `2xx`. Respostas `4xx` e `5xx` **MUST NOT** ser
  cacheadas (cliente pode retentar legitimamente).
  - Rastreabilidade planejada:
    `idempotency.interceptor.ts:76-86`

- **REQ-CC-IDEMPOTENT-001.3**: O TTL **MUST** ser configurável via
  `AppConfig` (env `IDEMPOTENCY_TTL_MS`, default 24h).
  - Pendente: extrair `TTL_MS` para `AppConfig`.

- **REQ-CC-IDEMPOTENT-001.4**: O cache key **SHOULD** incluir
  `empresaId` no namespace (multi-tenant isolation):
  `idempotency:<empresaId>:<key>`. **MAY** ser abreviado se a chave
  for UUID v4 (probabilidade de colisão cross-tenant desprezível).
  - Pendente: decidir.

- **REQ-CC-IDEMPOTENT-001.5**: Replays em POSTs sensíveis (auth,
  billing) **MUST** emitir evento de auditoria via `AuditInterceptor`
  + `audit` queue (LGPD rastreabilidade).
  - Pendente: adicionar `Reflector.get(AUDIT_KEY, ...)` check no
    interceptor (similar a `AuditInterceptor`).

- **REQ-CC-IDEMPOTENT-001.6**: O interceptor **MUST** ser registrado
  em `app.module.ts` via `APP_INTERCEPTOR` apenas **após** os
  requirements 1.3-1.5 serem satisfeitos.
  - Pendente: ativação.

### Critérios de aceitação para promoção (work-in-progress → done)

1. `AppConfig` expõe `IDEMPOTENCY_TTL_MS` com default 24h e teste unitário.
2. Decisão documentada sobre namespace multi-tenant (REQ-CC-IDEMPOTENT-001.4).
3. Replay emite evento de auditoria com `acao: 'idempotency.replay'`
   e `recurso: '<controller-name>'`.
4. Spec de integração (e2e) cobrindo: POST sem header (no-op),
   POST com header (caches response), POST repetido (replay),
   POST com 4xx (não cacheia).
5. `IdempotencyInterceptor` registrado em `app.module.ts` providers
   com `{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }`.
6. Métrica Prometheus `idempotency_replays_total` adicionada ao
   `MetricsRegistry` (counter com label `recurso`).
7. PR review com pelo menos 1 aprovação de tech lead e LGTM do SRE
   (replay em produção = mudança observável).

### Riscos da ativação prematura

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Redis enche por bug de cliente | Média | Alto | Rate-limit por `Idempotency-Key` (futuro) |
| Replay mal cacheado (response 4xx) | Baixa (testado) | Alto | Spec já cobre (linha 127-147 do spec) |
| TTL longo demais (24h) | Baixa | Médio | Tornar configurável (REQ 1.3) |
| Colisão cross-tenant | Baixa (UUID v4) | Alto | Namespace por empresa (REQ 1.4) |
| Replay sem auditoria LGPD | Média | Alto | REQ 1.5 (pendente) |

### Refs internas

- Código: `src/shared/infrastructure/interceptors/idempotency.interceptor.ts`
- Spec: `src/shared/infrastructure/interceptors/idempotency.interceptor.spec.ts`
- Backlog: `docs/backlog/post-merge-2026-06-19.md:345`
- Validation report: `docs/superpowers/plans/2026-06-19-post-merge-validation-report.md:156`
- Soft-delete reference (NFR-SD-005 sobre idempotency): `.openspec/changes/soft-delete/design.md:75`

### Refs externas

- Stripe API — Idempotent Requests: <https://stripe.com/docs/api/idempotent_requests>
- IETF draft — The Idempotency-Key HTTP Header Field: <https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/>
- PayPal — API Idempotency: <https://developer.paypal.com/api/rest/reference/idempotency/>

## REQ-CC-CTX-001 — Propagação de contexto request → job BullMQ

### Status

- **Estado**: `parcialmente implementado` — contexto é capturado
  no `EmpresaInterceptor` e exposto via `ContextStorage` (AsyncLocalStorage),
  **mas** a propagação para dentro dos `@Processor` BullMQ **NÃO** está
  implementada hoje (os consumers rodam em worker thread/process separado
  e o `AsyncLocalStorage` da request morre com o request).
- **Severidade**: MEDIUM (audit/log correlation gap).
- **Origem**: analista-backend (achado durante varredura
  `2026-06-21` da `change/observabilidade`).
- **Issue de tracking**: backlog `docs/backlog/post-merge-2026-06-19.md`
  (a abrir) — "tenantId/requestId não propagam para jobs BullMQ".

### Problema

O `ContextStorage` (AsyncLocalStorage) é setado no `EmpresaInterceptor`
para carregar `{ empresaId, usuarioId, requestId }` durante o ciclo de
vida da request HTTP. O `PrismaExtension` já consome esse store para
injetar `empresaId` automaticamente em queries (multi-tenancy).

**Hoje, quando um job é enfileirado** (`queue.add` em
`AuditInterceptor`, `RefreshTokenService.flush`, etc.), o payload que
vai para o Redis **NÃO** carrega `empresaId`/`requestId`. Quando o
`@Processor` (Email/Audit/RefreshFlush) acorda em outro
worker/process, o `contextStorage.getStore()` retorna `undefined`.

Consequências observáveis:

- Logs do processor ficam sem `tenantId` (ex.: `[audit] processando
  job 42 acao=usuario.create` — sem saber de qual tenant veio).
- Métricas `bull_job_processed_total` (se existirem) não correlacionam
  com `requestId` do enqueue.
- Auditoria perde a cadeia causal: "qual request originou este job
  audit?" exige correlação por timestamp+conteúdo, não por chave.
- Se um processor precisar consultar Prisma com RLS-by-tenant via
  `PrismaExtension`, ele não vai ter `empresaId` no store — queries
  com `where: { empresaId: ... }` falham silenciosamente.

### Rastreabilidade do código existente

- **Storage**: `src/shared/infrastructure/services/context.storage.ts:13`
  - Singleton `contextStorage = new AsyncLocalStorage<IRequestContext>()`.
  - Interface `IRequestContext { empresaId?, usuarioId?, requestId? }`.
- **Setter (request lifecycle)**:
  `src/shared/infrastructure/interceptors/empresa.interceptor.ts:84`
  - `contextStorage.run(contextData, () => { next.handle().subscribe(...) })`.
  - Popula `requestId` (header `x-request-id` ou `uuidv4()`) e,
    se autenticado, `usuarioId` + `empresaId` (header validado contra
    JWT — SEC-005).
- **Consumers (AsyncLocalStorage morre aqui)**:
  - `EmailProcessor.process()` — `email.processor.ts:41`
  - `AuditProcessor.process()` — `audit.processor.ts:43`
  - `RefreshFlushProcessor.process()` — `refresh-flush.processor.ts:30`
  - **Nenhum** chama `contextStorage.run(...)` ou lê o store.

### Por que NÃO está totalmente implementado

1. **BullMQ roda em worker context separado.** Mesmo que o producer
   (request) chame `queue.add()` dentro de `contextStorage.run(...)`,
   o BullMQ serializa o job para Redis e o consumer (worker thread ou
   processo) **não herda** o `AsyncLocalStorage` do producer. A
   propagação exige copiar `IRequestContext` para o payload do job
   (`queue.add(data, { ... })`) e o consumer restaurar via
   `contextStorage.run(payload.__ctx, () => process(...))`.
2. **Não há `BaseProcessor` comum.** Os 3 processors herdam
   `WorkerHost` diretamente; nenhum hook centralizado para restaurar
   contexto. Mudança é transversal.
3. **Risk de leak cross-tenant se mal implementado.** Se a chave
   `__ctx` ficar no payload e o job for re-enfileirado por outro tenant
   (ex.: reprocess manual via Bull Board), o contexto "stale" pode
   vazar — defesa adicional necessária.
4. **PrismaExtension já roda fora de request lifecycle.** O processor
   acessa Prisma direto (`this.prisma.auditLog.create(...)`) — mesmo
   que o store seja restaurado, a tenant via `PrismaExtension` exige
   que o store seja o mesmo do request, não um re-derivado.

### Requirements formais (RFC 2119) — para fechamento

- **REQ-CC-CTX-001.1**: The system **MUST** expor `IRequestContext` via
  `contextStorage.getStore(): IRequestContext | undefined`
  (já implementado em `context.storage.ts:13`).
  - Rastreabilidade: `context.storage.ts:13`.

- **REQ-CC-CTX-001.2**: The system **MUST** popular
  `contextStorage.run(...)` no início de cada request autenticada via
  `EmpresaInterceptor` (já implementado em `empresa.interceptor.ts:84`).
  - Rastreabilidade: `empresa.interceptor.ts:84`.

- **REQ-CC-CTX-001.3**: Produtores BullMQ (`queue.add`) **MUST** copiar
  o snapshot atual de `contextStorage.getStore()` para o payload do
  job sob a chave `__ctx: IRequestContext` (quando definido).
  - Pendente: helper `withContext(queue.add)(name, data, opts)` em
    `queues.module.ts` ou wrapper em cada producer.

- **REQ-CC-CTX-001.4**: Consumidores (`@Processor`) **MUST** restaurar
  o contexto no início de `process(job)` via
  `contextStorage.run(job.data.__ctx ?? {}, () => ...)` antes de
  qualquer chamada a Prisma/logger.
  - Pendente: refatorar 3 processors (`email`, `audit`, `refresh-flush`)
    ou criar `BaseProcessor` com hook `withContext(process)`.

- **REQ-CC-CTX-001.5 (SHOULD)**: `MetricsRegistry` **SHOULD** correlacionar
  `requestId` em `http_requests_total` e em uma nova métrica
  `bull_job_processed_total{queue, requestId, status}` (counter) para
  permitir tracing end-to-end (HTTP → job).
  - Pendente: adicionar counter + correlação no processor wrapper.

### Critérios de aceitação para promoção (parcial → done)

1. Helper `withContext` criado em `queues.module.ts` (ou
   `shared/queues/`) e usado por todos os producers existentes
   (`AuditInterceptor`, refresh-flush trigger).
2. `BaseProcessor` criado com hook `withContext(process)` e os 3
   processors refatorados para estender `BaseProcessor` em vez de
   `WorkerHost` diretamente.
3. Logger dos processors inclui `tenantId` (extraído de
   `contextStorage.getStore().empresaId`).
4. Spec e2e valida:
   - Request de tenant A enfileira job (ex.: audit).
   - Processor log mostra `tenantId=empresaA` (não `undefined`).
   - Prisma call dentro do processor via `PrismaExtension` carrega
     `empresaId=empresaA`.
5. Métrica `bull_job_processed_total{queue, status}` adicionada
   ao `MetricsRegistry` (com label `requestId` opcional — alta
   cardinalidade, considerar opt-in).

### Riscos da implementação

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Context stale em reprocess manual (Bull Board) | Média | Alto | Validar `__ctx.requestId`/`createdAt`; ignorar se > 24h |
| Cardinalidade Prometheus explodir com `requestId` | Alta | Médio | Label opcional; default off |
| Refator de 3 processors sem testes | Média | Alto | TDD: spec unitário do `BaseProcessor` antes de migrar |
| TenantId ausente em processor (ex.: refresh-flush global) | Baixa | Médio | Default `{}` store é aceitável para jobs sem tenant |

### Refs internas

- Storage: `src/shared/infrastructure/services/context.storage.ts:13`
- Setter: `src/shared/infrastructure/interceptors/empresa.interceptor.ts:84`
- Consumers: `src/shared/infrastructure/queues/processors/*.processor.ts`
- PrismaExtension consumer: `src/prisma/prisma-extension.ts:52,160,169`
- EmpresaContext consumer: `src/shared/infrastructure/services/empresa-context.service.ts:11,18,26,33,41`

## REQ-CC-METRICS-EXCLUDE-001 — Exclusão de rotas operacionais do scrape

### Status

- **Estado**: `implementado` (código em produção, falta apenas
  rastreabilidade formal como `REQ-CC-*`).
- **Severidade**: LOW (cosmético, sem impacto funcional — mas
  séries temporais ficam poluídas sem isso).
- **Origem**: analista-backend (achado durante varredura
  `2026-06-21`).
- **Issue de tracking**: nenhuma (pre-existente, sem ticket).

### Problema

O `HttpMetricsInterceptor` instrumenta **todos** os endpoints HTTP
para emitir métricas RED (Rate/Errors/Duration) no Prometheus.
Porém, certos endpoints são **ruído operacional** e devem ser
excluídos do scrape:

- `/health` (live/ready) — k8s probes pingam a cada 5-30s; medir
  esses requests polui `http_requests_total` com tráfego sintético
  que não reflete uso real.
- `/metrics` — Prometheus scrapes a cada 15-60s; medir o próprio
  endpoint de scrape gera auto-referência (request count inflado
  por N scrapers × frequência).
- `/` — root endpoint (geralmente 404 ou redirect); trivial, ruído.
- `/favicon.ico` — browsers fazem GET automático; alta cardinalidade
  sem valor de negócio (atualmente retornado pelo Fastify como
  404, mas se um favicon for adicionado futuramente, medir isso
  não agrega).

### Rastreabilidade do código existente

- **Constante `EXCLUDED_PATHS`**:
  `src/shared/infrastructure/metrics/http-metrics.interceptor.ts:30`
  - `const EXCLUDED_PATHS = new Set(['/health', '/metrics', '/']);`
  - **Nota**: `/favicon.ico` **NÃO** está na constante atual —
    ver REQ-CC-METRICS-EXCLUDE-001.1.b.
- **Skip logic**:
  `src/shared/infrastructure/metrics/http-metrics.interceptor.ts:43`
  - `if (EXCLUDED_PATHS.has(pathOnly)) { return next.handle(); }`
  - Strip query string (`rawPath.split('?')[0]`) antes do lookup.
  - Match é exato (não prefix), então `/health/live` **NÃO** é
    excluído (deveria ser? ver REQ-CC-METRICS-EXCLUDE-001.1.c).
- **Endpoint público**: `src/shared/infrastructure/metrics/metrics.controller.ts:33`
  - `@Public()` decorator para que `AuthGuard`/`PermissaoGuard` não
    exijam JWT (scrapers não conhecem JWT).
  - Content-Type oficial: `text/plain; version=0.0.4; charset=utf-8`.

### Por que é importante

- Poluição de séries temporais: 1 scraper Prometheus × 60s scrape =
  86.400 requests/dia **só** de `/metrics` (e mais 8.640 de
  `/health/live` × 2 probes). Sem exclusão, isso infla a métrica
  `http_requests_total{route="/metrics",method="GET"}` em ~5x o
  tráfego de negócio real (em sistemas de baixo volume).
- Auto-referência: medir o próprio `/metrics` faz o
  `http_requests_total` crescer com o scrape, criando feedback
  loop em dashboards (`http_requests_total` → alerta → "sistema
  está sobrecarregado" → alerta em loop).
- Cardinalidade de labels: `http_requests_total` tem labels
  `{method, route, status}`. Se `/favicon.ico` for adicionado com
  status 200 e 404 alternados, são 2 séries novas; se retornar
  sempre 404, é 1 série — mas é ruído.

### Requirements formais (RFC 2119) — consolidação

- **REQ-CC-METRICS-EXCLUDE-001.1**: `HttpMetricsInterceptor` **MUST**
  excluir do scrape paths que casem com `EXCLUDED_PATHS` (atualmente
  `/health`, `/metrics`, `/`).
  - 1.1.a: O match **MUST** ser exato no path (sem query string) —
    já implementado em `http-metrics.interceptor.ts:42-44`.
  - 1.1.b: `/favicon.ico` **SHOULD** ser adicionado a
    `EXCLUDED_PATHS` (atualmente ausente). Pendente: 1 linha.
  - 1.1.c: `/health/live` e `/health/ready` **MUST** ser excluídos
    via prefix-match (hoje só `/health` exato está excluído — bug
    latente: `http_requests_total{route="/health/live"}` está sendo
    contado). Pendente: trocar `Set.has` por `startsWith` ou
    adicionar ambos explicitamente.

- **REQ-CC-METRICS-EXCLUDE-001.2**: `MetricsController.getMetrics`
  **MUST** ser `@Public()` para permitir scrape do Prometheus sem
  JWT.
  - Já implementado em `metrics.controller.ts:33`.
  - Rastreabilidade: `metrics.controller.ts:33`.

- **REQ-CC-METRICS-EXCLUDE-001.3 (SHOULD)**: Em produção, `/metrics`
  **MUST** estar atrás de allowlist de IPs (NFR operacional, fora
  do escopo do app — responsabilidade de ingress/rede).
  - Já documentado no header do controller:
    `metrics.controller.ts:10-13`.
  - Rastreabilidade: `metrics.controller.ts:10-13` (comentário).

- **REQ-CC-METRICS-EXCLUDE-001.4 (MAY)**: O `EXCLUDED_PATHS` **MAY**
  ser configurável via `AppConfig` (env `METRICS_EXCLUDED_PATHS`)
  para permitir extensibilidade sem deploy.
  - Pendente: extrair para `AppConfig` se houver demanda real.

### Critérios de aceitação (implementado → done formal)

1. `EXCLUDED_PATHS` cobre `/health`, `/health/live`, `/health/ready`,
   `/metrics`, `/`, `/favicon.ico` (atualmente só os 3 primeiros
   parciais — ver 1.1.b e 1.1.c).
2. Spec unitário do `HttpMetricsInterceptor` valida que requests
   para paths excluídos **NÃO** incrementam `httpRequests` counter
   (verificar via `registry.httpRequests.get()` mock).
3. Spec e2e (`test/metrics.e2e-spec.ts`) valida que `GET /health/live`
   e `GET /metrics` **NÃO** aparecem em
   `http_requests_total{method="GET"}`.
4. `MetricsController` é `@Public()` (já está).
5. Documentação operacional (runbook) menciona que `/metrics` deve
   ser exposto **apenas** em rede interna ou com auth no ingress.

### Refs internas

- Implementação: `src/shared/infrastructure/metrics/http-metrics.interceptor.ts:30,43`
- Controller: `src/shared/infrastructure/metrics/metrics.controller.ts:33`
- Spec interceptor: `src/shared/infrastructure/metrics/http-metrics.interceptor.spec.ts`
- Spec controller: `src/shared/infrastructure/metrics/metrics.controller.spec.ts`
- E2E: `test/metrics.e2e-spec.ts`
- Design: `.openspec/changes/observabilidade/design.md` (REQ-METRICS-001..005)

## Próximas REQ-CC a serem registradas

(Seção reservada para futuras adições seguindo o mesmo template.)

- `REQ-CC-RATE-LIMIT-001` — rate-limit por `Idempotency-Key` (futuro).
- `REQ-CC-API-VERSIONING-001` — versionamento `/v1/...` (futuro).
- `REQ-CC-RLS-001` — Row-Level Security no Postgres (defence in depth).
- `REQ-CC-CTX-001.3` — producer-side `withContext(queue.add)` helper.
- `REQ-CC-CTX-001.4` — `BaseProcessor` com hook `withContext(process)`.
- `REQ-CC-METRICS-EXCLUDE-001.1.b` — adicionar `/favicon.ico` ao exclude.
- `REQ-CC-METRICS-EXCLUDE-001.1.c` — prefix-match para `/health/*`.

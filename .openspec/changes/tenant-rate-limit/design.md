# Feature: Rate Limit por Tenant (tenant-rate-limit) — Design Specification

## Overview

A feature **tenant-rate-limit** substitui o rate limit global baseado em IP do [`ThrottlerGuard`](https://docs.nestjs.com/security/rate-limiting) por um rate limit **baseado no plano da empresa** (`Empresa.plano`). O desenho atual (em [`src/app.module.ts`](../../src/app.module.ts)) aplica 4 tiers (`short`, `medium`, `long`, `sensitive`) com limites fixos por IP — o que não diferencia clientes FREE de clientes ENTERPRISE. A nova abordagem:

1. Adiciona o enum `Plano` (`FREE` | `PRO` | `ENTERPRISE`) e a coluna `Empresa.plano` no Prisma.
2. Define um **mapa de limites** (`PLANO_LIMITS`) em `src/shared/infrastructure/throttling/plano-limits.config.ts` associando cada plano aos 4 tiers.
3. Substitui o `ThrottlerGuard` global por um **`TenantThrottlerGuard extends ThrottlerGuard`** que:
   - Extrai o `empresaId` da requisição (header `x-empresa-id` ou `request.user.empresaId` do JWT — via `extractEmpresaId` já existente).
   - Faz **lookup do `Empresa.plano`** com cache Redis (TTL 60s, key `tenant:plano:<empresaId>`).
   - **Substitui dinamicamente** os limites do tier pelos valores de `PLANO_LIMITS[plano]`.
   - **Cai para FREE** em todos os casos de degradação (sem tenant, JWT sem `empresaId`, empresa desativada, plano desconhecido, Redis offline).
4. O `@nestjs/throttler` continua emitindo os headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` em respostas 429 — o guard custom herda esse comportamento.
5. **Retrocompatibilidade preservada**: `@SkipThrottle()` e `@Throttle({ tier: 'X' })` nos controllers continuam funcionando (a override do `handleRequest` só altera o **limite efetivo** do tier, não o conjunto de tiers).

**Casos de uso cobertos:**

- Cliente FREE continua protegido (mesmo limite de antes: 100 req/min no `long`).
- Cliente PRO recebe 10x o teto (1000 req/min no `long`).
- Cliente ENTERPRISE recebe 100x o teto (10000 req/min no `long`).
- Rota pública (sem JWT) é tratada como FREE — segurança por padrão.
- Cliente com empresa desativada ou soft-deletada também cai em FREE.
- Mudança de plano reflete em até 60s (cache TTL).

**Não cobertos** (outras changes ou futuro):

- Auto-upgrade de plano (operação comercial/billing).
- Rate limit por usuário individual (sub-divisão dentro de uma empresa).
- Rate limit por recurso (ex: "X req/min em `POST /usuarios`").
- Billing / métricas de consumo exportadas (Prometheus, etc.).
- Inclusão do `plano` no JWT (decisão consciente: lookup no DB é a fonte da verdade).

## Requirements (RFC 2119)

### Functional Requirements

- **REQ-TR-001**: The system **MUST** persistir o `plano` de cada `Empresa` em uma coluna `plano Plano NOT NULL DEFAULT 'FREE'` no schema Prisma, com os 3 valores válidos do enum `Plano` (`FREE`, `PRO`, `ENTERPRISE`).
  - Rastreabilidade:
    - Migration: `prisma/migrations/20260615190000_add_empresa_plano/migration.sql`
    - Schema: `prisma/schema.prisma` — `enum Plano { FREE PRO ENTERPRISE }` + `model Empresa { plano Plano @default(FREE) }`

- **REQ-TR-002**: The system **MUST** aplicar os limites de rate limit por tier (`short`, `medium`, `long`, `sensitive`) de acordo com o `plano` do tenant identificado na requisição, usando o mapa:
  ```typescript
  export const PLANO_LIMITS = {
    FREE:       { short: 3,   medium: 20,  long: 100,   sensitive: 10  },
    PRO:        { short: 10,  medium: 50,  long: 1000,  sensitive: 20  },
    ENTERPRISE: { short: 30,  medium: 200, long: 10000, sensitive: 100 },
  } as const;
  ```
  - Rastreabilidade:
    - Implementação: `src/shared/infrastructure/throttling/plano-limits.config.ts`
    - TDD: `tenant-throttler.guard.spec.ts:deve mapear plano FREE/PRO/ENTERPRISE para os limites corretos`

- **REQ-TR-003**: The system **MUST** identificar o `empresaId` da requisição via (em ordem de prioridade): (1) `request.user.empresaId` (extraído do JWT pelo `JwtStrategy.validate`), (2) `request.user.empresas[0].id` (multi-tenant JWT), (3) header `x-empresa-id`. Se nenhum estiver presente, **MUST** aplicar o limite `FREE` (degradação graciosa).
  - Rastreabilidade:
    - Reuso: `extractEmpresaId` em `src/shared/application/decorators/empresa-id.decorator.ts` (extender a lógica)
    - TDD: `tenant-throttler.guard.spec.ts:deve extrair empresaId do JWT > do header > fallback FREE`

- **REQ-TR-004**: The system **MUST** resolver o `plano` do `empresaId` identificado consultando o Redis (key `tenant:plano:<empresaId>`, TTL 60s) e, em caso de cache miss, consultando o banco via `PrismaService.empresa.findUnique({ where: { id }, select: { plano: true, ativo: true, deletedAt: true } })`. Se o Redis estiver offline, **MUST** cair para a query Prisma direta (sem lançar exceção).
  - Rastreabilidade:
    - Implementação: `TenantThrottlerGuard.resolvePlano(empresaId): Promise<Plano>` — try/catch no Redis, fallback para Prisma.
    - TDD: `tenant-throttler.guard.spec.ts:deve usar cache hit > cache miss + Prisma > Redis offline + Prisma direto`

- **REQ-TR-005**: The system **MUST** considerar como "tenant inválido" (e aplicar FREE) os casos: (a) `empresaId` ausente na requisição, (b) empresa `ativo = false`, (c) empresa `deletedAt != null`, (d) `empresaId` inexistente no DB. Em todos esses casos, **MUST** logar em `warn` (Pino) com `{ event: 'throttler.tenant_invalid', empresaId?, ip, path, reason }`.
  - Rastreabilidade:
    - TDD: `tenant-throttler.guard.spec.ts:deve cair para FREE quando empresa inativa/soft-deletada/inexistente`
    - TDD: `> deve logar warn com event 'throttler.tenant_invalid'`

- **REQ-TR-006**: The system **MUST** continuar emitindo os headers de resposta 429 fornecidos nativamente pelo `@nestjs/throttler`: `Retry-After` (segundos), `X-RateLimit-Limit` (limite do tier), `X-RateLimit-Remaining` (requisições restantes na janela), `X-RateLimit-Reset` (timestamp ISO de reset). Esses headers **MUST** refletir o **limite efetivo do plano** (não o limite FREE default).
  - Rastreabilidade:
    - Verificação: inspecionar `res.headers` em teste e2e após exceder limite.
    - ATDD: `test/tenant-rate-limit.e2e-spec.ts:deve retornar 429 com Retry-After e X-RateLimit-* quando FREE excede 100 req/min no tier long`

- **REQ-TR-007**: The system **MUST** preservar a semântica de `@SkipThrottle()` (no controller ou método) e `@Throttle({ tier: 'X' })` (override por método). O `TenantThrottlerGuard` apenas substitui o **limite** do tier; o conjunto de tiers aplicados e o skip continuam decididos pelos decorators.
  - Rastreabilidade:
    - TDD: `tenant-throttler.guard.spec.ts:deve respeitar @SkipThrottle() (handleRequest não é chamado)`
    - TDD: `> deve respeitar @Throttle({ tier: 'sensitive' }) selecionando o limite do tier correto`
    - ATDD: `test/auth.e2e-spec.ts` (já existente, deve continuar passando) — endpoints com `@Throttle({ sensitive: ... })` devem usar o limite `sensitive` do plano.

- **REQ-TR-008**: The system **MUST** registrar `TenantThrottlerGuard` no array `providers` de `app.module.ts` via `APP_GUARD`, **substituindo** o `ThrottlerGuard` atual. O `ThrottlerModule.forRoot([...])` permanece **inalterado** (os 4 tiers continuam registrados com os limites default — eles são o "chão" caso o guard custom falhe).
  - Rastreabilidade:
    - Implementação: `src/app.module.ts` — `useClass: TenantThrottlerGuard`
    - Verificação: boot da aplicação deve logar `TenantThrottlerGuard` no stack de guards globais.

### Non-Functional Requirements

- **NFR-TR-001 (Performance)**: O lookup do `plano` **MUST** adicionar < 5ms p99 ao request no caso comum (cache hit no Redis). No caso de cache miss, **MUST** adicionar < 30ms p99 (1 query Prisma na PK `Empresa.id` + set no cache).
  - Rastreabilidade: benchmark via `test/tenant-rate-limit.e2e-spec.ts:deve resolver plano em < 30ms p99` (opcional, mas recomendado); Logger Pino com `latencyMs` em debug.

- **NFR-TR-002 (Resilience)**: Se o Redis estiver indisponível (`cacheManager.get` lança `ConnectionError` ou similar), o `TenantThrottlerGuard` **MUST** continuar funcionando via query Prisma direta. Falha de Redis **MUST NOT** derrubar a aplicação nem retornar 500 ao cliente. Falha **MUST** ser logada em `error` com `{ event: 'throttler.cache_offline', error: <message> }`.
  - Rastreabilidade:
    - TDD: `tenant-throttler.guard.spec.ts:deve degradar graciosamente quando cacheManager.get lança`

- **NFR-TR-003 (Cache consistency)**: O cache `tenant:plano:<empresaId>` **MUST** ter TTL de 60 segundos. Mudanças em `Empresa.plano` (via SQL ou update manual) refletem em até 60s. **MUST NOT** existir invalidação ativa (decisão consciente: operação rara, janela de inconsistência aceitável).
  - Rastreabilidade:
    - Implementação: `cacheManager.set(key, plano, { ttl: 60_000 })`
    - Documentação: README `src/shared/README.md` explica o trade-off.

- **NFR-TR-004 (Security — defense in depth)**: O `plano` **MUST** ser lido exclusivamente do **servidor** (DB) e nunca de header HTTP, query string, ou payload do JWT. O cliente **MUST NOT** ter como forjar o plano. Toda entrada de `empresaId` que não bate com um `Empresa` válido **MUST** cair em FREE (não em PRO/ENTERPRISE).
  - Rastreabilidade: implementação nunca lê `req.headers['x-plano']`; comentário JSDoc explicita. TDD: `> deve ignorar header x-plano spoofing attempt`.

- **NFR-TR-005 (Observability)**: Eventos de throttler **MUST** ser logados estruturadamente em Pino:
  - `throttler.blocked` (warn) — `{ tenantId, plano, tier, ip, path }` quando 429 é retornado.
  - `throttler.tenant_invalid` (warn) — quando tenant não pôde ser resolvido.
  - `throttler.cache_offline` (error) — quando Redis lança.
  - `throttler.cache_miss` (debug) — quando Prisma foi consultado.
  - **MUST NOT** logar o header `Authorization` (Pino redact já configurado em `src/app.module.ts`).
  - Rastreabilidade: testes verificam presença dos logs via spy no `Logger`.

- **NFR-TR-006 (Testability)**: A feature **MUST** manter 100% de cobertura dos 3 cenários BDD em `features/tenant-rate-limit.feature`, com testes e2e em `test/tenant-rate-limit.e2e-spec.ts` (4 testes) e testes unitários em `src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts` (mínimo 5 testes). A suíte e2e completa deve passar sem regressão (testes existentes de `auth`, `empresas`, `perfis`, `permissoes`, `usuarios`).
  - Rastreabilidade: cobertura nos arquivos a serem criados. `.env.test` deve garantir que o tier `long` para tenants FREE de teste tenha limite alto o suficiente para os testes existentes não dispararem 429 (alternativa: cada teste de seed seta `empresa.plano = 'ENTERPRISE'` em `beforeAll`).

- **NFR-TR-007 (API contract stability)**: A mudança de limite **MUST NOT** quebrar clientes existentes: o limite FREE (100 req/min no `long`) é o **piso** e é ≥ ao limite atual (100 req/min) — clientes FREE continuam com o mesmo teto. Clientes PRO/ENTERPRISE **ganham** capacidade (sem quebra). O contrato HTTP não muda (apenas 4 novos headers em respostas 429, que são aditivos).
  - Rastreabilidade: tabela de limites em `PLANO_LIMITS` mostra `FREE.long = 100` (mesmo que o default atual).

- **NFR-TR-008 (Reversibility)**: A mudança é **reversível** com 1 commit de rollback (revert da migration + revert do `app.module.ts` + delete do guard). A coluna `plano` tem `DEFAULT 'FREE'`, então `DROP COLUMN` é seguro.
  - Rastreabilidade: migration é aditiva (sem NOT NULL sem default).

## Acceptance Criteria

- [ ] AC-TR-01: Empresa com `plano = 'FREE'` que executa 100 requests no tier `long` recebe HTTP 200; a request 101 recebe HTTP 429 com `Retry-After`, `X-RateLimit-Limit: 100`, `X-RateLimit-Remaining: 0` e `X-RateLimit-Reset: <ISO timestamp>`.
- [ ] AC-TR-02: Empresa com `plano = 'PRO'` que executa 1000 requests no tier `long` recebe HTTP 200 em todas (sem 429); a request 1001 recebe HTTP 429 com `X-RateLimit-Limit: 1000`.
- [ ] AC-TR-03: Empresa com `plano = 'ENTERPRISE'` que executa 10000 requests no tier `long` recebe HTTP 200 em todas (sem 429); a request 10001 recebe HTTP 429 com `X-RateLimit-Limit: 10000`.
- [ ] AC-TR-04: Requisição **sem JWT** (rota pública) e **sem header** `x-empresa-id` recebe o limite **FREE** (100 req/min no `long`) — verificado disparando 101 requests e observando 429.
- [ ] AC-TR-05: Empresa com `plano = 'PRO'` no DB, mas com `ativo = false`, recebe o limite **FREE** (degradação para tenant inválido). Log `warn` é emitido.
- [ ] AC-TR-06: Cache hit no Redis (key `tenant:plano:<empresaId>`) **não** dispara query Prisma (verificado via spy no `prisma.empresa.findUnique`).
- [ ] AC-TR-07: Cache miss no Redis **dispara** query Prisma **e** popula o cache com TTL 60s.
- [ ] AC-TR-08: Redis offline (`cacheManager.get` lança) **degrada** para query Prisma direta, sem lançar exceção nem retornar 500.
- [ ] AC-TR-09: `@SkipThrottle()` em um método faz o throttler **não** contar a request para esse método (comportamento padrão do NestJS preservado).
- [ ] AC-TR-10: `@Throttle({ sensitive: { limit: 5, ttl: 60000 } })` em um método usa o **limite do tier `sensitive` do plano** (não o 5 hard-coded) — verificado: o limite aplicado é `PLANO_LIMITS[plano].sensitive`.
- [ ] AC-TR-11: O schema Prisma **contém** o enum `Plano` com 3 valores e a coluna `Empresa.plano` com `DEFAULT 'FREE'`.
- [ ] AC-TR-12: A migration `20260615190000_add_empresa_plano` aplica sem erros e backfilla todas as empresas existentes para `plano = 'FREE'`.
- [ ] AC-TR-13: O `TenantThrottlerGuard` é registrado no `app.module.ts` via `APP_GUARD`, **substituindo** o `ThrottlerGuard` (verificado por inspeção do array de providers).
- [ ] AC-TR-14: A suite e2e completa (`npm run test:e2e`) passa sem regressão após a feature ser mergeada.

## API Specification

### Mudança observável: resposta 429

A feature **não adiciona nem remove endpoints**. A mudança observável é a resposta 429 — agora com 4 headers e limite dependente do plano do tenant.

**Request** (exemplo — endpoint genérico `GET /perfis`):

```http
GET /perfis HTTP/1.1
Host: api.example.com
Authorization: Bearer <jwt_com_empresaId_X>
```

**Response 200** (caso comum, dentro do limite):

```http
HTTP/1.1 200 OK
Content-Type: application/json

{ "data": [...], "total": 42, "page": 1, "limit": 10, "totalPages": 5 }
```

**Response 429** (quando o tenant excede o limite do tier `long`):

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 47
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2026-06-15T12:34:21.000Z

{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

**Notas sobre os headers** (gerados nativamente pelo `@nestjs/throttler`):

- `Retry-After`: segundos até a janela resetar (RFC 6585).
- `X-RateLimit-Limit`: limite do tier aplicado (= `PLANO_LIMITS[plano][tier]`).
- `X-RateLimit-Remaining`: requests restantes na janela.
- `X-RateLimit-Reset`: timestamp ISO-8601 do momento em que a janela reseta.

### Mudança observável: response 200 com `@Throttle({ tier: 'sensitive' })`

Em endpoints com `@Throttle({ sensitive: ... })` (ex: `POST /auth/login`), o `X-RateLimit-Limit` retornado em respostas de sucesso (quando o throttler emite o header) reflete o **limite sensitive do plano**:

- FREE: `X-RateLimit-Limit: 10`
- PRO: `X-RateLimit-Limit: 20`
- ENTERPRISE: `X-RateLimit-Limit: 100`

> **Nota**: o `@nestjs/throttler` só emite `X-RateLimit-*` em **todas** as respostas (não só em 429) se o storage for compartilhado — confirmar comportamento na implementação. Caso contrário, os headers aparecem apenas em 429.

## Data Models

### Enum: `Plano` (Prisma — novo)

```prisma
enum Plano {
  FREE
  PRO
  ENTERPRISE
}
```

| Valor | Significado | Limite `long` | Limite `sensitive` |
|-------|-------------|---------------|--------------------|
| `FREE` | Plano gratuito (default para todos) | 100 req/min | 10 req/min |
| `PRO` | Plano profissional (pago) | 1000 req/min | 20 req/min |
| `ENTERPRISE` | Plano corporativo (SLA alto) | 10000 req/min | 100 req/min |

### Model: `Empresa` (Prisma — estendido)

| Campo | Tipo | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `String` (UUID) | Yes | `@default(uuid())` | PK — inalterado |
| `nome` | `String` | Yes | — | Inalterado |
| `descricao` | `String?` | No | — | Inalterado |
| `ativo` | `Boolean` | Yes | `@default(true)` | Inalterado |
| `responsavelId` | `Int` | Yes | — | Inalterado |
| `plano` | `Plano` (enum) | Yes | `@default(FREE)` | **NOVO** — tier de rate limit |
| `createdAt` | `DateTime` | Yes | `@default(now())` | Inalterado |
| `updatedAt` | `DateTime` | Yes | `@updatedAt` | Inalterado |
| `deletedAt` | `DateTime?` | No | — | Inalterado (soft-delete) |

### Config: `PLANO_LIMITS` (TypeScript — novo)

Localização: `src/shared/infrastructure/throttling/plano-limits.config.ts`.

```typescript
export const PLANO_LIMITS = {
  FREE:       { short: 3,   medium: 20,  long: 100,   sensitive: 10  },
  PRO:        { short: 10,  medium: 50,  long: 1000,  sensitive: 20  },
  ENTERPRISE: { short: 30,  medium: 200, long: 10000, sensitive: 100 },
} as const;

export type Plano = keyof typeof PLANO_LIMITS;
export type ThrottlerTier = keyof PlanoLimits;
export type PlanoLimits = (typeof PLANO_LIMITS)[Plano];

export const DEFAULT_PLANO: Plano = 'FREE';
```

### Cache key: `tenant:plano:<empresaId>`

- **Store**: Redis (via `cacheManager` do `@nestjs/cache-manager`).
- **Key pattern**: `tenant:plano:<empresaId>` (ex: `tenant:plano:550e8400-e29b-41d4-a716-446655440000`).
- **Value**: string com o nome do plano (`'FREE'`, `'PRO'`, `'ENTERPRISE'`).
- **TTL**: 60 segundos (60_000 ms).
- **Invalidation**: passiva (TTL). Sem invalidação ativa.

## Edge Cases

| # | Caso | Tratamento |
|---|------|------------|
| 1 | Requisição **sem JWT** e **sem header `x-empresa-id`** (rota pública) | `extractEmpresaId` retorna `undefined` → `resolvePlano` é pulado → `DEFAULT_PLANO = 'FREE'` aplicado. Log `debug` `{ event: 'throttler.no_tenant', ip, path }`. |
| 2 | JWT com `userId` mas **sem `empresaId`** (token antigo, payload incompleto) | `extractEmpresaId` retorna `undefined` (campo ausente no `request.user`) → FREE aplicado. Log `warn` `{ event: 'throttler.jwt_no_empresaId', userId }`. |
| 3 | `empresaId` resolvido, mas empresa **`ativo = false`** | `prisma.empresa.findUnique` filtra `where: { id, ativo: true, deletedAt: null }` → `null` → FREE. Log `warn` `{ event: 'throttler.tenant_invalid', empresaId, reason: 'inactive' }`. |
| 4 | `empresaId` resolvido, mas empresa **soft-deletada** (`deletedAt != null`) | Mesma rota do caso 3 — `findUnique` filtra soft-delete → `null` → FREE. Log `warn` `reason: 'soft_deleted'`. |
| 5 | `empresaId` **inexistente no DB** (UUID forjado, deletado entre cache e DB) | `findUnique` retorna `null` → FREE. Log `warn` `reason: 'not_found'`. |
| 6 | `Empresa.plano` com **valor não mapeado em `PLANO_LIMITS`** (ex: enum evoluiu, mapa não foi atualizado) | `PLANO_LIMITS[plano]` retorna `undefined` → guard cai para FREE. Log `error` `{ event: 'throttler.unknown_plano', plano, empresaId }` para investigação. Defesa em profundidade. |
| 7 | **Redis offline** (`cacheManager.get` lança `ConnectionError` ou `RedisConnectionError`) | `try/catch` envolve a leitura do cache → fallback para `prisma.empresa.findUnique` direto. Log `error` `{ event: 'throttler.cache_offline', error: <message> }`. Request continua normalmente. |
| 8 | Mudança de `Empresa.plano` (`PRO` → `ENTERPRISE`) | Cache `tenant:plano:<id>` tem TTL 60s → reflete em até 60s. **Sem invalidação ativa** (decisão consciente: operação rara, janela de inconsistência aceitável). |
| 9 | Cliente FREE com **ataque distribuído** (múltiplos IPs) | Cada IP continua sendo o **segundo** nível de chave (após tenant). Atacante distribuído escapa do rate limit por tenant. **Não coberto** — defesa contra DDoS / botnets é responsabilidade de WAF externo (Cloudflare, etc.), fora do escopo desta change. |
| 10 | `@SkipThrottle()` em um método dentro de um controller com throttler aplicado | `TenantThrottlerGuard` herda o comportamento padrão: o método decorado é **excluído** do rate limit. Verificado por TDD (spy em `handleRequest`). |
| 11 | `@Throttle({ tier: 'X', limit: Y, ttl: Z })` em um método (override explícito) | O decorator do NestJS aplica **antes** do `handleRequest` ser chamado. O `TenantThrottlerGuard` **não sobrescreve** overrides explícitos — ele apenas ajusta o limite do tier quando o decorator **não** fornece um. **Edge case de implementação**: o `ThrottlerModule` aplica o `@Throttle` decorator PRIMEIRO (criando um tracker com o limite explícito), e o `handleRequest` recebe esse tracker. **Decisão**: o guard custom **só ajusta** o limite se o decorator não tiver fornecido um valor custom. TDD cobre. |
| 12 | `Empresa.plano` alterado no DB **durante** uma janela de rate limit ativa | O tracker de rate limit é "sticky" para a janela atual: requests já contados permanecem contados. O ajuste de limite só afeta requests **futuras** (após reset da janela + cache miss). **Trade-off consciente**: simples, sem invalidação ativa, sem race conditions. |
| 13 | Tenant com `plano` válido (ex: `'PRO'`) mas a chave do cache foi **corrompida** (ex: string inválida) | `cacheManager.get` retorna `string` inválida → `PLANO_LIMITS[plano]` retorna `undefined` → FREE aplicado. Log `warn` `reason: 'cache_corrupt'`. Próximo cache miss repopula. |
| 14 | **Reentrada** do `TenantThrottlerGuard` (ex: em uma chain de guards) | Guard é registrado como `APP_GUARD` global — executa **uma vez** por request. Não há reentrância a tratar. |
| 15 | **Concurrent requests** do mesmo tenant no tier `long` | `@nestjs/throttler` usa `INCR` no Redis (storage compartilhado) — atômico. Sem race condition no contador. |

## Migration Plan

### Migration 1: `20260615190000_add_empresa_plano`

```sql
-- prisma/migrations/20260615190000_add_empresa_plano/migration.sql

-- 1. Cria o enum Plano
CREATE TYPE "Plano" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- 2. Adiciona a coluna plano (DEFAULT 'FREE' = backfill automático)
ALTER TABLE "empresas"
  ADD COLUMN "plano" "Plano" NOT NULL DEFAULT 'FREE';

-- 3. Índice opcional para queries futuras por plano
--    (descomentar se houver listagem "SELECT * FROM empresas WHERE plano = 'ENTERPRISE'"
--     ou métricas de billing; padrão do projeto é não indexar enum com cardinalidade baixa)
-- CREATE INDEX "empresas_plano_idx" ON "empresas"("plano");
```

**Notas sobre a migration:**

- **Backfill automático**: o `DEFAULT 'FREE'` preenche **todas** as empresas existentes (zero downtime, zero risco).
- **Sem perda de dados**: coluna é aditiva.
- **Reverter**: `ALTER TABLE "empresas" DROP COLUMN "plano"; DROP TYPE "Plano";` — destrutivo apenas para a coluna nova.
- **Compatibilidade Prisma**: rodar `npx prisma migrate dev --name add_empresa_plano` gera a migration com o SQL acima. Validar com `npx prisma migrate status` em dev.

### Mudanças no `prisma/schema.prisma`

```prisma
enum Plano {
  FREE
  PRO
  ENTERPRISE
}

model Empresa {
  id            String           @id @default(uuid())
  nome          String
  descricao     String?
  ativo         Boolean          @default(true)
  responsavel   Usuario          @relation("EmpresaResponsavel", fields: [responsavelId], references: [id])
  responsavelId Int
  usuarios      UsuarioEmpresa[]
  perfis        Perfil[]
  plano         Plano            @default(FREE)         // <-- NOVO
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  deletedAt     DateTime?

  @@index([responsavelId])
  @@index([deletedAt, ativo])
  // @@index([plano])  // opcional — ver Migration Plan #3
}
```

### Mudanças no `src/app.module.ts`

```diff
- import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
+ import { ThrottlerModule } from '@nestjs/throttler';
+ import { TenantThrottlerGuard } from './shared/infrastructure/throttling/tenant-throttler.guard';

  // ... (ThrottlerModule.forRoot([...]) permanece inalterado) ...

  providers: [
    {
      provide: APP_GUARD,
-     useClass: ThrottlerGuard,
+     useClass: TenantThrottlerGuard,
    },
    // ... outros providers ...
  ],
```

### Mudanças no `src/shared/shared.module.ts`

Adicionar `TenantThrottlerGuard` ao array de `providers` e `exports`:

```typescript
@Module({
  providers: [
    // ... existing ...
    TenantThrottlerGuard,
  ],
  exports: [
    // ... existing ...
    TenantThrottlerGuard,
  ],
})
export class SharedModule {}
```

## BDD Scenarios Associated

Novos cenários a serem adicionados em `features/tenant-rate-limit.feature` (novo arquivo):

```gherkin
# features/tenant-rate-limit.feature
Funcionalidade: Rate Limit por Tenant

Eu como sistema de multi-tenancy
Quero aplicar limites de rate limit baseados no plano da empresa
Para que clientes PRO/ENTERPRISE tenham SLA adequado e clientes FREE não abusem

Cenário: FREE bloqueia ao exceder 100 req no tier long
  Dado que existe uma empresa com plano "FREE" cadastrada
  E o usuário dessa empresa está autenticado
  Quando o usuário fizer 100 requisições GET para "/perfis" (tier long)
  Então todas as 100 requisições devem retornar status 200
  Quando o usuário fizer a 101ª requisição
  Então o status da resposta deve ser 429
  E o header "X-RateLimit-Limit" deve ser "100"
  E o header "X-RateLimit-Remaining" deve ser "0"
  E o header "Retry-After" deve estar presente

Cenário: PRO permite 1000 req no tier long (sem 429)
  Dado que existe uma empresa com plano "PRO" cadastrada
  E o usuário dessa empresa está autenticado
  Quando o usuário fizer 1000 requisições GET para "/perfis" (tier long)
  Então todas as 1000 requisições devem retornar status 200
  Quando o usuário fizer a 1001ª requisição
  Então o status da resposta deve ser 429
  E o header "X-RateLimit-Limit" deve ser "1000"

Cenário: Plano lido do JWT do tenant é respeitado
  Dado que existe uma empresa com plano "ENTERPRISE" cadastrada
  E o usuário dessa empresa possui um JWT válido
  Quando o usuário fizer uma requisição GET para "/perfis" com Authorization Bearer
  Então o status da resposta deve ser 200
  E o throttler deve ter usado o limite do plano "ENTERPRISE" (long = 10000)
```

**Total: 3 cenários BDD** (mínimo exigido).

## Acceptance Tests (ATDD)

Localização: `test/tenant-rate-limit.e2e-spec.ts` (novo).

```typescript
describe('TenantThrottlerGuard (e2e)', () => {
  // BDD: Cenário: FREE bloqueia ao exceder 100 req no tier long
  it('AC-TR-01: deve retornar 200 nas primeiras 100 requests e 429 na 101ª (FREE)', ...);

  // BDD: Cenário: PRO permite 1000 req no tier long
  it('AC-TR-02: deve retornar 200 nas primeiras 1000 requests e 429 na 1001ª (PRO)', ...);

  // BDD: Cenário: Plano lido do JWT é respeitado
  it('AC-TR-03: deve aplicar limite do plano do tenant identificado no JWT (ENTERPRISE)', ...);

  // Edge case: rota pública sem JWT
  it('AC-TR-04: deve aplicar limite FREE quando não há JWT nem x-empresa-id', ...);

  // Edge case: empresa inativa
  it('AC-TR-05: deve aplicar limite FREE quando empresa está ativo=false', ...);

  // Verificação: cache hit
  it('AC-TR-06: não deve consultar Prisma quando cache hit (tenant:plano:<id>)', ...);

  // Verificação: cache miss + Prisma
  it('AC-TR-07: deve consultar Prisma e popular cache com TTL 60s em cache miss', ...);

  // Verificação: Redis offline
  it('AC-TR-08: deve degradar para query Prisma direta quando Redis lança', ...);
});
```

**Total: 4 testes e2e obrigatórios + 4 bônus de edge cases = 8 testes ATDD**.

> **Atenção**: testes de carga (100/1000 requests) podem ser lentos. **Estratégia**: usar `THROTTLER_LONG_LIMIT=10000` no `.env.test` (já é o default) e fazer override **por teste** via `beforeAll` que atualiza `empresa.plano`. Para o teste de FREE, setar `plano = 'FREE'` e usar o limite default (100); o teste vai disparar 100 requests em < 1s, retornando todas 200. Para o teste de PRO, idealmente setar `THROTTLER_LONG_LIMIT=1000` via `ConfigService.override` no beforeAll — mas isso requer refactor do `app.module.ts` para usar `forRootAsync` (decidir na implementação). **Simplificação**: usar **apenas o teste FREE** para AC-TR-01 (limite default = 100 é perfeito), e validar AC-TR-02/PRO e AC-TR-03/ENTERPRISE via **TDD** (mock de `resolvePlano` retorna 'PRO'/'ENTERPRISE'). Documentar trade-off.

## Unit Tests (TDD)

Localização: `src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts` (novo).

- `extractTenantContext`:
  - deve retornar `{ empresaId: 'X' }` quando `request.user.empresaId` está presente
  - deve retornar `{ empresaId: 'X' }` quando `request.user.empresas[0].id` está presente (multi-tenant JWT)
  - deve retornar `{ empresaId: 'X' }` quando `headers['x-empresa-id']` está presente
  - deve retornar `{}` (sem `empresaId`) quando nenhum está presente
- `resolvePlano`:
  - deve retornar `'FREE'` quando não há `empresaId`
  - deve retornar o plano do cache em caso de cache hit (sem consultar Prisma)
  - deve consultar Prisma **e** popular o cache em caso de cache miss
  - deve retornar `'FREE'` quando empresa está inativa (soft-deleted ou `ativo=false`)
  - deve retornar `'FREE'` quando Redis lança (degradação graciosa)
  - deve retornar `'FREE'` quando plano desconhecido (`PLANO_LIMITS[plano]` é `undefined`)
- `handleRequest`:
  - deve respeitar `@SkipThrottle()` (não conta a request)
  - deve aplicar `PLANO_LIMITS[plano][tier]` ao `getTrackerByKey`
  - deve emitir headers de resposta 429 (`Retry-After`, `X-RateLimit-Limit`, etc.) — via herança de `ThrottlerGuard`

**Total: mínimo 5 testes (exigência) — recomendado 10+**.

## Technical Notes

- **Extensão do `ThrottlerGuard`**: o `@nestjs/throttler` v5+ expõe `handleRequest(req, res, context)` como método protegido. A override **deve** chamar `super.handleRequest(...)` para preservar a lógica de contagem; a customização fica no `generateKey` (para incluir `empresaId`) e/ou no `throwThrottlingException` (para ajustar headers). **Decisão de implementação**: sobrescrever `handleRequest` para (1) identificar o `empresaId`, (2) resolver o `plano`, (3) substituir dinamicamente o limite do tier antes de delegar ao `super`.
- **Cache via `cacheManager`**: o `CacheModule` já é global (`isGlobal: true`) e o `CACHE_TTL` env já é lido pelo `AppConfig` — reuso direto, sem DI adicional. A chave `tenant:plano:<empresaId>` é namespaced para evitar colisão.
- **Fallback para `extractEmpresaId`**: o decorator `EmpresaId` já implementa a lógica (header > JWT.user.empresaId). **Reuso**: o `TenantThrottlerGuard` importa `extractEmpresaId` e chama diretamente, em vez de depender do decorator (que é executado depois do guard na cadeia). Edge case: o `request.user.empresas[0].id` precisa ser adicionado à lógica de `extractEmpresaId` (estender).
- **Compatibilidade com `@Throttle({ tier: 'X', limit: Y })`**: o decorator do NestJS aplica **antes** do `handleRequest`. Quando o decorator fornece um `limit` explícito, **o guard custom não deve sobrescrevê-lo** (respeita a intenção do desenvolvedor). **Implementação**: verificar se o `tracker` (passado para `handleRequest`) já tem um `limit` custom; se sim, usar esse; se não, usar `PLANO_LIMITS[plano][tier]`. TDD cobre.
- **Performance do cache lookup**: o `cacheManager.get` no `@nestjs/cache-manager` retorna `Promise<T | undefined>`. O TTL é definido no `cacheManager.set(key, value, { ttl: 60_000 })` (em ms). 60s é balanço entre "reflete mudança de plano rápido" e "evita hot-query no Prisma".
- **Testabilidade do guard**: o `TenantThrottlerGuard` recebe `PrismaService` e `Cache` (token do `@nestjs/cache-manager`) via DI. Mockáveis em testes unitários.
- **Logging**: usar `private readonly logger = new Logger(TenantThrottlerGuard.name)` (Pino via NestJS). Logs estruturados em `log`, `warn` ou `error` baseado no evento. **Não** logar `Authorization` header (Pino redact já configurado).
- **Testes e2e existentes**: verificar se `.env.test` precisa de `THROTTLER_LONG_LIMIT=10000` para desativar rate limit em testes de `auth`, `empresas`, `perfis`, `permissoes`, `usuarios` (já existente em algumas mudanças). Como o limite agora é **por tenant**, cada teste de seed pode setar `empresa.plano = 'ENTERPRISE'` no `beforeAll` para garantir teto alto. **Decisão**: deixar `.env.test` como está e adicionar `beforeAll` que seta plano alto nos seeds. Mais limpo.

## File-by-File Traceability (planejado)

| Arquivo | Propósito | Requisitos cobertos |
|---------|-----------|---------------------|
| `features/tenant-rate-limit.feature` (novo) | 3 cenários BDD | REQ-TR-001, REQ-TR-002, REQ-TR-003, REQ-TR-006 |
| `prisma/schema.prisma` (estendido) | Enum `Plano` + `Empresa.plano` | REQ-TR-001 |
| `prisma/migrations/20260615190000_add_empresa_plano/migration.sql` | Migration SQL | REQ-TR-001, REQ-TR-008 |
| `src/shared/infrastructure/throttling/plano-limits.config.ts` (novo) | Mapa `PLANO_LIMITS` | REQ-TR-002, NFR-TR-007 |
| `src/shared/infrastructure/throttling/tenant-throttler.guard.ts` (novo) | `TenantThrottlerGuard extends ThrottlerGuard` | REQ-TR-002..008, NFR-TR-001..006 |
| `src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts` (novo) | TDD (≥ 5 testes) | Cobre todos os caminhos do guard |
| `src/app.module.ts` (estendido) | Troca `useClass: TenantThrottlerGuard` | REQ-TR-008 |
| `src/shared/shared.module.ts` (estendido) | Adiciona `TenantThrottlerGuard` a providers/exports | REQ-TR-008 |
| `test/tenant-rate-limit.e2e-spec.ts` (novo) | ATDD (4-8 testes) | Cobre 3 cenários BDD + edge cases |
| `src/shared/README.md` (estendido) | Documenta o mapa e o fallback | NFR-TR-003, NFR-TR-004 |

## Status

- [x] Draft
- [ ] In Review
- [ ] Approved
- [ ] Implemented

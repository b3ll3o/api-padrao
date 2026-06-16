# Feature: Rate Limit por Tenant (tenant-rate-limit) — Change Request

> **Tipo**: Change Request **prospectivo**. A feature **NÃO** está implementada — este documento abre o ciclo `DDD → BDD → SDD → ATDD → TDD` e guiará a fase de implementação. ID: **US-NF-001**.

## Why

A API `api-padrao` já está multi-tenant (uma `Empresa` agrega `Usuarios`, `Perfis`, `Permissoes`, `Perfil`s e `Perfil.empresaId`/`UsuarioEmpresa.empresaId` em todas as entidades) e já possui um throttler global configurado em [`src/app.module.ts`](../../src/app.module.ts) com 4 tiers (`short`, `medium`, `long`, `sensitive`) e limites uniformes por IP. **Esse modelo é global e igualitário**: um cliente no plano **FREE** e um cliente no plano **ENTERPRISE** compartilham o mesmo teto de 100 req/min (tier `long`).

Esse desenho entra em conflito direto com o roadmap de monetização do produto (sandbox/comercial) por três razões:

1. **Cliente enterprise com SLA alto é bloqueado** — um único IP de NAT corporativo que hospeda dezenas de usuários legítimos estoura o tier `long` (100 req/min) durante picos legítimos, gerando 429 falsos-positivos e degradação percebida.
2. **Cliente FREE pode abusar** — não há diferenciação entre "1 usuário FREE fazendo polling de 1 vez por hora" e "1 usuário FREE raspando a API inteira". Ambos compartilham o mesmo teto.
3. **Onboarding de novos clientes enterprise fica bloqueado** — sem limite dedicado, oferecer um SLA de "1.000 req/min para cliente enterprise" é fisicamente impossível com o desenho atual.

A solução proposta é **substituir o throttler global baseado em IP por um throttler baseado em `Empresa.plano`**, lendo o plano do tenant no JWT (já presente no payload, ver [`src/auth/infrastructure/strategies/jwt.strategy.ts`](../../src/auth/infrastructure/strategies/jwt.strategy.ts)) e selecionando o teto correspondente em um mapa de configuração. O resultado é:

- **FREE** = tier baixo (proteção contra abuso).
- **PRO** = 10x o FREE (cobrindo a maioria dos casos comerciais).
- **ENTERPRISE** = 100x o FREE (suportando alto volume).
- **Rota pública** (sem JWT) = degrada graciosamente para o limite **FREE** (retrocompatibilidade).

Mantém-se o throttler do NestJS (`@nestjs/throttler`), trocando-se apenas o **guard** global (`ThrottlerGuard` → `TenantThrottlerGuard extends ThrottlerGuard`), preservando o suporte a `@SkipThrottle()` e `@Throttle({ tier: 'X' })` nos controllers.

A feature **NÃO** inclui (escopo):

- **Auto-upgrade** de plano (mudança de FREE → PRO) — operação de billing/comercial, fora do escopo técnico.
- **Rate limit por usuário** (sub-divisão por `userId` dentro de uma empresa) — futuro, exige estrutura de quotas separada.
- **Rate limit por recurso** (ex: "X req/min em `POST /usuarios`") — futuro, exige decorators adicionais.
- **Billing** / métricas de consumo por tenant (ex: export Prometheus) — futuro.
- **Mudança no JWT** (incluir `plano` no payload) — o tenant é resolvido por lookup na tabela `Empresa` (cache de 60s no Redis) para evitar invalidar todos os JWTs em circulação quando um plano muda.

## What Changes

### Adiciona

- **Enum Prisma `Plano`** em [`prisma/schema.prisma`](../../prisma/schema.prisma):
  ```prisma
  enum Plano {
    FREE
    PRO
    ENTERPRISE
  }
  ```
- **Campo `plano` em `Empresa`**:
  ```prisma
  model Empresa {
    // ... campos existentes ...
    plano Plano @default(FREE)
  }
  ```
- **Config map** em `src/shared/infrastructure/throttling/plano-limits.config.ts`:
  ```typescript
  export const PLANO_LIMITS = {
    FREE:       { short: 3,   medium: 20,  long: 100,  sensitive: 10  },
    PRO:        { short: 10,  medium: 50,  long: 1000, sensitive: 20  },
    ENTERPRISE: { short: 30,  medium: 200, long: 10000,sensitive: 100 },
  } as const;
  export type Plano = keyof typeof PLANO_LIMITS;
  ```
- **Guard custom** `TenantThrottlerGuard extends ThrottlerGuard` em `src/shared/infrastructure/throttling/tenant-throttler.guard.ts`:
  - Override de `handleRequest(req, context)` para identificar o `empresaId` da requisição (header `x-empresa-id` ou `request.user.empresaId` do JWT).
  - Lookup do `plano` da `Empresa` no DB (com cache Redis, TTL 60s, key `tenant:plano:<empresaId>`).
  - Substituição dinâmica dos limites do tier (`short`/`medium`/`long`/`sensitive`) pelos valores do `PLANO_LIMITS[plano]`.
  - **Fallback** para `FREE` se: (a) `empresaId` ausente, (b) JWT sem `empresaId`, (c) empresa `ativo=false` ou `deletedAt != null`, (d) plano desconhecido (defesa em profundidade).
- **Migration Prisma** `20260615190000_add_empresa_plano`:
  - Cria o enum `Plano`.
  - Adiciona coluna `plano Plano NOT NULL DEFAULT 'FREE'` em `empresas`.
  - Backfill implícito (todas as empresas existentes viram `FREE`).
  - Índice opcional `@@index([plano])` se houver consultas por plano (decidir na implementação).
- **3 cenários BDD** em `features/tenant-rate-limit.feature` (novo arquivo, nova `Funcionalidade:`):
  - `Cenário: FREE bloqueia ao exceder 100 req no tier long`
  - `Cenário: PRO permite 1000 req no tier long (sem 429)`
  - `Cenário: Plano lido do JWT do tenant é respeitado`
- **Testes e2e** em `test/tenant-rate-limit.e2e-spec.ts` (ATDD) — **3 cenários + 1 sanity check** (rota pública cai em FREE).
- **Testes unitários** em `src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts` (TDD) — mínimo 5 testes (mapa de planos, fallback FREE, cache hit/miss, empresa desativada, skip-throttle preservado).

### Altera

- **`src/app.module.ts`**: troca `{ provide: APP_GUARD, useClass: ThrottlerGuard }` por `{ provide: APP_GUARD, useClass: TenantThrottlerGuard }`. O `ThrottlerModule.forRoot([...])` permanece (continua registrando os 4 tiers), mas o **guard custom** é quem decide o limite efetivo por tenant.
- **`src/shared/README.md`**: adiciona seção "Rate Limit por Tenant" explicando o mapa de planos e o fallback.

### Não altera (escopo)

- Não mexe em `auth`, `usuarios`, `perfis`, `permissoes` (apenas leitura do `empresaId` que já está no JWT).
- Não introduz Redis novo — reusa o já configurado em `src/app.module.ts` (`@nestjs/cache-manager` + `cache-manager-redis-yet`).
- Não altera contratos HTTP de nenhum endpoint — apenas os **headers de resposta** ganham 4 novos (RFC 6585 / draft-ietf-httpapi-ratelimit-headers): `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (já gerados nativamente pelo `@nestjs/throttler`).
- Não cria novo módulo NestJS — convive em `SharedModule`.

## Impact

| Área | Tipo de impacto | Descrição |
|------|-----------------|-----------|
| Banco de dados | Migration | Nova coluna `plano Plano @default(FREE)` em `empresas` + enum `Plano` (3 valores). Backfill automático (todas as empresas viram `FREE`). Sem perda de dados. |
| Throttler | **Breaking** (controlado) | `ThrottlerGuard` global é substituído por `TenantThrottlerGuard`. O comportamento default muda de "100 req/min por IP" para "limite do plano do tenant" (FREE = mesmo 100, PRO = 1000, ENTERPRISE = 10000). Para tenants FREE existentes, **não há mudança percebida**. Para tenants PRO/ENTERPRISE, o teto sobe. **Não há regressão** — sempre o limite FREE garante o piso de segurança. |
| Cache | Adição | Nova key `tenant:plano:<empresaId>` no Redis (TTL 60s). Read-through: cache miss → query Prisma → set. Falha de Redis → fallback para query direta (degradação graciosa). |
| Performance | Impacto mínimo | 1 lookup no Redis por request (em média; cache hit no caso comum). 1 query Prisma no cache miss (cold start). Negligível (<2ms p99 em dev). |
| API pública | Aditivos | Resposta 429 ganha 4 headers (já suportados nativamente pelo `@nestjs/throttler`): `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Contrato retrocompatível. |
| Configuração | **Nenhuma** | Sem envs novas. O mapa `PLANO_LIMITS` é hard-coded em `plano-limits.config.ts` (decisão consciente: limites são parte do contrato comercial, não configuração de runtime). |
| Segurança | Endurecimento | Tenants FREE continuam protegidos contra abuso. Tenants PRO/ENTERPRISE não conseguem abusar do limite (lookup do `empresa.plano` é server-side, não client-side). |
| Operacional | Observabilidade | Log estruturado em `warn` quando um tenant é bloqueado (`{ event: 'throttler.blocked', tenantId, plano, tier, ip }`). Não loga headers `Authorization` (Pino redact já configurado). |
| Testes | Cobertura | 3 cenários BDD + 4 testes e2e (ATDD) + ≥ 5 testes unitários (TDD) do `TenantThrottlerGuard`. Suíte completa deve passar sem regressão. |

### Usuários impactados

- **Clientes FREE**: zero mudança no comportamento (mesmo limite de antes).
- **Clientes PRO**: teto do tier `long` sobe de 100 → 1000 req/min (10x). Clientes `sensitive` (login/refresh) sobem de 10 → 20 req/min.
- **Clientes ENTERPRISE**: teto do tier `long` sobe de 100 → 10000 req/min (100x). Clientes `sensitive` sobem para 100 req/min.
- **Operações**: precisam cadastrar `empresa.plano = 'PRO'` ou `'ENTERPRISE'` no DB (via SQL ou painel admin — fora do escopo desta change).
- **Consumidores da API**: nenhuma mudança no contrato (apenas ganham headers de rate limit em respostas 429).

## Risks

| Risco | Probabilidade | Impacto | Mitigação proposta |
|-------|---------------|---------|---------------------|
| **Header `x-empresa-id` ausente em rota autenticada** | Média | Baixo | `TenantThrottlerGuard` degrada para limite **FREE** + log `warn` `{ event: 'throttler.no_tenant', ip, path }`. Cliente autenticado mas sem `empresaId` no JWT é o caso "usuário sem empresa" (free-loader legítimo ou bug). |
| **JWT sem `empresaId`** (token antigo, payload incompleto) | Baixa | Médio | `extractEmpresaId` retorna `undefined` → guard cai para FREE. Edge case documentado. Decisão: **não** reautenticar o usuário (custo alto, alternativa FREE é segura). |
| **Empresa desativada** (`ativo = false` ou `deletedAt != null`) | Baixa | Médio | `tenantLookup` consulta `where: { id, deletedAt: null, ativo: true }` — se não encontrar, retorna `null` → FREE. Loga `{ event: 'throttler.tenant_inactive', empresaId }`. |
| **Plano desconhecido** (ex: novo valor `BUSINESS` adicionado no enum, mapa não atualizado) | Muito baixa | Médio | `PLANO_LIMITS[plano]` retorna `undefined` → guard cai para FREE. Loga `error` para investigação. Defesa em profundidade (mapa é `as const`, mas runtime check protege). |
| **Redis offline** | Média | Baixo | `cacheManager.get` lança → `try/catch` em volta → fallback para query Prisma direta. Performance cai (sem cache), funcionalidade permanece. |
| **Mudança de plano não reflete imediatamente** (cache stale por até 60s) | Média | Baixo | Aceito — 60s de janela de inconsistência é aceitável. **Não** invalidar cache ativamente em update de `Empresa.plano` (operação rara). Documentar. |
| **Cliente FREE escapa do limite via múltiplos IPs** (request distribution) | Alta | Baixo | O IP continua sendo o **segundo** nível de chave (após tenant) — ataques distribuídos não são cobertos. **Não** é escopo desta change (cobertura contra DDoS / botnets exige WAF / Cloudflare, fora do projeto). |
| **Tenant lookup vira gargalo** (Prisma lento, Redis cold start) | Baixa | Médio | Cache com TTL 60s reduz 99% dos lookups. Em cold start: 1 query Prisma (índice em `Empresa.id` é PK, lookup O(1)). Aceitável. |
| **Mapa `PLANO_LIMITS` diverge entre versões deployadas** (rolling deploy) | Baixa | Baixo | Mapa é parte do binário — deploy atômico garante consistência. Em multi-região, replicar artefato. |
| **Regressão em testes e2e existentes** (suite dispara 429) | Baixa | Médio | `.env.test` já tem `THROTTLER_*_LIMIT` em valores altos (verificar na implementação); se necessário, bumpar para `10000` para desativar. **Atenção**: como o limite agora é **por tenant**, basta o tenant de teste ter `plano = 'ENTERPRISE'` (ou seed reset do plano antes de cada teste). |

## Alternatives Considered

### 1. **In-memory storage do Throttler (sem Redis)**

- **Proposta**: usar `ThrottlerStorage` default (in-memory) em vez de Redis.
- **Rejeitada**: o projeto **já** tem Redis configurado (`@nestjs/cache-manager` + `cache-manager-redis-yet`) e o cache de `tenant:plano:<empresaId>` precisa de persistência cross-instance. In-memory limitaria o throttler a 1 instância (não escala horizontalmente) e o cache seria perdido em restart. Redis é mandatório.

### 2. **Plano dentro do JWT (em vez de lookup no DB)**

- **Proposta**: incluir `plano` no payload do JWT no momento do login.
- **Rejeitada**:
  - Invalida **todos** os JWTs em circulação a cada mudança de plano (ou exige um endpoint de refresh forçado) — atrito operacional alto.
  - O JWT é assinado pelo `JWT_SECRET` e o backend confia no payload; se a empresa for suspensa (`ativo = false`), o JWT ainda carrega `plano = 'ENTERPRISE'` e o throttler confia.
  - O payload do JWT é bounded (não convém inflar com dados que mudam).
  - Lookup no DB com cache de 60s é barato (<2ms p99) e sempre retorna o estado **atual** do tenant.
- **Decisão**: lookup no DB com cache Redis. Plano **não** vai no JWT.

### 3. **Throttler dedicado por empresa (storage isolado)**

- **Proposta**: criar uma instância de `ThrottlerModule` por empresa (multi-tenant strict isolation).
- **Rejeitada**: over-engineering. O `@nestjs/throttler` já suporta chaves compostas (`generateKey(context, suffix)`). `TenantThrottlerGuard` sobrescreve o método para incluir `empresaId` na chave. **Não** precisa de módulos paralelos.

### 4. **Manter `ThrottlerGuard` global + `@Throttle()` por controller com limite do plano**

- **Proposta**: cada controller consulta o plano do tenant via decorator/guard e aplica `@Throttle({ long: { limit: <plano> } })` dinamicamente.
- **Rejeitada**: repete a lógica de lookup em todo controller, viola DRY, propenso a esquecer em controllers novos. O guard centraliza a decisão.

### 5. **Rate limit por IP apenas (sem tenant)**

- **Proposta**: manter o desenho atual (100 req/min/IP) para todos.
- **Rejeitada**: não diferencia clientes FREE de ENTERPRISE. Bloqueia crescimento comercial. É o status quo que estamos substituindo.

### 6. **Plano no header `x-plano`** (cliente envia)

- **Rejeitada** (óbvio): trivially spoofable. Plano é decisão do backend.

### 7. **Throttler plugado a serviço externo (Cloudflare, Kong, AWS WAF)**

- **Rejeitada**: fora do escopo do projeto (assumimos self-hosted / on-prem). O throttler do NestJS cobre o caso de uso (proteção por origem confiável).

## Stakeholders

- [x] **Time de backend** (implementação, code review)
- [x] **Time de SRE/Operações** (deploy, observabilidade, capacidade Redis)
- [x] **Time comercial** (define quais clientes vão para PRO/ENTERPRISE — mudança de dados, não de código)
- [x] **Consumidores da API** (clientes enterprise que precisam do teto maior)

## Initial Estimate

- **DDD/BDD**: 0.5 dia (3 cenários simples)
- **SDD** (este documento): 0.5 dia
- **ATDD Red**: 1 dia (4 testes e2e)
- **Migration + config map**: 0.5 dia
- **TDD Red→Green do guard**: 1.5 dia (lookup, cache, fallback, integração com `@nestjs/throttler`)
- **Wiring + e2e green**: 0.5 dia
- **Documentação + review**: 0.5 dia

**Total**: ~5 dias úteis (1 semana).

## Dependencies

- **Dependência 1**: `Empresa` precisa ter `id` (já tem — UUID), `ativo` (já tem), `deletedAt` (já tem — soft-delete) — sem mudança de schema nesses campos.
- **Dependência 2**: `JwtPayload.empresas[].id` precisa estar presente (já está — ver [`src/auth/infrastructure/strategies/jwt.strategy.ts`](../../src/auth/infrastructure/strategies/jwt.strategy.ts)).
- **Dependência 3**: `EmpresaInterceptor` (global) popula `EmpresaContext.empresaId` no request-scoped context — já feito, reuso direto.
- **Dependência 4**: `@nestjs/throttler` ≥ v5 (já instalado) — confirma suporte a `handleRequest` override.
- **Dependência 5**: Redis disponível (já provisionado via `docker-compose.yml`).

## Status

- [x] Draft
- [ ] In Review
- [ ] Approved
- [ ] Implemented

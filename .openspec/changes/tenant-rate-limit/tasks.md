# Feature: Rate Limit por Tenant (tenant-rate-limit) — Tasks

> **Status**: tasks **pendentes** (change prospectivo). Esta é a lista de execução que guia a implementação na fase de Build Mode, após aprovação do `proposal.md` e `design.md`. Marcar `[x]` apenas após o teste/verificação rodar verde. ID: **US-NF-001**.

## Implementation Tasks

### Phase 1: Preparation (OpenSpec)

- [ ] Criar diretório `.openspec/changes/tenant-rate-limit/`
- [ ] Escrever `proposal.md` (Why, What Changes, Impact, Risks, Alternatives Considered — 7 alternativas)
- [ ] Escrever `design.md` (RFC 2119: 8 FR + 8 NFR; 14 AC; API spec com 429 + headers; Data Models; 15 Edge Cases; Migration Plan com SQL)
- [ ] Escrever `tasks.md` (este arquivo — 11 fases, ~38 tasks)
- [ ] **Revisar e aprovar** `proposal.md` + `design.md` antes de prosseguir

### Phase 2: Domain Discovery (BDD)

- [ ] Criar `features/tenant-rate-limit.feature` (novo arquivo, nova `Funcionalidade: Rate Limit por Tenant`) com os **3 cenários BDD**:
  - `Cenário: FREE bloqueia ao exceder 100 req no tier long` (AC-TR-01)
  - `Cenário: PRO permite 1000 req no tier long (sem 429)` (AC-TR-02)
  - `Cenário: Plano lido do JWT do tenant é respeitado` (AC-TR-03)
- [ ] Mapear cenários BDD → Acceptance Criteria (AC-TR-01..14) — referência cruzada em `design.md`

### Phase 3: Test Development (ATDD — Red Phase)

- [ ] Criar **testes e2e** em `test/tenant-rate-limit.e2e-spec.ts` (novo):
  - `describe('TenantThrottlerGuard (e2e)')`:
    - deve retornar 200 nas primeiras 100 requests e 429 na 101ª com `X-RateLimit-Limit: 100` (AC-TR-01, FREE + tier long)
    - deve retornar 200 nas primeiras 1000 requests e 429 na 1001ª com `X-RateLimit-Limit: 1000` (AC-TR-02, PRO + tier long)
    - deve aplicar limite ENTERPRISE (`X-RateLimit-Limit: 10000`) quando JWT contém empresaId com plano ENTERPRISE (AC-TR-03)
    - deve aplicar limite FREE em rota pública sem JWT nem `x-empresa-id` (AC-TR-04)
    - deve aplicar limite FREE quando empresa está `ativo = false` (AC-TR-05)
    - deve consultar Redis e não Prisma em cache hit (AC-TR-06)
    - deve consultar Prisma e popular cache com TTL 60s em cache miss (AC-TR-07)
    - deve degradar para query Prisma direta quando Redis lança `ConnectionError` (AC-TR-08)
- [ ] **Verificar que os testes e2e FALHAM** (Red Phase) — `TenantThrottlerGuard` ainda não existe, `app.module.ts` ainda usa `ThrottlerGuard`
- [ ] Revisar aceitação dos testes com o time (decisão: validar FREE real + PRO/ENTERPRISE via TDD com mock de `resolvePlano` para evitar 1000 requests no CI)

### Phase 4: Data Model (Prisma)

- [ ] Adicionar `enum Plano { FREE PRO ENTERPRISE }` em `prisma/schema.prisma`
- [ ] Adicionar campo `plano Plano @default(FREE)` em `model Empresa`
- [ ] (Opcional) Adicionar `@@index([plano])` em `model Empresa` — decidir baseado em uso futuro (billing queries)
- [ ] Gerar migration Prisma: `npx prisma migrate dev --name add_empresa_plano` (espera-se timestamp `20260615190000`)
- [ ] Validar SQL gerado: `cat prisma/migrations/20260615190000_add_empresa_plano/migration.sql` — deve conter `CREATE TYPE "Plano" AS ENUM ...` + `ALTER TABLE "empresas" ADD COLUMN "plano" ...`
- [ ] Aplicar migration em dev e validar com `npx prisma migrate status`
- [ ] Validar backfill: `psql ... -c 'SELECT plano, COUNT(*) FROM "empresas" GROUP BY plano'` — esperado: `FREE | N` (todas as empresas existentes)

### Phase 5: Config Map (`PLANO_LIMITS`)

- [ ] Criar `src/shared/infrastructure/throttling/plano-limits.config.ts` (novo):
  - Exportar `PLANO_LIMITS` com 3 planos × 4 tiers (FREE, PRO, ENTERPRISE × short, medium, long, sensitive)
  - Exportar `type Plano = keyof typeof PLANO_LIMITS`
  - Exportar `type PlanoLimits = (typeof PLANO_LIMITS)[Plano]`
  - Exportar `type ThrottlerTier = keyof PlanoLimits`
  - Exportar `const DEFAULT_PLANO: Plano = 'FREE'`
  - Exportar `const CACHE_KEY_PREFIX = 'tenant:plano:'`
  - Exportar `const CACHE_TTL_MS = 60_000`
  - JSDoc explicando o trade-off (limites são hard-coded por design — parte do contrato comercial)
- [ ] Criar `src/shared/infrastructure/throttling/plano-limits.config.spec.ts` (TDD):
  - deve exportar `PLANO_LIMITS` com 3 planos
  - deve ter FREE.long = 100, PRO.long = 1000, ENTERPRISE.long = 10000
  - deve ter FREE.sensitive = 10, PRO.sensitive = 20, ENTERPRISE.sensitive = 100
  - `DEFAULT_PLANO` deve ser `'FREE'`

### Phase 6: Extensão de `extractEmpresaId`

- [ ] Estender `src/shared/application/decorators/empresa-id.decorator.ts`:
  - Adicionar leitura de `request.user.empresas?.[0]?.id` (multi-tenant JWT — caso o `empresaId` direto não esteja presente)
  - Manter retrocompatibilidade: `request.user?.empresaId` continua sendo a primeira opção
  - Manter fallback para `request.headers['x-empresa-id']` como terceira opção
- [ ] Atualizar `src/shared/application/decorators/empresa-id.decorator.spec.ts` (estender) com testes para os 3 caminhos

### Phase 7: TenantThrottlerGuard — TDD (Red Phase)

- [ ] Criar `src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts` (TDD, Red Phase):
  - Mockar `PrismaService`, `Cache` (do `@nestjs/cache-manager`), `Logger`
  - Testes planejados (mínimo 5, recomendado 10+):
    1. `extractTenantContext` deve retornar `{ empresaId: 'X' }` quando `request.user.empresaId` está presente
    2. `extractTenantContext` deve retornar `{ empresaId: 'X' }` quando `request.user.empresas[0].id` está presente
    3. `extractTenantContext` deve retornar `{ empresaId: 'X' }` quando `headers['x-empresa-id']` está presente
    4. `extractTenantContext` deve retornar `{}` quando nenhum está presente
    5. `resolvePlano` deve retornar `'FREE'` quando não há `empresaId`
    6. `resolvePlano` deve retornar plano do cache em caso de cache hit (sem consultar Prisma)
    7. `resolvePlano` deve consultar Prisma E popular cache em caso de cache miss
    8. `resolvePlano` deve retornar `'FREE'` quando empresa está inativa (soft-deleted ou `ativo=false`)
    9. `resolvePlano` deve retornar `'FREE'` quando Redis lança `ConnectionError` (degradação graciosa)
    10. `resolvePlano` deve retornar `'FREE'` quando `PLANO_LIMITS[plano]` é `undefined` (plano desconhecido)
    11. `handleRequest` deve respeitar `@SkipThrottle()` (tracker tem `skip=true`, não incrementa contador)
    12. `handleRequest` deve aplicar `PLANO_LIMITS[plano][tier]` ao tracker quando decorator não fornece `limit` explícito
    13. `handleRequest` deve respeitar `@Throttle({ tier: 'sensitive', limit: 5 })` (decorator explícito tem prioridade)
- [ ] **Rodar** `npm run test -- tenant-throttler.guard.spec.ts` — testes devem FALHAR (Red)

### Phase 8: TenantThrottlerGuard — Implementation (Green Phase)

- [ ] Criar `src/shared/infrastructure/throttling/tenant-throttler.guard.ts`:
  - `@Injectable()` classe `TenantThrottlerGuard extends ThrottlerGuard`
  - Injetar no construtor: `PrismaService`, `Cache` (token do `@nestjs/cache-manager`), `Reflector` (se necessário)
  - Injetar `private readonly logger = new Logger(TenantThrottlerGuard.name)`
  - Método privado `extractTenantContext(request): { empresaId?: string }`:
    - Retorna `request.user?.empresaId || request.user?.empresas?.[0]?.id || request.headers['x-empresa-id']`
  - Método privado `resolvePlano(empresaId?: string): Promise<Plano>`:
    - Se `!empresaId` → `return DEFAULT_PLANO` (FREE)
    - `cacheKey = \`${CACHE_KEY_PREFIX}${empresaId}\``
    - `try { cached = await this.cache.get(cacheKey); if (cached && PLANO_LIMITS[cached]) return cached; } catch (e) { this.logger.error({ event: 'throttler.cache_offline', error: e.message }); }`
    - `empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { plano: true, ativo: true, deletedAt: true } })`
    - Se `!empresa || !empresa.ativo || empresa.deletedAt` → `return DEFAULT_PLANO` + log `warn` `tenant_invalid`
    - Se `!PLANO_LIMITS[empresa.plano]` → `return DEFAULT_PLANO` + log `error` `unknown_plano`
    - `try { await this.cache.set(cacheKey, empresa.plano, { ttl: CACHE_TTL_MS }); } catch {}` (best-effort)
    - `return empresa.plano`
  - Override `handleRequest(req, res, context)`:
    - `context_ = extractTenantContext(req)`
    - `plano = await this.resolvePlano(context_.empresaId)`
    - Iterar sobre os trackers do throttler (`super.getTracker(...)`):
      - Para cada tracker, se `tracker.limit !== <custom-explicit>` (i.e., não veio de `@Throttle({ limit: Y })`), substituir por `PLANO_LIMITS[plano][tracker.name]`
    - Chamar `super.handleRequest(req, res, context)` para preservar a lógica de contagem + emissão de headers
    - Em caso de 429: `this.logger.warn({ event: 'throttler.blocked', tenantId: context_.empresaId, plano, ip: req.ip, path: req.url })`
  - JSDoc extensivo explicando: fallback para FREE, cache, override de `@Throttle`
- [ ] **Rodar** `npm run test -- tenant-throttler.guard.spec.ts` — testes devem PASSAR (Green)
- [ ] Refatorar se necessário (manter cobertura)

### Phase 9: Module Wiring

- [ ] Adicionar `TenantThrottlerGuard` ao array `providers` E `exports` de `src/shared/shared.module.ts`
- [ ] Em `src/app.module.ts`:
  - Trocar `import { ThrottlerGuard } from '@nestjs/throttler'` por `import { TenantThrottlerGuard } from './shared/infrastructure/throttling/tenant-throttler.guard'`
  - Trocar `useClass: ThrottlerGuard` por `useClass: TenantThrottlerGuard` no array `providers`
  - **NÃO** alterar `ThrottlerModule.forRoot([...])` — os 4 tiers continuam registrados
- [ ] **Rodar boot da aplicação** (`npm run start:dev`) — deve subir sem erros e logar o `TenantThrottlerGuard` no stack de guards

### Phase 10: Configuration (`.env.test`)

- [ ] Verificar `.env.test`:
  - `THROTTLER_LONG_LIMIT=10000` (já existente, garante que testes e2e de outros módulos não disparem 429)
  - `THROTTLER_MEDIUM_LIMIT=10000` (verificar)
  - `THROTTLER_SHORT_LIMIT=10000` (verificar)
  - `THROTTLER_SENSITIVE_LIMIT=10000` (verificar)
- [ ] (Decisão) Decidir estratégia para testes de AC-TR-02 (PRO) e AC-TR-03 (ENTERPRISE):
  - **Opção A**: rodar 1000/10000 requests reais (lento, CI impactado)
  - **Opção B**: usar TDD para validar a lógica de `resolvePlano` + `handleRequest` com mock de `cache.get` retornando `'PRO'`/`'ENTERPRISE'`. E2e cobre só AC-TR-01 (FREE = 100 requests é rápido) e AC-TR-04 a AC-TR-08.
  - **Opção C**: usar `ConfigService.override` no `beforeAll` para forçar `THROTTLER_LONG_LIMIT=1000` e criar empresa PRO — não requer rodar 1000 requests (apenas 100 + 1).
  - **Decisão recomendada**: **Opção B** (TDD-heavy) para PRO/ENTERPRISE + E2E real apenas para FREE. Documentar em `design.md`.
- [ ] Atualizar `.env.test` se necessário (estratégia Opção C requer `THROTTLER_LONG_LIMIT=1000` por suite de teste)

### Phase 11: Verification (ATDD — Green Phase)

- [ ] **Rodar testes e2e** — devem PASSAR (Green Phase):
  - `npm run test:e2e -- tenant-rate-limit.e2e-spec.ts`
- [ ] **Rodar testes unitários** — devem PASSAR:
  - `npm run test -- tenant-throttler.guard.spec.ts`
  - `npm run test -- plano-limits.config.spec.ts`
  - `npm run test -- empresa-id.decorator.spec.ts` (estender)
- [ ] **Rodar suíte completa** para garantir zero regressão:
  - `npm run test` (unit)
  - `npm run test:e2e` (e2e — todos os módulos: auth, empresas, perfis, permissoes, usuarios, tenant-rate-limit)
- [ ] `npm run validate:quick` (lint + typecheck + testes) — deve PASSAR
- [ ] `npm run security:check` — deve PASSAR (verifica que o `plano` não é lido de headers client-controlled, etc.)
- [ ] **Smoke test manual** (opcional, mas recomendado):
  - `docker compose up -d`
  - Aplicar migration: `npx prisma migrate deploy`
  - Verificar enum criado: `psql ... -c '\dT+ Plano'`
  - `curl -X POST http://localhost:3001/auth/login ...` — receber JWT com `empresas[0].id`
  - Verificar `request.user.empresaId` no log Pino
  - Executar `for i in $(seq 1 101); do curl ...; done` — request 101 deve retornar 429 com `X-RateLimit-Limit: 100` (FREE)
  - Atualizar `empresa.plano = 'PRO'` no DB: `psql ... -c "UPDATE empresas SET plano = 'PRO' WHERE id = '...'"`
  - Aguardar 60s (cache TTL) e re-executar 1001 requests — todas devem retornar 200 (PRO = 1000)

### Phase 12: Documentation

- [ ] Atualizar `src/shared/README.md`:
  - Adicionar seção "### Rate Limit por Tenant" explicando o mapa `PLANO_LIMITS`, o fallback para FREE, e o cache Redis
  - Adicionar tabela de limites por plano × tier
  - Documentar o trade-off do cache TTL (60s de janela de inconsistência em mudança de plano)
- [ ] Atualizar `AGENTS.md` (raiz) — referenciar a feature `tenant-rate-limit` no catálogo de módulos / cross-cutting concerns
- [ ] Adicionar comentários de rastreabilidade nos arquivos novos:
  - `// BDD: features/tenant-rate-limit.feature:Cenário: FREE bloqueia ao exceder 100 req no tier long`
  - `// SDD: .openspec/changes/tenant-rate-limit/design.md:REQ-TR-002`
  - `// ATDD: test/tenant-rate-limit.e2e-spec.ts:AC-TR-01`
  - `// TDD: src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts:resolvePlano > deve consultar Prisma e popular cache`
- [ ] Criar `docs/rate-limit.md` (opcional) — guia operacional para SRE (como bumpar plano de uma empresa, como limpar cache, como monitorar)

### Phase 13: Deployment / Archive

- [ ] **Code review** do PR (referência: `code-review` skill)
- [ ] **Security review** (referência: `security-review` skill) — confirmar:
  - Plano NUNCA lido de header client-controlled
  - Tenant inválido sempre cai em FREE (defesa em profundidade)
  - Cache miss + Redis offline degradam graciosamente
  - Logs não vazam `Authorization` header (Pino redact)
- [ ] Merge do PR com conventional commits:
  - `feat(prisma): add Plano enum and Empresa.plano column`
  - `feat(throttler): add TenantThrottlerGuard with per-tenant rate limits`
  - `feat(throttler): add PLANO_LIMITS config map (FREE/PRO/ENTERPRISE)`
  - `feat(throttler): cache tenant plano in Redis with 60s TTL`
  - `test(throttler): add BDD + ATDD + TDD for tenant rate limit`
  - `docs(shared): document TenantThrottlerGuard and PLANO_LIMITS`
  - `chore(app): swap ThrottlerGuard for TenantThrottlerGuard in APP_GUARD`
- [ ] Mover spec de `.openspec/changes/tenant-rate-limit/` para `.openspec/specs/tenant-rate-limit.md` (consolidar proposal + design + tasks em um único arquivo canônico, ou manter 3 — verificar convenção do projeto)
- [ ] **Fechar o ciclo OpenSpec**: arquivar a change após merge em `main`
- [ ] **Operacional**: comunicar ao time comercial quais empresas devem receber `plano = 'PRO'` ou `'ENTERPRISE'` no DB (ação manual via SQL ou painel admin)

## Task Dependencies

```
proposal.md → design.md → tasks.md
        ↓
features/tenant-rate-limit.feature (BDD)
        ↓
prisma/schema.prisma + migration (add_empresa_plano)
        ↓
src/shared/infrastructure/throttling/plano-limits.config.ts
src/shared/application/decorators/empresa-id.decorator.ts (estender)
        ↓
test/tenant-rate-limit.e2e-spec.ts (ATDD Red)
        ↓
src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts (TDD Red)
        ↓
src/shared/infrastructure/throttling/tenant-throttler.guard.ts (Green)
        ↓
src/shared/shared.module.ts (provider + export)
src/app.module.ts (useClass: TenantThrottlerGuard)
        ↓
[ATDD Green] + [TDD Green] + npm run validate:quick + security:check
        ↓
src/shared/README.md (documentar) + comentários de rastreabilidade
        ↓
PR + code review + security review + merge
        ↓
.openspec/changes/tenant-rate-limit/ → .openspec/specs/ (archive)
```

## File-by-File Traceability (planejado)

| Arquivo | Propósito | Requisitos cobertos |
|---------|-----------|---------------------|
| `features/tenant-rate-limit.feature` (novo) | 3 cenários BDD | REQ-TR-001, REQ-TR-002, REQ-TR-003, REQ-TR-006 |
| `prisma/schema.prisma` (estendido) | Enum `Plano` + `Empresa.plano` | REQ-TR-001 |
| `prisma/migrations/20260615190000_add_empresa_plano/migration.sql` | Migration SQL | REQ-TR-001, REQ-TR-008 |
| `src/shared/infrastructure/throttling/plano-limits.config.ts` (novo) | Mapa `PLANO_LIMITS` | REQ-TR-002, NFR-TR-007 |
| `src/shared/infrastructure/throttling/plano-limits.config.spec.ts` (novo) | TDD do config | REQ-TR-002 |
| `src/shared/application/decorators/empresa-id.decorator.ts` (estendido) | Suporte a `user.empresas[0].id` | REQ-TR-003 |
| `src/shared/application/decorators/empresa-id.decorator.spec.ts` (estendido) | TDD do decorator estendido | REQ-TR-003 |
| `src/shared/infrastructure/throttling/tenant-throttler.guard.ts` (novo) | `TenantThrottlerGuard extends ThrottlerGuard` | REQ-TR-002..008, NFR-TR-001..006 |
| `src/shared/infrastructure/throttling/tenant-throttler.guard.spec.ts` (novo) | TDD (≥ 5 testes, recomendado 10+) | Cobre todos os caminhos do guard |
| `src/app.module.ts` (estendido) | Troca `useClass: TenantThrottlerGuard` | REQ-TR-008 |
| `src/shared/shared.module.ts` (estendido) | Adiciona `TenantThrottlerGuard` a providers/exports | REQ-TR-008 |
| `test/tenant-rate-limit.e2e-spec.ts` (novo) | ATDD (4-8 testes) | Cobre 3 cenários BDD + edge cases |
| `src/shared/README.md` (estendido) | Documenta o mapa e o fallback | NFR-TR-003, NFR-TR-004 |
| `.openspec/changes/tenant-rate-limit/proposal.md` | Proposta + impacto + riscos + alternativas | — |
| `.openspec/changes/tenant-rate-limit/design.md` | Spec RFC 2119 + AC + edge cases | Todas as REQ/NFR |
| `.openspec/changes/tenant-rate-limit/tasks.md` | Este arquivo | — |

## Notes

- Cada task deve ser **independentemente commitável** com conventional commits.
- **Reuso máximo**: `extractEmpresaId` (estender, não duplicar), `PrismaService` (já global), `Cache` (já global via `CacheModule`), `Logger` do NestJS (Pino), `ThrottlerModule` (já configurado, manter), `ThrottlerGuard` (estender, não substituir a infraestrutura).
- **NÃO** criar módulo NestJS novo — conviver em `SharedModule`. `TenantThrottlerGuard` mora em `shared/infrastructure/throttling/` (novo subdiretório).
- **Cuidado com testes e2e existentes**: o limite default do tier `long` (100 req/min) é preservado para FREE — mas como o limite agora é **por tenant**, o seed de testes e2e (ex: `auth.e2e-spec.ts`, `empresas.e2e-spec.ts`) deve setar `empresa.plano = 'ENTERPRISE'` no `beforeAll` OU o `.env.test` deve ter `THROTTLER_LONG_LIMIT=10000` (já é o caso para os limites default). Verificar.
- **Estratégia de testes para PRO/ENTERPRISE**: o teste e2e real de PRO (1000 requests) e ENTERPRISE (10000 requests) é caro. **Recomendação**: TDD-only para PRO/ENTERPRISE (mock de `cache.get` retornando o plano), E2E real apenas para FREE (100 requests é viável em CI). Documentar trade-off.
- **Pino logger**: nunca usar `console.log` no guard — usar `private readonly logger = new Logger(TenantThrottlerGuard.name)`.
- **Cache key prefix**: usar `tenant:plano:<empresaId>` (namespace para evitar colisão com outras keys).
- **Cache TTL**: 60s é balanço entre "reflete mudança de plano rápido" e "evita hot-query no Prisma". Documentar.
- **Compatibilidade com `@Throttle({ tier: 'X', limit: Y, ttl: Z })` explícito**: o guard **NÃO** deve sobrescrever o `limit` fornecido pelo decorator. Implementação: verificar se o tracker já tem `limit` custom antes de aplicar `PLANO_LIMITS[plano][tier]`. TDD cobre.
- **Migrar feature para `.openspec/specs/`** apenas após merge em `main` (não antes — a change está "WIP" até ser aprovada e mergeada).
- **Operacional**: a mudança de `empresa.plano` (FREE → PRO/ENTERPRISE) é uma **operação de dados**, não de código. O time comercial/ops precisa de um script SQL ou painel admin para executar. **Fora do escopo desta change** (mas a `migration` torna a coluna editável trivialmente).

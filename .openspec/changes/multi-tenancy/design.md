# Feature: Multi-Tenancy (multi-tenancy) — Design Specification

## Overview

A feature `multi-tenancy` provê **isolamento automático por `empresaId`** em todas as operações Prisma contra modelos marcados como multi-tenant. O isolamento é implementado como **Prisma Client Extension** (`softDeleteExtension` em `src/prisma/prisma-extension.ts`), que lê o contexto de tenant via `AsyncLocalStorage` (`contextStorage`) e injeta `where.empresaId` em cada query — tornando **impossível** para o código de aplicação vazar registros cross-tenant por descuido.

**Casos de uso cobertos:**

- Isolamento de leitura: `findFirst`, `findMany`, `findUnique`, `count`, `findFirstOrThrow`, `findUniqueOrThrow`.
- Isolamento de escrita: `update`, `updateMany`, `delete`, `deleteMany`.
- Injeção automática de `empresaId` em `create` quando omitido pelo caller.
- Conversão de `findUnique` → `findFirst` para modelos com unique key composta incluindo `empresaId` (`UsuarioEmpresa`).
- Tolerância a ausência de contexto (rotas públicas — sem `x-empresa-id`).
- Bypass explícito para modelos não-multi-tenant (`Usuario`, `Empresa`, `Permissao`).

**Não cobertos** (outras changes / follow-ups):

- **Row-level security** no PostgreSQL (defesa em profundidade adicional).
- **Resource-level tenancy check** explícito em `findUnique` por id (cross-tenant hoje retorna 200, deve retornar 403 — ver `tasks.md`).
- **Schema-per-tenant** físico (banco separado por empresa).

## Requirements (RFC 2119)

### Functional Requirements

- **REQ-MT-001**: The system **MUST** isolate all Prisma operations on models registered in `multiTenantModels` (`Perfil`, `UsuarioEmpresa`) by injecting `where.empresaId` from the `AsyncLocalStorage` context.
  - Rastreabilidade:
    - BDD: `features/multi-tenancy.feature:Cenário: Leituras filtram por empresaId automaticamente` (Esquema), `Cenário: Updates são restritos ao tenant atual`, `Cenário: Deletes são restritos ao tenant atual`
    - ATDD: `test/multi-tenancy.e2e-spec.ts:admin A pode ler sua própria empresa A` / `admin B pode ler sua própria empresa B`
    - Implementação: `src/prisma/prisma-extension.ts:handleSoftDeleteAndMultiTenant` (linhas 73-99)

- **REQ-MT-002**: The system **MUST** convert `findUnique` into `findFirst` for multi-tenant models with composite unique keys (e.g., `UsuarioEmpresa` with `@@unique([usuarioId, empresaId])`), deconstructing the composite key into individual fields before delegating.
  - Rastreabilidade:
    - BDD: `features/multi-tenancy.feature:Cenário: findUnique é convertido em findFirst (unique key composta)`
    - Implementação: `src/prisma/prisma-extension.ts:makeMultiTenantHandlers > findUnique` (linhas 159-166) + `transformWhere` (linhas 141-156)

- **REQ-MT-003**: The system **MUST** propagate the tenant context from the HTTP `x-empresa-id` header into `AsyncLocalStorage` (`contextStorage`) via an interceptor, so that subsequent Prisma operations in the same request observe the same `empresaId` without the application code having to pass it explicitly.
  - Rastreabilidade:
    - Implementação: `src/shared/infrastructure/services/context.storage.ts` + `src/shared/interceptors/tenant-context.interceptor.ts`
    - ATDD: `test/multi-tenancy.e2e-spec.ts` — todos os testes exercitam `x-empresa-id`

- **REQ-MT-004**: The system **MUST NOT** overwrite an explicit `data.empresaId` provided by the caller on a `create` operation, so that administrative operations (creating records in a different tenant) are supported.
  - Rastreabilidade:
    - BDD: `features/multi-tenancy.feature:Cenário: Admin pode criar registro em outra empresa`
    - Implementação: `src/prisma/prisma-extension.ts:handleSoftDeleteAndMultiTenant > create` (linhas 91-98) — guarda `if (!args.data?.empresaId)`

- **REQ-MT-005**: The system **MUST** auto-inject `empresaId` from the context when a `create` operation does **NOT** specify `data.empresaId`, ensuring that ordinary controllers never need to remember to set it.
  - Rastreabilidade:
    - BDD: `features/multi-tenancy.feature:Cenário: Create sem empresaId explícita injeta a do contexto`
    - Implementação: `src/prisma/prisma-extension.ts:handleSoftDeleteAndMultiTenant > create` (linhas 91-98)

- **REQ-MT-006**: The system **MUST NOT** apply tenant scoping to models **NOT** in `multiTenantModels` (`Usuario`, `Empresa`, `Permissao`), allowing global lookups (e.g., login by e-mail) and global administrative operations.
  - Rastreabilidade:
    - BDD: `features/multi-tenancy.feature:Cenário: Modelos fora de multiTenantModels não são escopados`
    - Implementação: `src/prisma/prisma-extension.ts` — guarda `if (multiTenantModels.includes(model) && empresaId)` (linha 73)

- **REQ-MT-007**: The system **MUST NOT** break when `contextStorage` is empty (no `empresaId` available, e.g., public routes like `/auth/login`). Operations on multi-tenant models in this state **MUST** proceed without tenant filtering rather than throw.
  - Rastreabilidade:
    - BDD: `features/multi-tenancy.feature:Cenário: Ausência de contexto (empresaId) não quebra o sistema`
    - Implementação: `src/prisma/prisma-extension.ts` — guarda `if (... && empresaId)` torna o escopo **opt-in** pela presença do contexto

### Non-Functional Requirements

- **NFR-MT-001 (Security — LGPD/Tenancy)**: A query **MUST NOT** return records whose `empresaId` differs from the tenant in the current `contextStorage`, regardless of controller-level filtering. Cross-tenant access **MUST** be blocked at the data layer, not rely on application code discipline.
  - Rastreabilidade: `prisma-extension.ts:handleSoftDeleteAndMultiTenant` injeta `empresaId` em todas as operações; bypass só é possível se o caller usar `prisma` (cliente base) ao invés de `prisma.extended` — convenção documentada em `AGENTS.md`.

- **NFR-MT-002 (Performance)**: Tenant-scoped queries **MUST** use composite indexes covering `empresaId` to avoid sequential scans. Existing indexes on `Perfil` (`@@index([empresaId])`) and `UsuarioEmpresa` (`@@unique([usuarioId, empresaId])`) **SHALL** be sufficient for sub-100ms p95 on tables up to 1M rows.
  - Rastreabilidade: `prisma/schema.prisma` — índices em `Perfil` e `UsuarioEmpresa`.

- **NFR-MT-003 (Planos FREE/PRO/ENTERPRISE)**: The system **SHOULD** support per-tenant schema isolation as a future extension (REQ-MT-005-futuro), but **MUST NOT** implement it in this change. Plan limits: FREE=1 schema, PRO=5, ENTERPRISE=ilimitado. Documentado como follow-up.
  - Rastreabilidade: `tasks.md` — follow-up "schema-per-plan".

- **NFR-MT-004 (Auditability)**: The `softDeleteExtension` **SHALL** be the **only** Prisma client instance used by application code (`prisma.extended`). Direct access to `prisma.<model>.*` (the base client) bypasses tenancy and **MUST NOT** be used outside infrastructure code.
  - Rastreabilidade: convenção em `AGENTS.md`; enforced por revisão de código.

- **NFR-MT-005 (Context propagation)**: `contextStorage` **MUST** use Node.js `AsyncLocalStorage` (not closures, not request-scoped singletons) to guarantee correct propagation across `await` boundaries and child operations within the same request.
  - Rastreabilidade: `src/shared/infrastructure/services/context.storage.ts` — `new AsyncLocalStorage<{ empresaId?: string }>()`.

- **NFR-MT-006 (Header validation)**: The `x-empresa-id` header **MUST** be validated against the user's JWT (i.e., the `empresaId` MUST be one of the `empresas[].id` in the JWT payload) by the `@TemEmpresa` decorator / interceptor. Requests with mismatched `x-empresa-id` **MUST** return 403.
  - Rastreabilidade: `test/multi-tenancy.e2e-spec.ts:admin A com token válido mas sem x-empresa-id deve ser rejeitado` (espera 400 ou 403).

## Acceptance Criteria

- [x] AC-MT-01: Toda operação de leitura em modelo multi-tenant adiciona `WHERE empresaId = <contexto>` automaticamente.
- [x] AC-MT-02: Toda operação de update/delete em modelo multi-tenant é restrita ao tenant atual (registros de outros tenants não são afetados).
- [x] AC-MT-03: `create` em modelo multi-tenant sem `data.empresaId` injeta o valor do contexto.
- [x] AC-MT-04: `create` em modelo multi-tenant com `data.empresaId` explícito **NÃO** sobrescreve o valor (admin pode criar em outro tenant).
- [x] AC-MT-05: `findUnique({ where: { usuarioId_empresaId: { ... } } })` em `UsuarioEmpresa` é convertido em `findFirst` com campos desconstruídos.
- [x] AC-MT-06: Modelos fora de `multiTenantModels` (`Usuario`, `Empresa`, `Permissao`) **NÃO** recebem filtro de tenant.
- [x] AC-MT-07: Rota sem contexto de tenant (`contextStorage` vazio) prossegue sem erro e sem filtro.
- [x] AC-MT-08: Request com `x-empresa-id` ausente em rota que requer tenant é rejeitada (400 ou 403).

## API Specification (Contratos de entrada/saída)

### Header `x-empresa-id`

**Obrigatório** em todas as rotas que tocam modelos multi-tenant, exceto rotas públicas (`/auth/login`, `/auth/refresh`, `/health`).

**Validação**:
- Deve ser um UUID válido.
- Deve estar presente em `empresas[].id` do JWT do usuário.

**Erros**:
- `400 Bad Request` — header ausente em rota que requer tenant.
- `403 Forbidden` — header presente mas `empresaId` não pertence ao usuário.

### Interceptor `TenantContextInterceptor`

Lê `x-empresa-id` do request, valida contra o JWT, popula `contextStorage.getStore().empresaId` antes do handler. Limpa no fim do request (via `try/finally`).

## Data Models (apenas o que é específico de tenancy)

### Entity: `Perfil` (multi-tenant)

| Field     | Type   | Required | Description                       |
| --------- | ------ | -------- | --------------------------------- |
| empresaId | String | Yes      | FK → `Empresa.id`                 |

Índices: `@@index([empresaId])` (já existente).

### Entity: `UsuarioEmpresa` (multi-tenant)

| Field     | Type   | Required | Description                              |
| --------- | ------ | -------- | ---------------------------------------- |
| usuarioId | Int    | Yes      | FK → `Usuario.id`                        |
| empresaId | String | Yes      | FK → `Empresa.id`                        |

Índices: `@@unique([usuarioId, empresaId])` (já existente).

## Edge Cases

| # | Caso | Tratamento |
|---|------|------------|
| 1 | Rota pública (`/auth/login`) toca `Usuario.findByEmail` (modelo NÃO-multi-tenant) | Sem `empresaId` no contexto; query prossegue sem filtro. BDD: "Ausência de contexto". |
| 2 | Admin cria `UsuarioEmpresa` para outra empresa | `data.empresaId` explícito é respeitado. BDD: "Admin pode criar registro em outra empresa". |
| 3 | `findUnique({ where: { usuarioId_empresaId: { ... } } })` | Convertido em `findFirst` com `transformWhere`. BDD: "findUnique é convertido". |
| 4 | `create` em modelo multi-tenant sem `data.empresaId` | Injetado do contexto. BDD: "Create sem empresaId explícita". |
| 5 | Model `UsuarioEmpresa` (não está em `softDeleteModels`) é deletado | DELETE real, não soft. BDD soft-delete: "Modelos fora de softDeleteModels não recebem soft-delete". |
| 6 | `x-empresa-id` no header não bate com JWT | 403. ATDD: "admin A com token válido mas sem x-empresa-id deve ser rejeitado". |
| 7 | `prisma` (base client) chamado fora de `extended` | **Bypass** de tenancy — convenção: nunca usar `prisma.<model>` direto, sempre `prisma.extended.<model>`. |
| 8 | Concorrência: dois requests com `empresaId` diferente | `AsyncLocalStorage` isola corretamente por request — sem cross-talk. |

## Acceptance Tests (ATDD)

Localização: `test/multi-tenancy.e2e-spec.ts`.

```typescript
describe('Multi-tenancy (e2e)', () => {
  // BDD: Cenário: Admin A pode ler sua própria empresa A
  it('admin A pode ler sua própria empresa A', ...);
  // BDD: Cenário: Admin B pode ler sua própria empresa B
  it('admin B pode ler sua própria empresa B', ...);
  // BDD: Cenário: Resource-level tenancy (follow-up)
  it('admin A com token válido pode ler registro de empresa B (limitação atual)', ...);
  // BDD: Cenário: x-empresa-id ausente
  it('admin A com token válido mas sem x-empresa-id deve ser rejeitado', ...);
  // BDD: Cenário: Listagem geral
  it('GET /empresas (listagem) deve respeitar a autorização do token', ...);
});
```

## Unit Tests (TDD)

Localização: `src/prisma/prisma-extension.spec.ts` (referência nos comentários do arquivo).

Cobrem o comportamento dos handlers `handleSoftDeleteAndMultiTenant`, `makeMultiTenantHandlers`, `makeSoftDeleteHandlers` em isolamento.

## Technical Notes

- **Por que Prisma Extension?** Atua no nível mais baixo (client Prisma). Toda operação passa por ele, então é impossível para o código de aplicação esquecer de aplicar o filtro. Alternativas rejeitadas: middleware NestJS (deixa brechas em código que usa `PrismaService` direto), repositório por modelo (repetição).
- **Por que `AsyncLocalStorage`?** Propaga contexto sem ter que adicionar parâmetro `empresaId` em cada método de service/repository. Funciona corretamente através de `await`.
- **Plano de evolução**: schema-per-tenant é a evolução natural para clientes ENTERPRISE que precisam de isolamento físico. Mudança **breaking** — exige nova change request.
- **Bypass conhecido**: `prisma.<model>` (sem `extended`) ignora a extension. Convenção: nunca usar fora de infraestrutura; lint rule + revisão de código.

## BDD Scenarios Associated

- `features/multi-tenancy.feature:Cenário: Leituras filtram por empresaId automaticamente` (Esquema do Cenário — 6 exemplos)
- `features/multi-tenancy.feature:Cenário: Updates são restritos ao tenant atual` (Esquema do Cenário — 4 exemplos)
- `features/multi-tenancy.feature:Cenário: Deletes são restritos ao tenant atual` (Esquema do Cenário — 4 exemplos)
- `features/multi-tenancy.feature:Cenário: findUnique é convertido em findFirst (unique key composta)`
- `features/multi-tenancy.feature:Cenário: Admin pode criar registro em outra empresa`
- `features/multi-tenancy.feature:Cenário: Create sem empresaId explícita injeta a do contexto`
- `features/multi-tenancy.feature:Cenário: Modelos fora de multiTenantModels não são escopados` (Esquema do Cenário — 3 exemplos)
- `features/multi-tenancy.feature:Cenário: Ausência de contexto (empresaId) não quebra o sistema`

**Total: 8 cenários BDD (com 17 exemplos inline em Esquemas do Cenário).**

## Status

- [x] Draft
- [x] In Review
- [x] Approved
- [x] Implemented
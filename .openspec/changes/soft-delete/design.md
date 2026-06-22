# Feature: Soft-Delete (soft-delete) — Design Specification

## Overview

A feature `soft-delete` provê **exclusão lógica automática** para modelos sensíveis (`Usuario`, `Perfil`, `Permissao`, `Empresa`), convertendo operações `DELETE` em `UPDATE { deletedAt: now(), ativo: false }` via **Prisma Client Extension** (`softDeleteExtension` em `src/prisma/prisma-extension.ts`). Leituras subsequentes **filtram automaticamente** registros com `deletedAt IS NOT NULL`, tornando o soft-delete **transparente** para o código de aplicação.

**Casos de uso cobertos:**

- Exclusão lógica via `DELETE` HTTP padrão (sem mudança de contrato).
- Filtro automático em `findMany`, `findFirst`, `findUnique`, `findUniqueOrThrow`, `findFirstOrThrow`, `count`.
- Respeito a `where.deletedAt` explícito (auditoria, restore).
- Conversão de `deleteMany` em `updateMany` (soft-delete em lote).
- Bypass para modelos não-sensíveis (ex.: `UsuarioEmpresa` — DELETE físico).
- Preservação completa de dados para auditoria (apenas marca `deletedAt`/`ativo`).

**Não cobertos** (outras changes / follow-ups):

- **Job de purge automático** após N dias (REQ-SD-006 documentado como follow-up).
- **Endpoint `PATCH /restore`** canônico (restore é manual via `PATCH { ativo: true, deletedAt: null }`).

## Requirements (RFC 2119)

### Functional Requirements

- **REQ-SD-001**: All models registered in `softDeleteModels` (`Usuario`, `Perfil`, `Permissao`, `Empresa`) **MUST** have a `deletedAt: DateTime?` column (nullable) in the Prisma schema, and the entity **MUST** extend `BaseEntity` (`src/shared/domain/entities/base.entity.ts`).
  - Rastreabilidade:
    - Implementação: `src/shared/domain/entities/base.entity.ts` (campos `deletedAt?` e `ativo`); `prisma/schema.prisma` — colunas em `Usuario`, `Perfil`, `Permissao`, `Empresa`.

- **REQ-SD-002**: All read operations on `softDeleteModels` (`findUnique`, `findFirst`, `findMany`, `count`, `findFirstOrThrow`, `findUniqueOrThrow`) **MUST** auto-inject `where.deletedAt = null` if the caller did not specify `where.deletedAt`, hiding soft-deleted records from the result.
  - Rastreabilidade:
    - BDD: `features/soft-delete.feature:Cenário: Leituras aplicam filtro deletedAt: null automaticamente` (Esquema do Cenário — 6 exemplos)
    - Implementação: `src/prisma/prisma-extension.ts:handleSoftDeleteAndMultiTenant` (linhas 56-70)
    - ATDD: `test/soft-delete.e2e-spec.ts:após soft-delete, registro NÃO aparece via prisma.extended`

- **REQ-SD-003**: Any `delete` operation on a `softDeleteModels` entry **MUST** be converted to an `update` setting `deletedAt = current timestamp` and `ativo = false`. The physical `DELETE` SQL **MUST NOT** be issued; the record **MUST** remain in the database for audit.
  - Rastreabilidade:
    - BDD: `features/soft-delete.feature:Cenário: DELETE é convertido em UPDATE com deletedAt e ativo=false` (Esquema do Cenário — 4 modelos)
    - Implementação: `src/prisma/prisma-extension.ts:makeSoftDeleteHandlers > delete` (linhas 114-119)
    - ATDD: `test/soft-delete.e2e-spec.ts:DELETE /empresas/:id deve soft-deletar` — verifica `row.deletedAt instanceof Date` e `ativo === false`

- **REQ-SD-004**: Any `deleteMany` operation on a `softDeleteModels` entry **MUST** be converted to `updateMany` setting `deletedAt = now()` and `ativo = false` for all matching records.
  - Rastreabilidade:
    - BDD: `features/soft-delete.feature:Cenário: DELETE Many também aciona soft-delete` (Esquema do Cenário — 4 modelos)
    - Implementação: `src/prisma/prisma-extension.ts:makeSoftDeleteHandlers > deleteMany` (linhas 121-127)

- **REQ-SD-005**: Models **NOT** in `softDeleteModels` (e.g., `UsuarioEmpresa`) **MUST** receive a physical `DELETE`; the `deletedAt` column **MUST NOT** be set. This is the bypass for join tables and audit-irrelevant records.
  - Rastreabilidade:
    - BDD: `features/soft-delete.feature:Cenário: Modelos fora de softDeleteModels não recebem soft-delete`
    - Implementação: `src/prisma/prisma-extension.ts:softDeleteExtension > model` — apenas `usuario`, `perfil`, `permissao`, `empresa` recebem `makeSoftDeleteHandlers` (linhas 187-192)

- **REQ-SD-006**: An explicit `where.deletedAt` provided by the caller **MUST NOT** be overwritten by the auto-injected filter. This allows audit screens to query `where: { deletedAt: { not: null } }` (soft-deleted) or `where: { deletedAt: '2026-01-01' }` (point-in-time lookup).
  - Rastreabilidade:
    - BDD: `features/soft-delete.feature:Cenário: where.deletedAt explícito não é sobrescrito` (Esquema do Cenário — 3 exemplos)
    - Implementação: `src/prisma/prisma-extension.ts:handleSoftDeleteAndMultiTenant` — guarda `if (where.deletedAt === undefined)` (linha 66)

- **REQ-SD-007**: Soft-deleting a record **MUST** preserve all other fields (e.g., `email`, `nome`, `codigo`, etc.) — only `deletedAt` and `ativo` are mutated.
  - Rastreabilidade:
    - BDD: `features/soft-delete.feature:Cenário: Soft-delete preserva dados para auditoria`
    - Implementação: `src/prisma/prisma-extension.ts:makeSoftDeleteHandlers > delete` — usa `update({ ...args, data: { ...(args?.data || {}), deletedAt: new Date(), ativo: false } })` — spread de `args.data` preserva campos

### Non-Functional Requirements

- **NFR-SD-001 (LGPD Compliance)**: The system **MUST NOT** issue physical `DELETE` SQL for `softDeleteModels`. Data **MUST** be retained for auditability, point-in-time recovery, and regulatory compliance (LGPD Art. 16, Art. 37). The `deletedAt` timestamp **SHALL** be the authoritative marker of logical deletion.
  - Rastreabilidade: BDD implícito em todos os cenários de delete; implementação na extension.

- **NFR-SD-002 (Restoration)**: Restoration of a soft-deleted record **SHALL** be performed by `PATCH { ativo: true, deletedAt: null }` (or any equivalent `update`). The system **MUST NOT** provide a separate `restore` operation that bypasses the audit trail — every change is observable.
  - Rastreabilidade: convenção documentada em `design.md:REQ-SD-007` e `tasks.md`.

- **NFR-SD-003 (Auto-cleanup / Purge)**: The system **SHOULD** automatically purge records where `deletedAt < now() - 90 days` via an internal cron/scheduled job. This **MUST** be implemented in a separate change (`soft-delete-purge`); **MUST NOT** be in scope of this change.
  - Rastreabilidade: `tasks.md` — follow-up "REQ-SD-006 — Job de purge após 90 dias".

- **NFR-SD-004 (Bypass safety)**: The `softDeleteExtension` **SHALL** be the only Prisma client used by application code (`prisma.extended`). Direct `prisma.<model>.<op>` access (the base client) bypasses both tenancy AND soft-delete and **MUST NOT** be used outside infrastructure code.
  - Rastreabilidade: convenção `prisma.extended` em `AGENTS.md`; enforcement por revisão de código.

- **NFR-SD-005 (Idempotency)**: Soft-delete operations **MUST** be idempotent — calling `delete` on an already soft-deleted record **MUST NOT** produce an error or 500 response. The HTTP layer may return 204 (idempotent OK) or 404 (resource gone from filtered view), but **MUST NOT** return 500.
  - Rastreabilidade: ATDD `test/soft-delete.e2e-spec.ts:soft-delete é idempotente` — `expect([204, 404]).toContain(second.status)`.

- **NFR-SD-006 (Observability)**: Soft-delete operations **SHOULD** emit a structured log with `userId` (actor), `model`, `recordId`, `deletedAt`. Successful restores **SHOULD** be similarly logged.
  - Rastreabilidade: logs estruturados via `Logger` do NestJS + `OpenTelemetry` (já instrumentados); observabilidade operacional.

- **NFR-SD-007 (Performance)**: Read operations on `softDeleteModels` **SHOULD** be served in < 100 ms p95 under nominal load. The `WHERE deletedAt IS NULL` filter **MUST** be indexable via a partial index `WHERE deletedAt IS NULL` (Postgres), or composite index `(deletedAt, id)` for `findUnique` performance.
  - Rastreabilidade: índices existentes em `prisma/schema.prisma`; partial index como otimização futura.

## Acceptance Criteria

- [x] AC-SD-01: `DELETE /<modelo>/:id` em `Usuario`, `Perfil`, `Permissao` ou `Empresa` retorna 204 e o registro permanece no banco com `ativo=false` e `deletedAt` preenchido.
- [x] AC-SD-02: Após soft-delete, `findFirst`/`findMany`/`findUnique` via `prisma.extended` retornam `null`/array vazio.
- [x] AC-SD-03: `deleteMany` em modelo soft-delete é convertido em `updateMany` com `deletedAt` e `ativo=false` em todos os registros afetados.
- [x] AC-SD-04: `delete` em modelo fora de `softDeleteModels` (ex.: `UsuarioEmpresa`) executa `DELETE` físico.
- [x] AC-SD-05: `where.deletedAt` explícito fornecido pelo caller **NÃO** é sobrescrito pelo filtro auto-injetado.
- [x] AC-SD-06: Soft-delete é idempotente — segunda chamada de `DELETE` no mesmo registro retorna 204 ou 404 (nunca 500).
- [x] AC-SD-07: Todos os campos (exceto `deletedAt`/`ativo`) são preservados após soft-delete.

## API Specification (mudanças de comportamento observável)

### `DELETE /empresas/:id` (exemplo)

**Comportamento anterior** (sem soft-delete): registro removido fisicamente; `findUnique` retorna `null`.

**Comportamento atual** (com soft-delete):
- HTTP 204 retornado.
- Registro permanece no banco com `ativo=false`, `deletedAt=<timestamp>`.
- `findUnique` subsequente via `prisma.extended` retorna `null` (filtrado).
- `findUnique` via `prisma` (base, bypass) retorna o registro com `ativo=false` (auditoria).

### Restore via `PATCH /empresas/:id`

```json
{ "ativo": true, "deletedAt": null }
```

**Resposta 200**: registro retornado com `ativo=true`, `deletedAt=null`.

## Data Models

### `BaseEntity` (abstract, src/shared/domain/entities/base.entity.ts)

| Field     | Type            | Required | Description                          |
| --------- | --------------- | -------- | ------------------------------------ |
| id        | number          | Yes      | PK auto-increment                     |
| createdAt | Date            | Yes      | Default `now()`                       |
| updatedAt | Date            | Yes      | Atualizado em cada `update`           |
| deletedAt | Date \| null    | No       | Soft-delete timestamp (null = ativo)   |
| ativo     | boolean         | Yes      | Default `true`; `false` = soft-deleted |

### Soft-delete Models (registrados em `softDeleteModels`)

`Usuario`, `Perfil`, `Permissao`, `Empresa` — todos estendem `BaseEntity` e têm `@@index([deletedAt])` (ou índice composto) para performance do filtro.

## Edge Cases

| # | Caso | Tratamento |
|---|------|------------|
| 1 | Soft-delete + restore + soft-delete (múltiplas marcações) | `deletedAt` é sempre o timestamp da última deleção. Não há histórico de deleções (não é "soft-delete com versionamento"). |
| 2 | Restore parcial — `PATCH { ativo: true }` sem zerar `deletedAt` | `ativo=true` mas `deletedAt` ainda setado. Queries filtram `deletedAt: null` → registro continua invisível. Documentar como armadilha. |
| 3 | `findUnique` em registro soft-deletado via `prisma.extended` | Retorna `null` (filter injetado). Caller recebe `null` mesmo sabendo que o registro existe no banco. |
| 4 | `where.deletedAt: null` explícito + `includeDeleted: true` (helper futuro) | Hoje `includeDeleted` não é implementado — caller usa `where.deletedAt: undefined` (omit) ou `where.deletedAt: { not: null }` (explicito). |
| 5 | DELETE em modelo soft-delete com `where` adicional (ex.: `{ id: 42, nome: 'foo' }`) | `delete({ where: { id: 42, nome: 'foo' } })` → `update({ where: { id: 42, nome: 'foo' }, data: { deletedAt: now, ativo: false } })` — o `where` adicional é preservado. |
| 6 | DELETE em registro já soft-deletado | Idempotente: o `update` apenas atualiza `deletedAt` para o novo timestamp. HTTP 204. |
| 7 | DELETE em modelo soft-delete com composite unique (`UsuarioEmpresa`) | Não acontece — `UsuarioEmpresa` não está em `softDeleteModels`. |
| 8 | Cascade delete Prisma (`onDelete: Cascade`) | Hook do Prisma em foreign keys **NÃO** é interceptado pela extension — DELETE físico em modelo pai pode cascade para filhos. Documentar como gap. |
| 9 | Soft-delete de `Empresa` (modelo pai) com `Usuario` filhos | Filhos continuam existindo (sem cascade). Caller pode soft-deletar filhos manualmente ou aceitar inconsistência. Decisão consciente. |
| 10 | Clock skew em `deletedAt = new Date()` | Usa `Date.now()` do servidor Node — não coordena com DB. Aceitável para soft-delete (precisão de segundos é suficiente). |

## Acceptance Tests (ATDD)

Localização: `test/soft-delete.e2e-spec.ts`.

```typescript
describe('Soft-delete (e2e)', () => {
  // BDD: DELETE é convertido em UPDATE
  it('DELETE /empresas/:id deve soft-deletar (ativo=false, deletedAt != null)', ...);
  // BDD: Leituras aplicam filtro deletedAt: null
  it('após soft-delete, registro NÃO aparece via prisma.extended', ...);
  // BDD: Idempotência
  it('soft-delete é idempotente: chamar DELETE duas vezes não falha a 2ª', ...);
});
```

## Unit Tests (TDD)

Localização: `src/prisma/prisma-extension.spec.ts` (mesmo arquivo de `multi-tenancy` — extension compartilhada).

Cobrem os caminhos críticos de `handleSoftDeleteAndMultiTenant` (filter em leituras, respeito a `where.deletedAt` explícito) e `makeSoftDeleteHandlers` (conversão delete→update).

## Technical Notes

- **Por que Prisma Extension?** Idem a multi-tenancy — cobertura automática, impossível de esquecer.
- **Por que `ativo=false` em adição a `deletedAt`?** Redundância que simplifica queries de "ativo" (filtro trivial `WHERE ativo=true` sem precisar de `IS NULL` check) — útil para casos onde o caller não quer aplicar o filtro `deletedAt: null`.
- **Restore via `PATCH`**: decisão consciente — restore é uma atualização de negócio, deve ser observável no log/audit trail.
- **Auto-cleanup (REQ-SD-006)**: fica para change própria (`soft-delete-purge`) — exige job scheduler (BullMQ ou similar) e cuidado com LGPD (consentimento + prazo legal).
- **Bypass conhecido**: `prisma.<model>` (sem `extended`) ignora soft-delete. Convenção: nunca usar fora de infraestrutura.

## BDD Scenarios Associated

- `features/soft-delete.feature:Cenário: DELETE é convertido em UPDATE com deletedAt e ativo=false` (Esquema do Cenário — 4 modelos)
- `features/soft-delete.feature:Cenário: Leituras aplicam filtro deletedAt: null automaticamente` (Esquema do Cenário — 6 exemplos)
- `features/soft-delete.feature:Cenário: where.deletedAt explícito não é sobrescrito` (Esquema do Cenário — 3 exemplos)
- `features/soft-delete.feature:Cenário: DELETE Many também aciona soft-delete` (Esquema do Cenário — 4 modelos)
- `features/soft-delete.feature:Cenário: Modelos fora de softDeleteModels não recebem soft-delete`
- `features/soft-delete.feature:Cenário: Soft-delete preserva dados para auditoria`

**Total: 6 cenários BDD (com 17 exemplos inline em Esquemas do Cenário).**

## Status

- [x] Draft
- [x] In Review
- [x] Approved
- [x] Implemented
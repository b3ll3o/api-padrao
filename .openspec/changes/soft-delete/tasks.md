# Feature: Soft-Delete (soft-delete) — Tasks

> **Status**: todas as tasks de implementação estão concluídas. Esta é uma documentação retroativa (CR retroativo) — o trabalho foi feito e este registro o formaliza. Há **2 follow-ups** documentados ao final.

## Implementation Tasks

### Phase 1: Preparation

- [x] Criar diretório `.openspec/changes/soft-delete/`
- [x] Escrever `proposal.md` (decisão de design, impacto, riscos)
- [x] Escrever `design.md` (requisitos RFC 2119, AC, edge cases)
- [x] Revisar e aprovar a proposal

### Phase 2: Domain Discovery (BDD)

- [x] Escrever `features/soft-delete.feature` cobrindo conversão DELETE→UPDATE, filtro em leituras, respeito a `where.deletedAt` explícito, bypass para modelos não-sensíveis, preservação de dados (6 cenários com 17 exemplos inline em Esquemas do Cenário)
- [x] Mapear cenários BDD para acceptance criteria (AC-SD-01..07)

### Phase 3: Data Model

- [x] Adicionar `deletedAt: DateTime?` em `Usuario`, `Perfil`, `Permissao`, `Empresa` (migration Prisma)
- [x] Garantir `ativo: Boolean @default(true)` nos mesmos modelos
- [x] Criar `src/shared/domain/entities/soft-delete.interface.ts` (`ISoftDelete`)
- [x] Criar `src/shared/domain/entities/base.entity.ts` (`BaseEntity` abstrata com `deletedAt`, `ativo`, `createdAt`, `updatedAt`, `id`)

### Phase 4: Infrastructure (Extension)

- [x] Adicionar `softDeleteModels = ['Usuario', 'Perfil', 'Permissao', 'Empresa']` em `src/prisma/prisma-extension.ts`
- [x] Implementar `handleSoftDeleteAndMultiTenant` (query extension: injeta `where.deletedAt = null` se `where.deletedAt === undefined`, em find* e count)
- [x] Implementar `makeSoftDeleteHandlers()` (model extension: `delete` → `update({ deletedAt: new Date(), ativo: false })`, `deleteMany` → `updateMany(...)`)
- [x] Registrar handlers no `softDeleteExtension` para `usuario`, `perfil`, `permissao`, `empresa` (não para `usuarioEmpresa` — DELETE físico)

### Phase 5: PrismaService Wiring

- [x] Confirmar que `PrismaService` expõe `prisma.extended` (compartilhado com multi-tenancy)

### Phase 6: Test Development (ATDD)

- [x] Escrever testes e2e em `test/soft-delete.e2e-spec.ts` (3 testes):
  - `DELETE /empresas/:id deve soft-deletar (ativo=false, deletedAt != null)` (BDD: DELETE→UPDATE)
  - `após soft-delete, registro NÃO aparece via prisma.extended` (BDD: filtro em leituras)
  - `soft-delete é idempotente: chamar DELETE duas vezes não falha a 2ª` (NFR-SD-005 idempotência)
- [x] Verificar que os testes e2e passaram (Green Phase)

### Phase 7: Unit Tests (TDD)

- [x] Cobrir `handleSoftDeleteAndMultiTenant` e `makeSoftDeleteHandlers` em `src/prisma/prisma-extension.spec.ts` (compartilhado com multi-tenancy)

### Phase 8: Cross-cutting Documentation

- [x] Adicionar headers de rastreabilidade em `base.entity.ts` (`// BDD: N/A`, `// SDD: N/A`, `// TDD: src/shared/domain/entities/base.entity.spec.ts`)
- [x] Documentar convenção `prisma.extended` vs `prisma` no `AGENTS.md` (compartilhado com multi-tenancy)

### Phase 9: Verification

- [x] Rodar testes de aceitação — passam (Green Phase)
- [x] Rodar testes unitários — passam
- [x] `npm run validate:quick` (lint + typecheck + testes) — passa

## Follow-ups (gaps conhecidos)

### Follow-up 1: Job de purge automático após 90 dias (REQ-SD-006)

- **Status**: planejado, não iniciado.
- **Descrição**: BullMQ scheduled job que faz `DELETE` físico em registros onde `deletedAt < now() - 90 days`. Roda diariamente.
- **Cuidado LGPD**: garantir que o job é opt-in por modelo (alguns podem ter retenção legal maior — ex.: `LoginHistory` 5 anos).
- **Esforço estimado**: baixo-médio — adicionar `@Cron('0 3 * * *')` + novo consumer BullMQ.
- **Quando**: próximo trimestre (LGPD Art. 16 — prazo razoável).
- **Change proposta**: `.openspec/changes/soft-delete-purge/`.

### Follow-up 2: Endpoint canônico `PATCH /<modelo>/:id/restore`

- **Status**: aceito como melhoria opcional.
- **Descrição**: hoje restore é via `PATCH { ativo: true, deletedAt: null }` (manual). Criar endpoint dedicado para clareza de API.
- **Benefício**: clareza contratual, evita armadilha do restore parcial (apenas `ativo: true`).
- **Esforço estimado**: baixo — endpoint + service method.
- **Quando**: quando houver caso de uso real (admin panel de auditoria).

### Follow-up 3: Cascade-aware soft-delete

- **Status**: aceito como gap.
- **Descrição**: hoje, soft-delete de `Empresa` (pai) não cascade para `Usuario` filhos. Filhos continuam ativos. Decisão consciente (cascade pode surpreender caller), mas vale documentar como opção.
- **Esforço estimado**: médio — exige check explícito no service de cada modelo pai.
- **Quando**: quando houver demanda concreta.

## Task Dependencies (as executed)

```
prisma/schema.prisma (deletedAt + ativo em Usuario, Perfil, Permissao, Empresa)
        ↓
src/shared/domain/entities/soft-delete.interface.ts (ISoftDelete)
        ↓
src/shared/domain/entities/base.entity.ts (BaseEntity abstrata)
        ↓
src/prisma/prisma-extension.ts (softDeleteModels + makeSoftDeleteHandlers)
        ↓
src/prisma/prisma.service.ts (expõe prisma.extended)
        ↓
features/soft-delete.feature (6 cenários BDD)
        ↓
test/soft-delete.e2e-spec.ts (3 testes ATDD)
        ↓
src/prisma/prisma-extension.spec.ts (TDD)
        ↓
.openspec/changes/soft-delete/{proposal,design,tasks}.md (CR retroativo)
```

## File-by-File Traceability

| Arquivo | Propósito | Requisitos cobertos |
|---------|-----------|----------------------|
| `features/soft-delete.feature` | 6 cenários BDD (conversão, filtro, bypass, preservação) | REQ-SD-001..007 |
| `prisma/schema.prisma` | Colunas `deletedAt DateTime?`, `ativo Boolean` em 4 modelos | REQ-SD-001 |
| `src/shared/domain/entities/soft-delete.interface.ts` | `ISoftDelete` contrato | REQ-SD-001 |
| `src/shared/domain/entities/base.entity.ts` | `BaseEntity` abstrata (campos comuns) | REQ-SD-001, REQ-SD-007 |
| `src/prisma/prisma-extension.ts` | `softDeleteExtension` (query + model) | REQ-SD-001..007, NFR-SD-001, NFR-SD-005 |
| `src/prisma/prisma.service.ts` | Expõe `prisma.extended` | REQ-SD-001, NFR-SD-004 |
| `src/prisma/prisma-extension.spec.ts` | TDD dos handlers (compartilhado) | Cobre os caminhos críticos |
| `test/soft-delete.e2e-spec.ts` | 3 testes ATDD | AC-SD-01..07 |
| `.openspec/changes/soft-delete/proposal.md` | Proposta + impacto + riscos | — |
| `.openspec/changes/soft-delete/design.md` | Spec RFC 2119 + AC + edge cases | Todas as REQ/NFR |
| `.openspec/changes/soft-delete/tasks.md` | Este arquivo | — |

## Notes

- A spec é retroativa: o código veio primeiro, a documentação OpenSpec vem depois — o oposto do fluxo `DDD→BDD→SDD→ATDD→TDD` em modo prospectivo.
- A extension `softDeleteExtension` é compartilhada com a feature `multi-tenancy` (mesmo arquivo, dual-purpose). Os REQs estão separados por change, mas o arquivo de implementação é único.
- `BaseEntity` é **abstract** — usada como type/class helper, não instanciada diretamente. Entidades concretas (`Usuario`, `Perfil`, etc.) são geradas pelo Prisma Client.
- Restore via `PATCH` é o método atual. Caso o time prefira endpoint canônico `PATCH /:id/restore`, criar nova change (`soft-delete-restore-endpoint`).
- Mudanças futuras em soft-delete (purge, restore endpoint, cascade-aware) **MUST** ser feitas em nova change request, conforme consistência com `NFR-AUTH-008`.
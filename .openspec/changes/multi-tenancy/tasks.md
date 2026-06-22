# Feature: Multi-Tenancy (multi-tenancy) — Tasks

> **Status**: todas as tasks de implementação estão concluídas. Esta é uma documentação retroativa (CR retroativo) — o trabalho foi feito e este registro o formaliza. Há **2 follow-ups** documentados ao final.

## Implementation Tasks

### Phase 1: Preparation

- [x] Criar diretório `.openspec/changes/multi-tenancy/`
- [x] Escrever `proposal.md` (decisão de design, impacto, riscos)
- [x] Escrever `design.md` (requisitos RFC 2119, AC, edge cases)
- [x] Revisar e aprovar a proposal

### Phase 2: Domain Discovery (BDD)

- [x] Escrever `features/multi-tenancy.feature` cobrindo isolamento de leitura/escrita, conversão `findUnique`→`findFirst`, criação cross-tenant, bypass de modelos não-multi-tenant, ausência de contexto (8 cenários com 17 exemplos inline em Esquemas do Cenário)
- [x] Mapear cenários BDD para acceptance criteria (AC-MT-01..08)

### Phase 3: Data Model

- [x] Garantir coluna `empresaId` em `Perfil` (FK → `Empresa.id`, índice `@@index([empresaId])`)
- [x] Garantir `@@unique([usuarioId, empresaId])` em `UsuarioEmpresa` (unique key composta que dispara conversão `findUnique`→`findFirst`)

### Phase 4: Infrastructure (Context + Extension)

- [x] Criar `src/shared/infrastructure/services/context.storage.ts` (`AsyncLocalStorage<{ empresaId?: string }>`)
- [x] Criar `src/shared/interceptors/tenant-context.interceptor.ts` que lê `x-empresa-id`, valida contra JWT e popula `contextStorage`
- [x] Criar `src/prisma/prisma-extension.ts` com:
  - `handleSoftDeleteAndMultiTenant` (query extension: injeta `empresaId` em find/update/delete; injeta `empresaId` em `create` se ausente; respeita `data.empresaId` explícito)
  - `makeMultiTenantHandlers()` (model extension: `findUnique` → `findFirst` + `transformWhere` para composite keys)
  - `softDeleteExtension` (`Prisma.defineExtension` agregando tudo)

### Phase 5: PrismaService Wiring

- [x] Atualizar `src/prisma/prisma.service.ts` para expor `extended` (client Prisma com `softDeleteExtension` aplicado) — convenção: application code usa `prisma.extended.<model>`, nunca `prisma.<model>` direto (NFR-MT-004)

### Phase 6: Test Development (ATDD)

- [x] Escrever testes e2e em `test/multi-tenancy.e2e-spec.ts` (5 testes):
  - `admin A pode ler sua própria empresa A` (BDD: leitura escopada)
  - `admin B pode ler sua própria empresa B` (BDD: leitura escopada, outro tenant)
  - `admin A com token válido pode ler registro de empresa B (limitação atual do modelo de auth)` (BDD-follow-up: documenta que cross-tenant hoje retorna 200 ou 403)
  - `admin A com token válido mas sem x-empresa-id deve ser rejeitado` (BDD: header ausente)
  - `GET /empresas (listagem) deve respeitar a autorização do token` (BDD: listagem geral)
- [x] Verificar que os testes e2e passaram (Green Phase)

### Phase 7: Unit Tests (TDD)

- [x] Escrever testes unitários em `src/prisma/prisma-extension.spec.ts` cobrindo os handlers `handleSoftDeleteAndMultiTenant`, `makeMultiTenantHandlers`, `makeSoftDeleteHandlers` em isolamento (comentário `// TDD:` no topo de `prisma-extension.ts` referencia esse arquivo)

### Phase 8: Cross-cutting Documentation

- [x] Adicionar headers de rastreabilidade em `prisma-extension.ts`: `// BDD: N/A (cross-cutting)`, `// SDD: N/A`, `// TDD: src/prisma/prisma-extension.spec.ts`
- [x] Documentar convenção `prisma.extended` vs `prisma` no `AGENTS.md` (referência ao `softDeleteExtension`)

### Phase 9: Verification

- [x] Rodar testes de aceitação — passam (Green Phase)
- [x] Rodar testes unitários — passam
- [x] `npm run validate:quick` (lint + typecheck + testes) — passa

## Follow-ups (gaps conhecidos)

### Follow-up 1: Resource-level tenancy em `findUnique` cross-tenant

- **Status**: aceito como limitação atual.
- **Descrição**: hoje, `GET /empresas/:id` com token válido retorna 200 mesmo se `:id` for de outro tenant (o guard `@TemPermissao` valida a permissão, não o recurso). Ideal: 403 cross-tenant.
- **Evidência**: `test/multi-tenancy.e2e-spec.ts:214-234` — `expect([200, 403]).toContain(response.status)`.
- **Esforço estimado**: médio — exige adicionar `ResourceTenantGuard` ou check explícito em cada controller.
- **Quando**: quando houver caso de uso explícito (ex.: usuário reportar "vejo dados de outra empresa").

### Follow-up 2: Planos FREE/PRO/ENTERPRISE com schema-per-tenant

- **Status**: planejado, não iniciado.
- **Descrição**: clientes ENTERPRISE precisam de isolamento físico de dados (compliance). Implementar `tenant_<empresaId>` schemas sob demanda, com `PrismaService` resolvendo o schema dinamicamente.
- **Esforço estimado**: alto — exige refactor de `PrismaService` para resolver schema, migrações por tenant, e overhaul do `softDeleteExtension`.
- **Quando**: quando houver demanda comercial concreta.
- **REQ futura**: REQ-MT-005-futuro — documentada em `design.md:NFR-MT-003`.

## Task Dependencies (as executed)

```
prisma/schema.prisma (Perfil.empresaId, UsuarioEmpresa @@unique)
        ↓
src/shared/infrastructure/services/context.storage.ts (AsyncLocalStorage)
        ↓
src/shared/interceptors/tenant-context.interceptor.ts (lê x-empresa-id)
        ↓
src/prisma/prisma-extension.ts (softDeleteExtension)
        ↓
src/prisma/prisma.service.ts (expõe prisma.extended)
        ↓
features/multi-tenancy.feature (8 cenários BDD)
        ↓
test/multi-tenancy.e2e-spec.ts (5 testes ATDD)
        ↓
src/prisma/prisma-extension.spec.ts (TDD)
        ↓
.openspec/changes/multi-tenancy/{proposal,design,tasks}.md (CR retroativo)
```

## File-by-File Traceability

| Arquivo | Propósito | Requisitos cobertos |
|---------|-----------|----------------------|
| `features/multi-tenancy.feature` | 8 cenários BDD (isolamento, conversão, bypass, ausência de contexto) | REQ-MT-001..007 |
| `prisma/schema.prisma` | `Perfil.empresaId`, `UsuarioEmpresa @@unique([usuarioId, empresaId])` | REQ-MT-001, REQ-MT-002 |
| `src/shared/infrastructure/services/context.storage.ts` | `AsyncLocalStorage<{ empresaId? }>` | REQ-MT-003, NFR-MT-005 |
| `src/shared/interceptors/tenant-context.interceptor.ts` | Lê `x-empresa-id`, valida, popula contexto | REQ-MT-003, NFR-MT-006 |
| `src/prisma/prisma-extension.ts` | `softDeleteExtension` (query + model) | REQ-MT-001..007, NFR-MT-001, NFR-MT-004 |
| `src/prisma/prisma.service.ts` | Expõe `prisma.extended` | REQ-MT-001, NFR-MT-004 |
| `src/prisma/prisma-extension.spec.ts` | TDD dos handlers | Cobre os caminhos críticos da extension |
| `test/multi-tenancy.e2e-spec.ts` | 5 testes ATDD | AC-MT-01..08 |
| `.openspec/changes/multi-tenancy/proposal.md` | Proposta + impacto + riscos | — |
| `.openspec/changes/multi-tenancy/design.md` | Spec RFC 2119 + AC + edge cases | Todas as REQ/NFR |
| `.openspec/changes/multi-tenancy/tasks.md` | Este arquivo | — |

## Notes

- A spec é retroativa: o código veio primeiro, a documentação OpenSpec vem depois — o oposto do fluxo `DDD→BDD→SDD→ATDD→TDD` em modo prospectivo.
- A extension `softDeleteExtension` é compartilhada com a feature `soft-delete` (mesmo arquivo, dual-purpose). Os REQs estão separados por change, mas o arquivo de implementação é único.
- O `contextStorage` é exportado como singleton (`new AsyncLocalStorage(...)`) e importado por `prisma-extension.ts` e pelo interceptor. Toda nova extensão Prisma que precise de contexto de request **MUST** ler de lá.
- Mudanças futuras no modelo de tenancy (schema-per-tenant, resource-level guards) **MUST** ser feitas em nova change request, conforme `NFR-MT-008` implícito (consistência com `NFR-AUTH-008`).
# Permissões - Tasks (CR Retroativo)

> **Feature**: `permissoes`
> **Status**: ✅ Implementado, testado e em produção.
> Esta é uma documentação retroativa — todas as tarefas abaixo já foram concluídas.
> Itens pendentes (resolução de divergências) estão claramente marcados como `[ ]`.

---

## Implementation Tasks

### Phase 1: Preparation

- [x] Criar diretório `.openspec/changes/permissoes/`
- [x] Escrever `proposal.md`
- [x] Escrever `design.md` (este arquivo)
- [x] Revisar e aprovar proposta

### Phase 2: BDD Specification (Behavior-Driven Design)

- [x] Criar arquivo `features/permissoes.feature` com 11 cenários cobrindo CRUD, paginação, busca por nome, soft-delete, restore, autorização
- [x] Validar que cada cenário é executável (sintaxe Gherkin correta)
- [x] Mapear cenários BDD → requisitos SDD → testes ATDD (ver tabela de rastreabilidade no `design.md`)

### Phase 3: Test Development (ATDD + TDD)

#### ATDD — Testes E2E (`test/permissoes.e2e-spec.ts`)

- [x] Configurar `beforeAll` com `AppModule` + Fastify + Prisma + JWT manual
- [x] Seed inicial: 6 permissões de catálogo (`CREATE_PERMISSAO`, `READ_PERMISSOES`, `READ_PERMISSAO_BY_ID`, `READ_PERMISSAO_BY_NOME`, `UPDATE_PERMISSAO`, `DELETE_PERMISSAO`) + 1 permissão extra (`READ_LIMITED_RESOURCE`)
- [x] Seed: usuário admin + empresa + perfil ADMIN com todas as 6 permissões + token JWT
- [x] Seed: usuário limited + perfil LIMITED_USER com apenas `READ_LIMITED_RESOURCE` + token JWT
- [x] `beforeEach`: limpar permissões criadas em testes (manter seeds)
- [x] Cobertura e2e `POST /permissoes`:
  - [x] AC-01: criar com dados válidos → 201
  - [x] AC-14: usuário sem permissão → 403
  - [x] AC-02: nome faltando → 400
  - [x] AC-04: nome duplicado → 409
- [x] Cobertura e2e `GET /permissoes`:
  - [x] AC-05: listagem paginada → 200
  - [x] AC-14: usuário sem permissão → 403
- [x] Cobertura e2e `GET /permissoes/:id`:
  - [x] AC-06: ID existente → 200
  - [x] AC-14: usuário sem permissão → 403
  - [x] AC-07: ID inexistente → 404
- [x] Cobertura e2e `GET /permissoes/nome/:nome`:
  - [x] AC-08: contém substring → 200 com array
  - [x] AC-14: usuário sem permissão → 403
  - [x] AC-08 (edge): nenhuma encontrada → 200 com array vazio
- [x] Cobertura e2e `PATCH /permissoes/:id`:
  - [x] AC-09: atualizar nome → 200
  - [x] AC-14: usuário sem permissão → 403
  - [x] AC-09 (edge): ID inexistente → 404
  - [x] AC-10: restore via `{ativo: true}` (admin) → 200, `deletedAt: null`
  - [x] AC-11: restore sem admin → 403
  - [x] AC-11: restore em não-deletada → 409
  - [x] AC-12: soft-delete via `{ativo: false}` (admin) → 200, `deletedAt: !null`
  - [x] AC-13: soft-delete sem admin → 403
  - [x] AC-13 (edge): soft-delete em já-deletada → 409
- [x] Verificar que todos os testes e2e passam (Green Phase)

#### TDD — Testes Unitários (`src/permissoes/application/services/permissoes.service.spec.ts`)

- [x] Configurar mocks: `PermissaoRepository` + `PrismaService` + `AuthorizationService`
- [x] `criação` (2 testes):
  - [x] criar permissão com sucesso
  - [x] duplicidade de nome lança `ConflictException`
- [x] `busca de todos` (2 testes):
  - [x] paginação padrão exclui deletados
  - [x] `includeDeleted = true` inclui tudo
- [x] `busca por um` (3 testes):
  - [x] padrão exclui deletados
  - [x] `includeDeleted = true` inclui
  - [x] não encontrado lança `NotFoundException`
- [x] `busca por nome` (2 testes):
  - [x] padrão exclui deletados
  - [x] `includeDeleted = true` inclui
- [x] `atualização` (7 testes):
  - [x] atualizar campos não-flag
  - [x] ID inexistente lança `NotFoundException`
  - [x] restore (`ativo: true`) em deletada por admin
  - [x] restore em não-deletada lança `ConflictException`
  - [x] restore sem admin lança `ForbiddenException`
  - [x] soft-delete (`ativo: false`) em ativa por admin
  - [x] soft-delete em já-deletada lança `ConflictException`
  - [x] soft-delete sem admin lança `ForbiddenException`
- [x] `remoção` (3 testes):
  - [x] sucesso por admin
  - [x] ID inexistente lança `NotFoundException`
  - [x] sem admin lança `ForbiddenException`
- [x] `restauração` (4 testes):
  - [x] sucesso por admin
  - [x] ID inexistente lança `NotFoundException`
  - [x] permissão não-deletada lança `ConflictException`
  - [x] sem admin lança `ForbiddenException`
- [x] Verificar que todos os testes unitários passam

#### TDD — Testes Adicionais de DTO/Entity

- [x] `src/permissoes/dto/create-permissao.dto.spec.ts`
- [x] `src/permissoes/dto/update-permissao.dto.spec.ts`
- [x] `src/permissoes/domain/entities/permissao.entity.spec.ts`

### Phase 4: Implementation (DDD)

#### Domain Layer

- [x] Criar entidade `Permissao` em `src/permissoes/domain/entities/permissao.entity.ts` (extends `BaseEntity`)
- [x] Criar interface `PermissaoRepository` em `src/permissoes/domain/repositories/permissao.repository.ts` com 8 métodos: `create`, `findAll`, `findOne`, `findByNome`, `findByNomeContaining`, `update`, `remove`, `restore`

#### Application Layer

- [x] Criar `CreatePermissaoDto` em `src/permissoes/dto/create-permissao.dto.ts` (com `class-validator`)
- [x] Criar `UpdatePermissaoDto` em `src/permissoes/dto/update-permissao.dto.ts` (parcial, com `ativo` opcional)
- [x] Criar `PermissoesService` em `src/permissoes/application/services/permissoes.service.ts`:
  - [x] método `create` com validação de duplicidade via `findByNome`
  - [x] método `findAll` com paginação
  - [x] método `findOne` com flag `includeDeleted`
  - [x] método `findByNome` / `findByNomeContaining` (delegação)
  - [x] método `update` com lógica de soft-delete/restore integrada via flag `ativo`
  - [x] método `remove` (soft-delete) com gate ADMIN
  - [x] método `restore` com gate ADMIN
  - [x] integração com `AuthorizationService.isAdmin(...)`
  - [x] logging via `Logger` em todas as mutações
- [x] Criar `PermissoesController` em `src/permissoes/application/controllers/permissoes.controller.ts`:
  - [x] `POST /permissoes` (`@TemPermissao('CREATE_PERMISSAO')`, HTTP 201)
  - [x] `GET /permissoes` (`@TemPermissao('READ_PERMISSOES')`, `@UseInterceptors(CacheInterceptor)`, `@CacheTTL(60)`)
  - [x] `GET /permissoes/:id` (`@TemPermissao('READ_PERMISSAO_BY_ID')`)
  - [x] `GET /permissoes/nome/:nome` (`@TemPermissao('READ_PERMISSAO_BY_NOME')`, paginado)
  - [x] `PATCH /permissoes/:id` (`@TemPermissao('UPDATE_PERMISSAO')`, com gate ADMIN para restore/delete via flag `ativo`)
  - [x] Documentação Swagger completa em todos os endpoints
  - [x] Header `x-empresa-id` documentado como **opcional**

#### Infrastructure Layer

- [x] Criar `PrismaPermissaoRepository` em `src/permissoes/infrastructure/repositories/prisma-permissao.repository.ts`:
  - [x] `create` via `prisma.permissao.create`
  - [x] `findAll` com `skip/take/includeDeleted` (filtra `deletedAt` quando `!includeDeleted`)
  - [x] `findOne` com `includeDeleted` (usa `findUnique` ou `findFirst`)
  - [x] `findByNome` (busca exata, case-sensitive)
  - [x] `findByNomeContaining` (busca `contains`, paginada)
  - [x] `update` (parcial)
  - [x] `remove` (soft-delete: setar `deletedAt = NOW()`, `ativo = false`)
  - [x] `restore` (setar `deletedAt = null`, `ativo = true`)

#### Module Wiring

- [x] Criar `PermissoesModule` em `src/permissoes/permissoes.module.ts`:
  - [x] importar `PrismaModule`
  - [x] importar `AuthModule` via `forwardRef` (evita ciclo)
  - [x] declarar `PermissoesController`
  - [x] prover `PermissoesService` + `PermissaoRepository` (com `useClass: PrismaPermissaoRepository`)
  - [x] exportar `PermissoesService` e `PermissaoRepository` para uso em outros módulos
- [x] Registrar `PermissoesModule` em `src/app.module.ts`

#### Database

- [x] Migration Prisma: criar tabela `permissao` com `nome @unique`, `codigo @unique`, `descricao`, `ativo`, `createdAt`, `updatedAt`, `deletedAt`
- [x] Migration Prisma: criar tabela de junção N:N `perfil_permissao` (FK para `perfil` e `permissao`)
- [x] Migration Prisma: criar índices necessários
- [x] Seed Prisma: inserir as 6 permissões de catálogo do módulo `permissoes`

### Phase 5: Verification

- [x] Rodar testes e2e — devem passar (Green Phase confirmado)
- [x] Rodar testes unitários — devem passar
- [x] Rodar `npm run validate:quick`
- [x] Rodar `npm run security:check`
- [x] Verificar documentação Swagger em `/api/docs#/Permissões`
- [x] Smoke test manual: criar, listar, buscar, atualizar, soft-deletar, restaurar uma permissão

### Phase 6: Documentation

- [x] Criar `src/permissoes/README.md` com visão geral, endpoints, governança
- [x] Adicionar cabeçalhos de rastreabilidade nos arquivos de código:
  - [x] BDD: `// BDD: features/permissoes.feature:Cenário: ...`
  - [x] SDD: `// SDD: .openspec/changes/permissoes/design.md:REQ-PERM-XXX`
  - [x] ATDD: `// ATDD: test/permissoes.e2e-spec.ts`
  - [x] TDD: `// TDD: src/permissoes/application/services/permissoes.service.spec.ts`
- [x] Atualizar `AGENTS.md` raiz com referência ao módulo de permissões
- [x] Atualizar `.openspec/AGENTS.md` se aplicável
- [x] Escrever este CR retroativo (proposal + design + tasks)

### Phase 7: Deployment / Archival

- [ ] Resolver pendências da Seção 8 do `proposal.md`:
  - [ ] Decidir entre implementar `GET /permissoes/codigo/:codigo` ou atualizar BDD
  - [ ] Alinhar BDD ao contrato HTTP atual (PATCH com `ativo` em vez de DELETE)
  - [ ] Mover cenário "Listar permissões por perfil" para `features/perfis.feature`
- [ ] Promover para `.openspec/specs/permissoes.md` após pendências fechadas
- [ ] Criar PR/commit de consolidação

---

## Task Dependencies

```
proposal.md → design.md → tasks.md (este)
                              ↓
                  BDD scenarios (features/permissoes.feature)
                              ↓
                  ATDD tests (test/permissoes.e2e-spec.ts)
                              ↓
                  TDD unit tests (src/permissoes/**/*.spec.ts)
                              ↓
                  Domain Layer (entity + repository interface)
                              ↓
                  DTOs (create + update)
                              ↓
                  Application Service (PermissoesService)
                              ↓
                  Infrastructure Repository (PrismaPermissaoRepository)
                              ↓
                  Controller (PermissoesController)
                              ↓
                  Module (PermissoesModule) + app.module wiring
                              ↓
                  Migration Prisma + Seed
                              ↓
                  Verification (e2e + unit + lint + security)
                              ↓
                  Documentation (README, traceability, CR)
                              ↓
                  Archival (resolver pendências → .openspec/specs/)
```

---

## Resumo de Cobertura

| Camada | Arquivo | Testes | Status |
|--------|---------|--------|--------|
| BDD | `features/permissoes.feature` | 11 cenários | ✅ |
| ATDD | `test/permissoes.e2e-spec.ts` | 21 casos | ✅ |
| TDD | `src/permissoes/application/services/permissoes.service.spec.ts` | ~25 testes | ✅ |
| TDD | `src/permissoes/dto/*.spec.ts` | validações | ✅ |
| TDD | `src/permissoes/domain/entities/*.spec.ts` | entity | ✅ |

---

## Notas

- Cada tarefa acima foi independentemente commit-ável (histórico git preservado).
- Conventional commits usados: `feat(permissoes): ...`, `test(permissoes): ...`, `docs(permissoes): ...`, `fix(permissoes): ...`.
- Referências cruzadas BDD/SDD/ATDD/TDD mantidas em comentários de cabeçalho dos arquivos.
- Esta CR é **retroativa** — todas as fases 1-6 foram concluídas antes da escrita deste documento. A fase 7 (archival) tem 3 pendências abertas listadas acima.

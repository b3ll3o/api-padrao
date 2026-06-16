# Empresas - Tasks

> Documentação retroativa. Todas as tasks estão concluídas (`[x]`).
> Workflow seguido: DDD → BDD → SDD → ATDD → TDD → Build.

## Implementation Tasks

### Phase 1: Preparation (DDD + SDD)

- [x] Criar `.openspec/changes/empresas/` (proposal, design, tasks).
- [x] Escrever `proposal.md` (Why, What Changes, Impact, Risks).
- [x] Escrever `design.md` com FR/NFR em RFC 2119 (REQ-EMP-001 a REQ-EMP-010,
      NFR-EMP-001 a NFR-EMP-008), API Spec, Data Models, Edge Cases.
- [x] Definir IDs de requisito (`REQ-EMP-NNN`) e mapeá-los para BDD + ATDD + TDD.

### Phase 2: Behavior-Driven Development (BDD)

- [x] Criar `features/empresas.feature` (12 cenários cobrindo CRUD,
      soft-delete, vínculo, listagem de usuários, casos de borda e validação).

### Phase 3: Test Development (ATDD + TDD - Red Phase → Green Phase)

- [x] Criar `test/empresas.e2e-spec.ts` com describes por endpoint e
      sub-describes para `Segurança e Autorização` e `Casos de Borda`.
- [x] Configurar `beforeEach` com seed de 7 permissões
      (`CREATE_EMPRESA`, `READ_EMPRESAS`, `READ_EMPRESA_BY_ID`,
      `UPDATE_EMPRESA`, `DELETE_EMPRESA`, `ADD_USER_TO_EMPRESA`,
      `READ_EMPRESA_USUARIOS`), criação de empresa admin, perfil admin
      vinculado e JWT com claim `empresas[]`.
- [x] Implementar testes de **autorização**: 401 sem token, 403 sem
      permissão em POST/GET.
- [x] Implementar testes de **erro**: 404 em PATCH/DELETE/POST com id
      inexistente; 404 em soft-deleted.
- [x] Implementar testes de **CRUD feliz**: POST 201 com payload válido,
      GET paginado, GET by id, PATCH, DELETE (soft-delete verificado no DB).
- [x] Implementar testes de **vínculo**: `POST /:id/usuarios` (sucesso,
      idempotência, 404 user inexistente, 404 perfil inexistente, 403 sem
      permissão) e `GET /:id/usuarios`.
- [x] Criar `src/empresas/application/services/empresas.service.spec.ts`
      com describes `create`, `findAll`, `findOne`, `update`, `remove`,
      `addUser`, `findUsersByCompany` — cobrindo caminhos felizes e
      `NotFoundException`.
- [x] Criar specs dos DTOs (`create-empresa.dto.spec.ts`,
      `update-empresa.dto.spec.ts`, `add-usuario-empresa.dto.spec.ts`).
- [x] Criar spec da entidade de domínio
      `src/empresas/domain/entities/empresa.entity.spec.ts`.
- [x] Criar spec do `prisma-empresa.repository.spec.ts`
      (mock do `PrismaService`).

### Phase 4: Implementation (Build Mode)

#### Domain Layer

- [x] Criar `src/empresas/domain/entities/empresa.entity.ts` (POJO:
      id, nome, descricao, ativo, responsavelId, createdAt, updatedAt, deletedAt).
- [x] Criar `src/empresas/domain/repositories/empresa.repository.ts`
      (abstract class) com 7 métodos: `create`, `findAll`, `findOne`,
      `update`, `remove`, `addUserToCompany`, `findUsersByCompany`,
      `findCompaniesByUser`.

#### Application Layer

- [x] Criar DTOs em `src/empresas/dto/`:
  - [x] `create-empresa.dto.ts` (validators `@IsNotEmpty`/`@IsString`/`@IsInt`)
  - [x] `update-empresa.dto.ts` (`PartialType(CreateEmpresaDto)`)
  - [x] `add-usuario-empresa.dto.ts` (`@IsArray`, `@IsInt each`,
        `@IsNotEmpty` em `perfilIds`)
- [x] Criar `src/empresas/application/services/empresas.service.ts`
      com injeção de `EmpresaRepository`, `UsuarioRepository`,
      `PerfilRepository` e métodos que validam existência antes de
      mutar.
- [x] Criar `src/empresas/application/controllers/empresas.controller.ts`
      com 7 endpoints, decorators `@ApiTags('Empresas')`,
      `@ApiBearerAuth('JWT-auth')`, `@TemPermissao(...)`, `@Auditar(...)`
      e `@Throttle({ sensitive: ... })` em mutações.
- [x] Criar `src/empresas/empresas.module.ts` registrando controller,
      service, repositories e entidades Prisma.

#### Infrastructure Layer

- [x] Criar `src/empresas/infrastructure/repositories/prisma-empresa.repository.ts`
      implementando o `EmpresaRepository` via `PrismaService`.
- [x] Garantir filtros `ativo: true` e `deletedAt: null` em `findAll`,
      `findOne`, `findUsersByCompany` e `findCompaniesByUser`.
- [x] Implementar `addUserToCompany` como **upsert idempotente** na
      tabela `UsuarioEmpresa` (substitui `perfilIds` se já existir).

#### Prisma / Database

- [x] Adicionar `model Empresa` em `prisma/schema.prisma`
      (`id String @id @default(uuid())`, `ativo Boolean @default(true)`,
      `responsavelId Int`, FKs e `deletedAt DateTime?`).
- [x] Adicionar `model UsuarioEmpresa` (tabela associativa com
      `@@id([empresaId, usuarioId])`, N:M para `Perfil`).
- [x] Adicionar `model Perfil` com `empresaId` (FK) e back-relation.
- [x] Criar migration Prisma criando tabelas `empresa`, `usuario_empresa`
      e `perfil_on_usuario_empresa` com índices apropriados.
- [x] Atualizar `seed`/migration de permissões para incluir os 7 códigos
      do módulo.

#### Audit & Cross-cutting

- [x] Aplicar `@Auditar({ acao: 'CRIAR' | 'ATUALIZAR' | 'REMOVER',
      recurso: 'EMPRESA' })` no controller.
- [x] Aplicar `@Throttle({ sensitive: { limit: 10, ttl: 60_000 } })` em
      POST, PATCH, DELETE.
- [x] Garantir `ValidationPipe` global com `whitelist: true` (em
      `src/main.ts` e `test/empresas.e2e-spec.ts`).

### Phase 5: Documentation

- [x] Criar `src/empresas/README.md` com endpoints, regras de negócio
      e referências cruzadas (`AGENTS.md`, `usuarios/README.md`,
      `perfis/README.md`).
- [x] Atualizar `AGENTS.md` raiz com o módulo `empresas` no catálogo
      de módulos e no modelo multi-tenant.
- [x] Criar `proposal.md`, `design.md` e `tasks.md` (este arquivo)
      sob `.openspec/changes/empresas/`.

### Phase 6: Verification

- [x] Rodar suite ATDD (`npm run test:e2e -- empresas`) — **passing**.
- [x] Rodar suite TDD (`npm run test -- empresas`) — **passing**.
- [x] Rodar `npm run validate:quick` — **passing**.
- [x] Rodar `npm run security:check` — **passing**.
- [x] Verificar manualmente: criar empresa, listar, atualizar, soft-deletar,
      vincular usuário, listar usuários — fluxo end-to-end OK.

### Phase 7: Deployment / Archival

- [x] Merge do branch de feature para `main`.
- [x] CI/CD verde no pipeline (lint + typecheck + testes).
- [x] Documentação retroativa depositada em `.openspec/changes/empresas/`
      (esta CR é a prova de que a feature foi especificada e validada).

## Task Dependencies

```
proposal.md → design.md → tasks.md
   ↓
BDD (features/empresas.feature)
   ↓
ATDD (test/empresas.e2e-spec.ts) ── Red → Green
   ↓
TDD (src/empresas/**/*.spec.ts) ── Red → Green
   ↓
Domain (entity, repository abstract)
   ↓
Application (DTO, service, controller)
   ↓
Infrastructure (Prisma repository)
   ↓
Prisma schema + migration
   ↓
Módulo NestJS (empresas.module.ts)
   ↓
Verification (lint, test, security)
   ↓
Documentação retroativa (esta CR)
```

## Requirements ↔ Tests Traceability

| REQ ID    | BDD (`features/empresas.feature`)                  | ATDD (`test/empresas.e2e-spec.ts`)                          | TDD (`src/empresas/application/services/empresas.service.spec.ts`) |
| --------- | -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| REQ-EMP-001 | Cenário: Criar empresa (válido / sem nome / sem resp.) | `POST /empresas` (criar 201, 400 sem nome)                  | `create`                                                          |
| REQ-EMP-002 | Cenário: Listar empresas com paginação             | `GET /empresas`                                              | `findAll`                                                         |
| REQ-EMP-003 | Cenário: Buscar empresa (existente / inexistente)  | `GET /empresas/:id` (200 / 404)                              | `findOne`                                                         |
| REQ-EMP-004 | Cenário: Atualizar empresa (existente / inexistente) | `PATCH /empresas/:id` (200 / 404)                            | `update`                                                          |
| REQ-EMP-005 | Cenário: Remover empresa (soft-delete)             | `DELETE /empresas/:id` + soft-deleted não aparece            | `remove`                                                          |
| REQ-EMP-006 | Cenário: Adicionar usuário (sucesso / user inexistente) | `POST /empresas/:id/usuarios` (201, 404 user, 404 perfil, idempotência) | `addUser`                                            |
| REQ-EMP-007 | Cenário: Listar usuários de uma empresa            | `POST /:id/usuarios > listar`                                | `findUsersByCompany`                                              |
| REQ-EMP-008 | Cenário: Adicionar usuário inexistente             | `POST /:id/usuarios` (404 user, 404 perfil)                  | `addUser` (404 user, 404 perfil)                                  |
| REQ-EMP-009 | (audit-meta)                                       | Implícito em todos os mutantes                                | `create`/`update`/`remove`                                        |
| REQ-EMP-010 | (rate-limit meta)                                  | Implícito em suite de throttler                               | n/a                                                               |

## Notes

- Cada task é commitável de forma independente (commits `feat:` / `fix:` /
  `test:` / `docs:` / `chore:`).
- Traceabilidade garantida por:
  - Comentário `// BDD: features/empresas.feature:Cenário: ...` nos testes ATDD.
  - Comentário `// TDD: src/.../empresas.service.spec.ts:create` (etc.) nos specs.
  - Comentário `// SDD: .openspec/changes/empresas/design.md:REQ-EMP-NNN` (a ser
    aplicado em um próximo pass de refactor para marcar fonte de verdade).
- Cobertura de testes do módulo `empresas`: **~19 e2e + ~14 unit** (mais
  specs de DTO e entidade).

# Feature: Perfis (perfis) — Tasks

> **Status retroativo**: a feature `perfis` está implementada. As tasks abaixo estão todas marcadas como concluídas (`[x]`) porque refletem o que **já foi entregue** no repositório (`src/perfis/`, `test/perfis.e2e-spec.ts`, `features/perfis.feature`).

## Implementation Tasks

### Phase 1: Preparation

- [x] Criar diretório `.openspec/changes/perfis/`
- [x] Escrever `proposal.md` (registra decisão e impacto)
- [x] Escrever `design.md` (REQ-PERFIL-001..013, NFR-PERFIL-001..008, AC-01..15)
- [x] Revisar e aprovar proposta retroativamente

### Phase 2: Domain Modeling

- [x] Definir entidade `Perfil` (extends `BaseEntity`) — `src/perfis/domain/entities/perfil.entity.ts`
- [x] Definir contrato abstrato `PerfilRepository` — `src/perfis/domain/repositories/perfil.repository.ts`
- [x] Definir DTOs validados com `class-validator`:
  - [x] `CreatePerfilDto` — `nome`, `codigo`, `descricao`, `empresaId` (obrigatórios) + `permissoesIds?` — `src/perfis/dto/create-perfil.dto.ts`
  - [x] `UpdatePerfilDto extends PartialType(CreatePerfilDto)` + `ativo?: boolean` — `src/perfis/dto/update-perfil.dto.ts`

### Phase 3: Test Development (BDD + ATDD + TDD)

- [x] Escrever 11 cenários BDD em `features/perfis.feature`:
  - [x] Criar perfil com dados válidos
  - [x] Criar perfil sem código
  - [x] Criar perfil sem empresa
  - [x] Criar perfil com código duplicado na mesma empresa
  - [x] Listar perfis por empresa
  - [x] Buscar perfil por ID
  - [x] Atualizar perfil
  - [x] Associar permissões a um perfil
  - [x] Remover permissão de um perfil
  - [x] Criar perfil sem permissões
  - [x] Buscar perfil por código na empresa
- [x] Escrever testes de aceitação (ATDD) em `test/perfis.e2e-spec.ts`:
  - [x] Setup do contexto (admin user + empresa + permissões + perfil ADMIN + token)
  - [x] `POST /perfis` deve criar perfil (201)
  - [x] `POST /perfis` deve retornar 409 ao duplicar `nome`/`empresaId`
  - [x] `GET /perfis` deve retornar lista paginada (200)
  - [x] `GET /perfis/:id` deve retornar perfil único (200)
  - [x] `PATCH /perfis/:id` deve atualizar nome (200)
  - [x] `PATCH /perfis/:id` com `{ ativo: true }` deve restaurar soft-deletado (200)
- [x] Escrever testes unitários (TDD) em `src/perfis/application/services/perfis.service.spec.ts`:
  - [x] Service deve ser definido
  - [x] `create()` — sucesso com permissões
  - [x] `create()` — sucesso sem permissões
  - [x] `create()` — `ConflictException` ao duplicar `nome`
  - [x] `create()` — `NotFoundException` se `permissaoId` inválido
  - [x] `update()` — restore via `ativo: true` quando deletado
  - [x] `update()` — `ConflictException` ao restaurar já-ativo
  - [x] `update()` — `ForbiddenException` ao restaurar sem `ADMIN`
  - [x] `update()` — soft delete via `ativo: false` quando ativo
  - [x] `update()` — `ConflictException` ao soft-deletar já-deletado
  - [x] `update()` — `ForbiddenException` ao soft-deletar sem `ADMIN`
  - [x] `findAll()` — paginação default exclui deletados
  - [x] `findAll()` — `includeDeleted: true` inclui deletados
  - [x] `findAll()` — filtra por `empresaId`
  - [x] `findOne()` — retorna perfil (default exclui deletados)
  - [x] `findOne()` — `includeDeleted: true` inclui deletados
  - [x] `findOne()` — `NotFoundException` quando não encontrado
  - [x] `findByNomeContaining()` — paginação default exclui deletados
  - [x] `findByNomeContaining()` — `includeDeleted: true` inclui deletados
  - [x] `update()` — sucesso com permissões válidas
  - [x] `update()` — sucesso sem permissões
  - [x] `update()` — `NotFoundException` quando id não existe
  - [x] `update()` — `NotFoundException` se `permissaoId` inválido

### Phase 4: Implementation

- [x] Criar entidade de domínio `Perfil` — `src/perfis/domain/entities/perfil.entity.ts`
- [x] Criar interface de repositório `PerfilRepository` — `src/perfis/domain/repositories/perfil.repository.ts`
- [x] Criar DTOs — `src/perfis/dto/create-perfil.dto.ts`, `src/perfis/dto/update-perfil.dto.ts`
- [x] Implementar repositório Prisma `PrismaPerfilRepository` — `src/perfis/infrastructure/repositories/prisma-perfil.repository.ts`:
  - [x] `create()` — usa `prisma.extended.perfil.create` com `permissoes: { connect }`
  - [x] `findAll()` — paginado, com `where.empresaId` e `include: { permissoes: true }`
  - [x] `findOne()` — por id, com escopo `empresaId`
  - [x] `findByNome()` — exato, com escopo `empresaId`
  - [x] `findByNomeContaining()` — `contains` case-insensitive, paginado
  - [x] `update()` — usa `set` para substituir `permissoes`; permite atualizar soft-deletados
  - [x] `remove()` — soft delete via `prisma.extended.perfil.delete`
  - [x] `restore()` — seta `deletedAt = null`, `ativo = true`, com `where.empresaId`
  - [x] Mappers `toDomain()` e `toPermissaoDomain()`
- [x] Implementar serviço de aplicação `PerfisService` — `src/perfis/application/services/perfis.service.ts`:
  - [x] `create()` — valida `permissoesIds`, rejeita duplicata de `nome` por empresa
  - [x] `findAll()` — paginado, com `empresaId` e `includeDeleted`
  - [x] `findOne()` — 404 se não encontrado
  - [x] `findByNomeContaining()` — paginado, com `empresaId`
  - [x] `update()` — valida `permissoesIds`; trata `ativo` (restore/soft delete) com checagem de `ADMIN`; valida estado (idempotência rejeitada com 409)
- [x] Implementar controller `PerfisController` — `src/perfis/application/controllers/perfis.controller.ts`:
  - [x] `POST /perfis` — `@TemPermissao('CREATE_PERFIL')` → 201
  - [x] `GET /perfis` — `@TemPermissao('READ_PERFIS')` com `PaginationDto` + `@EmpresaId()`
  - [x] `GET /perfis/:id` — `@TemPermissao('READ_PERFIL_BY_ID')` + `@EmpresaId()`
  - [x] `GET /perfis/nome/:nome` — `@TemPermissao('READ_PERFIL_BY_NOME')` com `PaginationDto` + `@EmpresaId()`
  - [x] `PATCH /perfis/:id` — `@TemPermissao('UPDATE_PERFIL')` + `@UsuarioLogado()` + `@EmpresaId()`
  - [x] `@ApiTags('Perfis')`, `@ApiBearerAuth('JWT-auth')`, `@ApiHeader({ name: 'x-empresa-id' })`
- [x] Criar `PerfisModule` — `src/perfis/perfis.module.ts`:
  - [x] Importa `PrismaModule` e `forwardRef(() => PermissoesModule)`
  - [x] Declara `PerfisController`
  - [x] Providers: `PerfisService` + binding `PerfilRepository → PrismaPerfilRepository`
  - [x] Exports: `PerfisService`, `PerfilRepository`
- [x] Criar migration Prisma (tabela `perfis` + `perfil_permissao`) — `prisma/migrations/...`

### Phase 5: Verification

- [x] Rodar testes de aceitação — devem passar (Green Phase)
- [x] Rodar testes unitários — devem passar
- [x] Rodar `npm run validate:quick`
- [x] Rodar `npm run security:check`
- [x] Adicionar comentários de rastreabilidade (`// BDD:`, `// SDD:`, `// ATDD:`, `// TDD:`) nos pontos críticos

### Phase 6: Deployment

- [x] Atualizar documentação:
  - [x] `src/perfis/README.md` — endpoints, escopo por empresa
  - [x] `features/perfis.feature` — 11 cenários BDD
  - [x] `AGENTS.md` (raiz) — referência ao módulo `perfis`
  - [x] Swagger gerado automaticamente via decorators `@ApiOperation`/`@ApiResponse`
- [x] Manter artefato em `.openspec/changes/perfis/` (ainda em work-in-progress; ver observação abaixo)
- [x] Commit + PR (histórico preservado no repositório)

## Task Dependencies

```
proposal.md → design.md → tasks.md → BDD (features/perfis.feature)
                                       → ATDD (test/perfis.e2e-spec.ts)
                                       → TDD (src/perfis/**/*.spec.ts)
                                       → domain entity + DTOs
                                       → repository interface
                                       → PrismaPerfilRepository
                                       → PerfisService
                                       → PerfisController
                                       → PerfisModule
                                       → migration Prisma
                                       → verify (unit + e2e + lint)
                                       → docs
```

## Traceability Matrix (BWD → FWD)

| BDD Scenario (features/perfis.feature) | REQ (design.md) | AC | ATDD (test/perfis.e2e-spec.ts) | TDD (perfis.service.spec.ts) |
|----------------------------------------|-----------------|----|---------------------------------|------------------------------|
| Criar perfil com dados válidos | REQ-PERFIL-001, -004 | AC-01 | `deve criar um novo perfil com sucesso` | `deve criar um perfil` |
| Criar perfil sem código | REQ-PERFIL-003 | AC-02 | (validado por class-validator) | (cobertura implícita no DTO) |
| Criar perfil sem empresa | REQ-PERFIL-003 | AC-03 | (validado por class-validator) | (cobertura implícita no DTO) |
| Criar perfil com código duplicado | REQ-PERFIL-002 | AC-04 | `deve retornar 409 se o perfil com o mesmo nome já existir` | `deve lançar ConflictException se um perfil com o mesmo nome já existir` |
| Listar perfis por empresa | REQ-PERFIL-006, NFR-PERFIL-002, -007 | AC-06 | `deve retornar uma lista paginada de perfis` | `deve retornar uma lista paginada de perfis não excluídos por padrão`; `... filtrada por empresa` |
| Buscar perfil por ID | REQ-PERFIL-007 | AC-07 | `deve retornar um único perfil` | `deve retornar um único perfil (não excluído) por padrão`; `deve lançar NotFoundException` |
| Atualizar perfil | REQ-PERFIL-009 | AC-09 | `deve atualizar um perfil` | `deve atualizar um perfil` |
| Associar permissões a um perfil | REQ-PERFIL-005 (validação na criação) | (cenário roadmap) | (não coberto no e2e atual) | `deve lançar NotFoundException se as permissões não existirem` |
| Remover permissão de um perfil | REQ-PERFIL-009 | (cenário roadmap) | (não coberto no e2e atual) | (idempotente com update) |
| Criar perfil sem permissões | REQ-PERFIL-004 | AC-01 (variação) | (não coberto diretamente) | `deve criar um perfil sem permissões` |
| Buscar perfil por código na empresa | REQ-PERFIL-008 | AC-08 | (cobertura por `GET /perfis/nome/:nome`) | `deve retornar uma lista paginada de perfis não excluídos contendo o nome por padrão` |
| (cenário BDD implícito) | REQ-PERFIL-010 | AC-10, AC-11 | `deve restaurar um perfil deletado` | `deve restaurar um perfil com soft delete via flag ativo`; `deve realizar soft delete de um perfil via flag ativo` |
| (cenário BDD implícito) | REQ-PERFIL-011 | AC-12 | (cobertura indireta via JWT) | `deve lançar ForbiddenException se não for admin ...` |
| (cenário BDD implícito) | REQ-PERFIL-012 | AC-13, AC-14 | (cobertura indireta) | `deve lançar ConflictException se tentar restaurar/deletar ...` |
| (cenário BDD implícito) | REQ-PERFIL-013 | AC-15 | (cobertura indireta) | `deve lançar NotFoundException se o perfil a ser atualizado não for encontrado` |

## Notes

- Cada task acima é independentemente commitável; conventional commits: `feat(perfis): ...`, `test(perfis): ...`, `docs(perfis): ...`, `chore(perfis): ...`.
- **Observação sobre arquivamento**: o repositório mantém `changes/perfis/` (work-in-progress). A promoção para `.openspec/specs/perfis.md` (arquivo imutável) deve ser feita quando a feature for marcada como **estável** em `AGENTS.md` e o time decidir congelar o escopo. Até lá, `proposal.md` + `design.md` + `tasks.md` continuam sendo a fonte canônica.
- O **CR retroativo** foi produzido em 2026-06-15 e se baseia no estado atual de `main`.
- Cenários BDD marcados como "cenário de roadmap" (associar/remover permissão) referem-se a endpoints futuros (não presentes no `PerfisController` atual) — a gestão de permissões em um perfil hoje é feita no momento de `create`/`update` via `permissoesIds`. Quando esses endpoints forem adicionados, este CR deve ser atualizado.

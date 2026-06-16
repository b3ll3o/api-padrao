# Feature: Usuários (`usuarios`) - Tasks

> **Status**: Retroativo — todas as tasks concluídas
> **Workflow**: DDD → BDD → SDD → ATDD → TDD
> **Data de fechamento (retroativo)**: 2026-06-15

## Implementation Tasks

### Phase 1: Preparation

- [x] **T1.1** — Criar `.openspec/changes/usuarios/` directory
  - Arquivo: `.openspec/changes/usuarios/`
- [x] **T1.2** — Escrever `proposal.md` com Why, What Changes, Impact, Risks
  - Arquivo: `.openspec/changes/usuarios/proposal.md`
  - Rastreabilidade: `// SDD: .openspec/changes/usuarios/design.md:REQ-USER-001` (overview)
- [x] **T1.3** — Escrever `design.md` com requisitos RFC 2119
  - Arquivo: `.openspec/changes/usuarios/design.md`
  - Cobre: Overview, Requirements (FR + NFR), Acceptance Criteria, API Spec, Data Models, Edge Cases, Status
- [x] **T1.4** — Escrever `tasks.md` (este arquivo)
  - Arquivo: `.openspec/changes/usuarios/tasks.md`
- [x] **T1.5** — Revisar e aprovar CR (retroativo: feature já em produção)

---

### Phase 2: BDD Scenarios (DDD → BDD)

- [x] **T2.1** — Criar `features/usuarios.feature` com 13 cenários Gherkin em português
  - Arquivo: `features/usuarios.feature`
  - Cenários: 13 (cobrindo criação, listagem, busca, atualização, soft delete, restore, autorização)
  - Rastreabilidade: cada cenário referencia implicitamente os ACs em `design.md`

| #   | Cenário BDD                                              | AC        |
| --- | -------------------------------------------------------- | --------- |
| 1   | Criar usuário com dados válidos                          | AC-USER-01 |
| 2   | Criar usuário com e-mail já existente                    | AC-USER-02 |
| 3   | Criar usuário com e-mail inválido                        | AC-USER-03 |
| 4   | Criar usuário com senha fraca - sem maiúscula            | AC-USER-04 |
| 5   | Criar usuário com senha curta                            | AC-USER-05 |
| 6   | Listar usuários com paginação                            | AC-USER-06 |
| 7   | Buscar usuário por ID existente                          | AC-USER-07 |
| 8   | Buscar usuário por ID inexistente                        | AC-USER-08 |
| 9   | Atualizar e-mail de usuário                              | AC-USER-09 |
| 10  | Atualizar senha de usuário                               | AC-USER-10 |
| 11  | Desativar usuário (soft-delete)                          | AC-USER-11 |
| 12  | Reativar usuário                                         | AC-USER-12 |
| 13  | Usuário não-admin não pode listar usuários               | AC-USER-13 |

---

### Phase 3: Domain (DDD)

- [x] **T3.1** — Criar entidade de domínio `Usuario` estendendo `BaseEntity`
  - Arquivo: `src/usuarios/domain/entities/usuario.entity.ts`
  - Campos: `email`, `senha` (`@Exclude()`), `empresas` (`UsuarioEmpresa[]`)
  - // BDD: features/usuarios.feature:Cenário: Criar usuário com dados válidos
  - // SDD: .openspec/changes/usuarios/design.md:REQ-USER-001
- [x] **T3.2** — Criar entidade de domínio `UsuarioEmpresa` (associativa N:N com perfis)
  - Arquivo: `src/usuarios/domain/entities/usuario-empresa.entity.ts`
  - // SDD: .openspec/changes/usuarios/design.md:REQ-USER-050
- [x] **T3.3** — Criar interface do repositório `UsuarioRepository` (port)
  - Arquivo: `src/usuarios/domain/repositories/usuario.repository.ts`
  - Métodos: `create`, `findAll`, `findOne`, `findByEmail`, `update`, `remove` (soft), `restore`
  - // SDD: .openspec/changes/usuarios/design.md:REQ-USER-001 a REQ-USER-040

---

### Phase 4: Application Layer

- [x] **T4.1** — Criar DTOs de entrada
  - Arquivo: `src/usuarios/dto/create-usuario.dto.ts`
    - `email`: `@IsEmail`, `@IsNotEmpty`
    - `senha`: `@IsString`, `@MinLength(8)`, regex com maiúscula/minúscula/número/símbolo
    - // SDD: REQ-USER-002, REQ-USER-003, REQ-USER-004, REQ-USER-005
  - Arquivo: `src/usuarios/dto/update-usuario.dto.ts`
    - `PartialType(CreateUsuarioDto)` + campo opcional `ativo: boolean`
    - // SDD: REQ-USER-030, REQ-USER-035, REQ-USER-036
- [x] **T4.2** — Criar serviço de aplicação `UsuariosService`
  - Arquivo: `src/usuarios/application/services/usuarios.service.ts`
  - Métodos: `create`, `findAll`, `findOne`, `update`
  - Aplica regras: validação de email único, hash de senha, autorização via `IUsuarioAuthorizationService`, soft delete/restore
  - // BDD: features/usuarios.feature (todos os 13 cenários)
  - // SDD: REQ-USER-001 a REQ-USER-052
  - // TDD: src/usuarios/application/services/usuarios.service.spec.ts
- [x] **T4.3** — Criar serviço de autorização `UsuarioAuthorizationService` (interface + impl)
  - Arquivo: `src/usuarios/application/services/usuario-authorization.service.ts` (impl)
  - Métodos: `canAccessUsuario`, `canUpdateUsuario`, `canDeleteUsuario`, `canRestoreUsuario`
  - // SDD: REQ-USER-022, REQ-USER-023, REQ-USER-024, REQ-USER-033, REQ-USER-034, REQ-USER-035, REQ-USER-036
- [x] **T4.4** — Criar controller `UsuariosController`
  - Arquivo: `src/usuarios/application/controllers/usuarios.controller.ts`
  - Endpoints: `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `GET /:id/empresas`
  - Decorators aplicados: `@Public()` (POST), `@TemPermissao(...)` (todos os demais), `@Auditar(...)` (POST + PATCH), `@Throttle(...)` (PATCH), `@ApiOperation/@ApiResponse` (Swagger)
  - // BDD: features/usuarios.feature (todos os 13 cenários)
  - // SDD: REQ-USER-001 a REQ-USER-052
  - // ATDD: test/usuarios.e2e-spec.ts

---

### Phase 5: Infrastructure Layer

- [x] **T5.1** — Implementar `PrismaUsuarioRepository` (adapter)
  - Arquivo: `src/usuarios/infrastructure/repositories/prisma-usuario.repository.ts`
  - Implementa `UsuarioRepository` usando `PrismaService`
  - Herda filtros de soft delete de `BaseRepository`
  - // SDD: REQ-USER-001, REQ-USER-014, REQ-USER-025, REQ-USER-035, REQ-USER-036
- [x] **T5.2** — Registrar módulo `UsuariosModule` no NestJS
  - Arquivo: `src/usuarios/usuarios.module.ts`
  - Providers: `UsuariosService`, `PrismaUsuarioRepository`, `UsuarioAuthorizationService`
  - Controllers: `UsuariosController`
  - Imports: `PrismaModule`, `AuthModule` (para `JwtStrategy`, decorators)

---

### Phase 6: Tests (TDD / ATDD)

- [x] **T6.1** — Escrever testes unitários do service (TDD)
  - Arquivo: `src/usuarios/application/services/usuarios.service.spec.ts`
  - Cobertura: `create`, `findAll` (admin / não-admin), `findOne`, `update` (com soft delete)
  - Mocks: `UsuarioRepository`, `PasswordHasher`, `IUsuarioAuthorizationService`, `EmpresaRepository`
  - // TDD: src/usuarios/application/services/usuarios.service.spec.ts
  - // SDD: REQ-USER-001, REQ-USER-010, REQ-USER-020, REQ-USER-030
- [x] **T6.2** — Escrever testes unitários dos DTOs (TDD)
  - Arquivos:
    - `src/usuarios/dto/create-usuario.dto.spec.ts`
    - `src/usuarios/dto/update-usuario.dto.spec.ts`
  - // SDD: REQ-USER-002 a REQ-USER-005, REQ-USER-030
- [x] **T6.3** — Escrever testes unitários da entidade (TDD)
  - Arquivo: `src/usuarios/domain/entities/usuario.entity.spec.ts`
  - // SDD: REQ-USER-001, NFR-USER-002
- [x] **T6.4** — Escrever testes e2e (ATDD)
  - Arquivo: `test/usuarios.e2e-spec.ts`
  - Suítes:
    - `POST /usuarios` (7 testes: 201, 409, 400 email inválido, 400 senha curta, 400 senha fraca, 400 email faltando, 400 senha faltando)
    - `GET /usuarios/:id` (6 testes: self, 403 cross-user, 401 sem token, 404 inexistente, 200 admin, 404 soft-deletado)
    - `PATCH /usuarios/:id` (8 testes: self, admin, 403 cross-user, 404 inexistente, restore 200, 403 restore não-admin, 409 restore não-deletado, soft delete 200, 403 delete não-admin, 409 delete já-deletado)
    - `GET /usuarios/:id/empresas` (1 teste: 200 paginado)
  - // BDD: features/usuarios.feature (todos os 13 cenários)
  - // ATDD: test/usuarios.e2e-spec.ts
  - // SDD: REQ-USER-001 a REQ-USER-052

---

### Phase 7: Validation & Quality Gates

- [x] **T7.1** — Verificar que testes unitários passam (Green Phase)
  - Comando: `npm test -- --testPathPattern=usuarios`
- [x] **T7.2** — Verificar que testes e2e passam (Green Phase)
  - Comando: `npm run test:e2e -- --testPathPattern=usuarios`
- [x] **T7.3** — Verificar cobertura mínima
  - Comando: `npm run test:cov`
- [x] **T7.4** — Verificar lint e formatação
  - Comando: `npm run lint`
- [x] **T7.5** — Verificar checagem de segurança
  - Comando: `npm run security:check`
- [x] **T7.6** — Validar Swagger
  - Comando: `npm run validate:quick`

---

### Phase 8: Documentation

- [x] **T8.1** — Criar README do módulo
  - Arquivo: `src/usuarios/README.md`
  - Conteúdo: funcionalidades, endpoints, segurança, links para docs relacionadas
- [x] **T8.2** — Atualizar `AGENTS.md` raiz com a entrada do módulo
  - Arquivo: `AGENTS.md`
- [x] **T8.3** — Adicionar comentários de rastreabilidade nos arquivos de código
  - Pattern: `// BDD:`, `// SDD:`, `// ATDD:`, `// TDD:` conforme `AGENTS.md`
- [x] **T8.4** — Documentar CR retroativo (este CR)
  - Arquivos: `.openspec/changes/usuarios/{proposal,design,tasks}.md`

---

### Phase 9: Deployment / Archive (Retroativo)

- [x] **T9.1** — Code review aprovado
- [x] **T9.2** — Merge em `main` via PR
- [x] **T9.3** — Deploy em produção (já realizado)
- [x] **T9.4** — CR retroativo arquivado em `.openspec/changes/usuarios/`
  - Status: pronto para eventual promoção a `.openspec/specs/usuarios.md`

---

## Task Dependencies

```
proposal.md → design.md → tasks.md
    ↓
features/usuarios.feature (BDD)
    ↓
domain/entity, domain/repository (DDD)
    ↓
application/dto, application/service, application/controller
    ↓
infrastructure/repository
    ↓
tests (unit + e2e) — RED
    ↓
implementations ajustadas — GREEN
    ↓
quality gates + docs
    ↓
archive CR retroativo
```

## Notes

- Cada task acima é independentemente commitável.
- Convenção de commits: `feat(usuarios):`, `fix(usuarios):`, `test(usuarios):`, `docs(usuarios):`.
- Mensagens referenciam ACs: por exemplo, `feat(usuarios): implementa AC-USER-11 (soft delete)`.
- Este CR é retroativo: a sequência DDD→BDD→SDD→ATDD→TDD é refletida na ordem de descoberta do código no repositório, não na ordem cronológica de criação.
- Mapeamento BDD ↔ ATDD ↔ TDD:
  - **BDD**: 13 cenários em `features/usuarios.feature`
  - **ATDD**: 22+ testes em `test/usuarios.e2e-spec.ts` (cada cenário BDD é coberto por 1+ testes e2e)
  - **TDD**: 5+ testes em `src/usuarios/application/services/usuarios.service.spec.ts` + 4+ testes em arquivos `*.spec.ts` adjacentes

## Total de Tasks

- **Total**: 31 tasks
- **Concluídas**: 31/31 (100%)
- **Pendentes**: 0

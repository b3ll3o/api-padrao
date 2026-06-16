# Feature: Perfis (perfis) — Design Specification

> **Status**: Aprovado retroativamente. A feature está implementada em `src/perfis/` e este documento formaliza os requisitos (RFC 2119), endpoints, modelos de dados e rastreabilidade BDD+ATDD+TDD.

## Overview

A feature `perfis` implementa o cadastro de **Perfis de acesso escopados por empresa** no modelo multi-tenant da `api-padrao`. Cada `Perfil` é uma coleção nomeada de `Permissao` (N:N) que é atribuída a `Usuario` dentro do vínculo `UsuarioEmpresa` (N:M indireto). O escopo por `empresaId` permite que duas empresas distintas possuam perfis com o mesmo `nome`/`codigo` mas com conjuntos de permissões diferentes.

A feature expõe 5 endpoints REST protegidos por `@TemPermissao` e respeita o contexto de tenancy via header `x-empresa-id` (extraído pelo decorator `@EmpresaId()`). Implementa soft delete através do flag `ativo` no `UpdatePerfilDto`, com restore protegido a usuários `ADMIN`.

## Requirements

### Functional Requirements

- REQ-PERFIL-001: The system MUST persist a `Perfil` entity scoped to a single `empresaId` (FK). (BDD: Cenário "Criar perfil com dados válidos")
- REQ-PERFIL-002: The system MUST reject creation of a `Perfil` whose `nome` already exists in the same `empresaId` with HTTP 409. (BDD: Cenário "Criar perfil com código duplicado na mesma empresa")
- REQ-PERFIL-003: The system MUST reject `CreatePerfilDto` payloads that omit `codigo` or `empresaId` with HTTP 400. (BDD: Cenários "Criar perfil sem código" e "Criar perfil sem empresa")
- REQ-PERFIL-004: The system MUST allow `Perfil` creation without any `permissoesIds`, persisting an empty `permissoes` array. (BDD: Cenário "Criar perfil sem permissões")
- REQ-PERFIL-005: The system MUST validate that every `permissaoId` referenced in `CreatePerfilDto.permissoesIds` exists in `permissoes` table before persisting. (TDD: `perfis.service.spec.ts` "deve lançar NotFoundException se as permissões não existirem")
- REQ-PERFIL-006: The system MUST return a paginated list of `Perfil` filtered by `empresaId` (when provided) excluding soft-deleted rows by default. (BDD: Cenário "Listar perfis por empresa")
- REQ-PERFIL-007: The system MUST return a single `Perfil` by `id`, scoped to `empresaId` when provided, returning 404 if not found. (BDD: Cenário "Buscar perfil por ID")
- REQ-PERFIL-008: The system MUST provide a paginated `GET /perfis/nome/:nome` endpoint that performs a case-insensitive `contains` search on `nome`, scoped to `empresaId`. (BDD: Cenário "Buscar perfil por código na empresa" — adaptador)
- REQ-PERFIL-009: The system MUST support partial update of `Perfil` via `PATCH /perfis/:id` updating `nome`, `codigo`, `descricao`, and `permissoesIds`. (BDD: Cenário "Atualizar perfil")
- REQ-PERFIL-010: The system MUST treat `ativo: true` in `UpdatePerfilDto` as a **restore** operation (set `deletedAt = null`, `ativo = true`) and MUST treat `ativo: false` as a **soft delete** (set `deletedAt = now()`, `ativo = false`). (TDD: `perfis.service.spec.ts` "deve restaurar um perfil com soft delete via flag ativo" e "deve realizar soft delete de um perfil via flag ativo")
- REQ-PERFIL-011: The system MUST restrict the `ativo` flag operation in `update()` to users whose JWT payload contains a `Perfil` with `codigo === 'ADMIN'` in any of their `empresas`, returning HTTP 403 otherwise. (TDD: `perfis.service.spec.ts` "deve lançar ForbiddenException se não for admin ao tentar restaurar/deletar via flag ativo")
- REQ-PERFIL-012: The system MUST raise HTTP 409 (`ConflictException`) when `ativo: true` is sent for a non-deleted profile, or when `ativo: false` is sent for an already-deleted profile. (TDD: `perfis.service.spec.ts` "deve lançar ConflictException se tentar restaurar/deletar ...")
- REQ-PERFIL-013: The system MUST return HTTP 404 when a `PATCH /perfis/:id` targets a non-existent id. (TDD: `perfis.service.spec.ts` "deve lançar NotFoundException se o perfil a ser atualizado não for encontrado")

### Non-Functional Requirements

- NFR-PERFIL-001: **Security** — Every endpoint MUST be guarded by `@TemPermissao` with the respective permission code (`CREATE_PERFIL`, `READ_PERFIS`, `READ_PERFIL_BY_ID`, `READ_PERFIL_BY_NOME`, `UPDATE_PERFIL`) and MUST be reached only with a valid `Bearer JWT`.
- NFR-PERFIL-002: **Tenancy isolation** — All read/write operations MUST scope queries by `empresaId` whenever the `x-empresa-id` header is present, preventing cross-tenant access. (`PrismaPerfilRepository.findOne/findAll/findByNome/findByNomeContaining` all accept and apply `empresaId`.)
- NFR-PERFIL-003: **Soft delete by default** — List/get/findByNome operations MUST exclude rows where `deletedAt != null` by default (via `prisma.extended.perfil`); they SHALL include them only when `includeDeleted: true` is explicitly passed.
- NFR-PERFIL-004: **Backward compatibility of DTOs** — `UpdatePerfilDto` MUST extend `PartialType(CreatePerfilDto)` so all create fields remain updatable; `ativo` MUST be `@IsOptional() @IsBoolean()`.
- NFR-PERFIL-005: **Traceability** — Source files MUST carry comments linking to BDD scenarios (e.g. `// BDD: features/perfis.feature:Cenário: ...`), SDD requirements (`// SDD: .openspec/changes/perfis/design.md:REQ-PERFIL-XXX`), ATDD (`// ATDD: test/perfis.e2e-spec.ts`) and TDD (`// TDD: src/perfis/application/services/perfis.service.spec.ts`).
- NFR-PERFIL-006: **Auditability** — Soft-deleted records MUST be restorable (no hard delete in business operations), preserving history.
- NFR-PERFIL-007: **Pagination** — All list endpoints (`GET /perfis`, `GET /perfis/nome/:nome`) MUST accept `PaginationDto` (`page`, `limit`) and return `PaginatedResponseDto<Perfil>` with `data`, `total`, `page`, `limit`, `totalPages`.
- NFR-PERFIL-008: **Observability** — Service class MUST use NestJS `Logger` to log relevant events (creation, restoration, soft delete, conflicts).

## Acceptance Criteria

- [x] AC-01: `POST /perfis` com payload válido (incluindo `empresaId`) retorna 201 e o perfil criado. (REQ-PERFIL-001, REQ-PERFIL-004)
- [x] AC-02: `POST /perfis` com payload sem `codigo` retorna 400. (REQ-PERFIL-003)
- [x] AC-03: `POST /perfis` com payload sem `empresaId` retorna 400. (REQ-PERFIL-003)
- [x] AC-04: `POST /perfis` com `(nome, empresaId)` duplicado retorna 409. (REQ-PERFIL-002)
- [x] AC-05: `POST /perfis` referenciando `permissaoId` inexistente retorna 404. (REQ-PERFIL-005)
- [x] AC-06: `GET /perfis?empresaId=...&page=1&limit=10` retorna 200 com `data: Perfil[]` paginado. (REQ-PERFIL-006, NFR-PERFIL-007)
- [x] AC-07: `GET /perfis/:id` retorna 200 com o perfil (e suas `permissoes`) ou 404. (REQ-PERFIL-007)
- [x] AC-08: `GET /perfis/nome/:nome?empresaId=...&page=1&limit=10` retorna 200 com perfis cujo `nome` contém o termo (case-insensitive). (REQ-PERFIL-008, NFR-PERFIL-007)
- [x] AC-09: `PATCH /perfis/:id` com `{ nome }` atualiza e retorna 200. (REQ-PERFIL-009)
- [x] AC-10: `PATCH /perfis/:id` com `{ ativo: true }` em perfil soft-deletado, por usuário `ADMIN`, restaura e retorna 200. (REQ-PERFIL-010, REQ-PERFIL-011)
- [x] AC-11: `PATCH /perfis/:id` com `{ ativo: false }` em perfil ativo, por usuário `ADMIN`, faz soft delete e retorna 200. (REQ-PERFIL-010, REQ-PERFIL-011)
- [x] AC-12: `PATCH /perfis/:id` com `{ ativo: ... }` por usuário NÃO-`ADMIN` retorna 403. (REQ-PERFIL-011)
- [x] AC-13: `PATCH /perfis/:id` com `{ ativo: true }` em perfil NÃO deletado retorna 409. (REQ-PERFIL-012)
- [x] AC-14: `PATCH /perfis/:id` com `{ ativo: false }` em perfil JÁ deletado retorna 409. (REQ-PERFIL-012)
- [x] AC-15: `PATCH /perfis/:id` com id inexistente retorna 404. (REQ-PERFIL-013)

## API Specification

Todas as rotas exigem `Authorization: Bearer <jwt>` e podem requerer `x-empresa-id` (header descrito como `ApiHeader` no controller).

### Endpoint 1: POST /perfis

**Permissão**: `CREATE_PERFIL`

**Request**:
```json
{
  "nome": "Administrador",
  "codigo": "ADMIN",
  "descricao": "Perfil com acesso total",
  "empresaId": "empresa-uuid-123",
  "permissoesIds": [1, 2, 3]
}
```

**Response** (201): `Perfil` (com `permissoes: Permissao[]`).

**Error Responses**:
- 400: Payload inválido (campos obrigatórios ausentes, tipos errados).
- 401: JWT ausente/inválido.
- 403: Sem permissão `CREATE_PERFIL`.
- 404: Algum `permissaoId` referenciado não existe.
- 409: Já existe perfil com mesmo `nome` para a `empresaId`.

### Endpoint 2: GET /perfis

**Permissão**: `READ_PERFIS`

**Query**: `PaginationDto` (`page`, `limit`); header `x-empresa-id` recomendado.

**Response** (200):
```json
{
  "data": [ { "id": 1, "nome": "Administrador", "permissoes": [...] } ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

**Error Responses**:
- 401, 403.

### Endpoint 3: GET /perfis/:id

**Permissão**: `READ_PERFIL_BY_ID`

**Response** (200): `Perfil` único com `permissoes`.

**Error Responses**:
- 401, 403, 404 (não encontrado ou deletado).

### Endpoint 4: GET /perfis/nome/:nome

**Permissão**: `READ_PERFIL_BY_NOME`

**Query**: `PaginationDto` (`page`, `limit`); header `x-empresa-id` recomendado.

**Response** (200): `PaginatedResponseDto<Perfil>` filtrado por `contains` case-insensitive.

**Error Responses**:
- 401, 403.

### Endpoint 5: PATCH /perfis/:id

**Permissão**: `UPDATE_PERFIL`

**Request** (qualquer subconjunto):
```json
{
  "nome": "Administrador Global",
  "codigo": "ADMIN",
  "descricao": "...",
  "permissoesIds": [1, 2],
  "ativo": true
}
```

**Response** (200): `Perfil` atualizado.

**Error Responses**:
- 400: Payload inválido.
- 401, 403, 404.
- 403 (específico do `ativo`): usuário sem `codigo === 'ADMIN'`.
- 409 (específico do `ativo`): conflito de estado (já deletado / não deletado).

## Data Models

### Entity: `Perfil` (extends `BaseEntity`)

| Field       | Type                | Required | Description                                       |
|-------------|---------------------|----------|---------------------------------------------------|
| id          | number (PK auto)    | Yes      | Identificador interno                             |
| nome        | string              | Yes      | Nome do perfil (único por `empresaId`)            |
| codigo       | string              | Yes      | Código simbólico (único por `empresaId`)          |
| descricao   | string              | Yes      | Descrição textual                                 |
| empresaId   | string (FK)         | Yes      | Empresa à qual o perfil pertence (escopo)         |
| ativo       | boolean             | Yes      | Flag lógico de atividade                          |
| deletedAt   | DateTime \| null    | No       | Timestamp de soft delete                          |
| createdAt   | DateTime            | Yes      | Herdado de `BaseEntity`                           |
| updatedAt   | DateTime            | Yes      | Herdado de `BaseEntity`                           |
| permissoes  | `Permissao[]`       | No       | Coleção N:N resolvida via `prisma.perfil.findMany({ include })` |

### Constraints

- **Unique composto**: `(nome, empresaId)` e `(codigo, empresaId)`.
- **FK**: `empresaId` → `empresas.id` (multi-tenant, cascade conforme migration).
- **Relação N:N**: `perfil_permissao(perfilId, permissaoId)`.

### Edge Cases

1. **`ativo: true` em perfil já ativo** → `ConflictException` (409). Não é idempotente; explicitamente rejeitado para evitar no-op silencioso.
2. **`ativo: false` em perfil já deletado** → `ConflictException` (409). Idem.
3. **`permissoesIds` com ID inexistente em `create`/`update`** → `NotFoundException` (404) via `PermissoesService.findOne`.
4. **Soft delete + restore** preserva o histórico — o `id` é estável, e a relação `UsuarioEmpresa` continua referenciando o perfil mesmo durante o soft delete (a decisão de remover o vínculo cabe a `usuarios`, fora deste escopo).
5. **`includeDeleted: true`** é usado internamente pelo `update()` para permitir restaurar perfis deletados, mas **NÃO** é exposto na API pública.

## Acceptance Tests

```typescript
// ATDD: test/perfis.e2e-spec.ts
describe('PerfisController (e2e)', () => {
  describe('POST /perfis', () => {
    it('deve criar um novo perfil com sucesso');               // AC-01
    it('deve retornar 409 se o perfil com o mesmo nome já existir na mesma empresa'); // AC-04
  });
  describe('GET /perfis', () => {
    it('deve retornar uma lista paginada de perfis');          // AC-06
  });
  describe('GET /perfis/:id', () => {
    it('deve retornar um único perfil');                       // AC-07
  });
  describe('PATCH /perfis/:id', () => {
    it('deve atualizar um perfil');                            // AC-09
    it('deve restaurar um perfil deletado');                   // AC-10
  });
});
```

## TDD Tests (unitários)

```typescript
// TDD: src/perfis/application/services/perfis.service.spec.ts
describe('PerfisService', () => {
  describe('criação', () => {
    it('deve criar um perfil');                                // AC-01
    it('deve criar um perfil sem permissões');                 // AC-01 (variação)
    it('deve lançar ConflictException se um perfil com o mesmo nome já existir'); // AC-04
    it('deve lançar NotFoundException se as permissões não existirem');          // AC-05
    it('deve restaurar um perfil com soft delete via flag ativo');               // AC-10
    it('deve lançar ConflictException se tentar restaurar um perfil não deletado via flag ativo'); // AC-13
    it('deve lançar ForbiddenException se não for admin ao tentar restaurar via flag ativo');     // AC-12
    it('deve realizar soft delete de um perfil via flag ativo');                 // AC-11
    it('deve lançar ConflictException se tentar deletar um perfil já deletado via flag ativo');   // AC-14
    it('deve lançar ForbiddenException se não for admin ao tentar deletar via flag ativo');      // AC-12
  });
  describe('busca de todos', () => {
    it('deve retornar uma lista paginada de perfis não excluídos por padrão');   // AC-06
    it('deve retornar uma lista paginada de todos os perfis, incluindo os excluídos'); // NFR-PERFIL-003
    it('deve retornar uma lista paginada de perfis filtrada por empresa');       // NFR-PERFIL-002
  });
  describe('busca por um', () => {
    it('deve retornar um único perfil (não excluído) por padrão');               // AC-07
    it('deve retornar um único perfil, incluindo os excluídos');                 // NFR-PERFIL-003
    it('deve lançar NotFoundException se o perfil não for encontrado');          // AC-07 (404)
  });
  describe('busca por nome', () => {
    it('deve retornar uma lista paginada de perfis não excluídos contendo o nome por padrão'); // AC-08
    it('deve retornar uma lista paginada de todos os perfis contendo o nome, incluindo os excluídos'); // NFR-PERFIL-003
  });
  describe('atualização', () => {
    it('deve atualizar um perfil');                                               // AC-09
    it('deve atualizar um perfil sem permissões');                                // AC-09 (variação)
    it('deve lançar NotFoundException se o perfil a ser atualizado não for encontrado'); // AC-15
    it('deve lançar NotFoundException se as permissões não existirem');           // AC-05
  });
});
```

## BDD Scenarios Associated

Localização: `features/perfis.feature`

1. Cenário: Criar perfil com dados válidos
2. Cenário: Criar perfil sem código
3. Cenário: Criar perfil sem empresa
4. Cenário: Criar perfil com código duplicado na mesma empresa
5. Cenário: Listar perfis por empresa
6. Cenário: Buscar perfil por ID
7. Cenário: Atualizar perfil
8. Cenário: Associar permissões a um perfil (cenário de roadmap — endpoint de associação, não exposto no controller atual; ver `permissoes.e2e-spec.ts` se aplicável)
9. Cenário: Remover permissão de um perfil (idem)
10. Cenário: Criar perfil sem permissões
11. Cenário: Buscar perfil por código na empresa (adaptador para `GET /perfis/nome/:nome`)

## Technical Notes

- **Multi-tenancy**: implementada no repositório, **NÃO** no RLS do banco. Toda query carrega `where.empresaId` quando o contexto está presente.
- **`prisma.extended.perfil` vs `prisma.perfil`**: o client estendido aplica o filtro `deletedAt: null` automaticamente; o client puro é usado quando `includeDeleted: true`.
- **`forwardRef(() => PermissoesModule)`**: resolve ciclo `perfis ↔ permissoes` (perfis validam permissões referenciadas; permissoes eventualmente referenciam perfis).
- **Soft delete via `ativo`**: centraliza a operação no `PATCH` para evitar rotas `DELETE` e `POST /restore` separadas — simplifica o cliente da API.
- **Restrição `ADMIN` no payload**: a checagem é feita em `PerfisService.update`, **NÃO** no decorator `@TemPermissao`, porque o `ativo` exige uma permissão contextual (ADMIN) que não é estática por endpoint. `@TemPermissao('UPDATE_PERFIL')` continua sendo a porta de entrada.
- **Ordenação em `restore`**: o `update()` faz `findOne(id, includeDeleted=true)` antes de chamar `restore(id, empresaId)`, garantindo que o `where` carregue o `empresaId` e evitando cross-tenant restore.

## Status

- [x] Draft
- [x] In Review
- [x] Approved
- [x] Implemented

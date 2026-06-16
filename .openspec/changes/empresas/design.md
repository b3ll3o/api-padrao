# Empresas - Design Specification

> Documentação retroativa (SDD) de feature já implementada.
> Linguagem: RFC 2119 (MUST / SHALL / SHOULD / MAY).

## Overview

O módulo `empresas` é a raiz do modelo multi-tenant da API. Ele é responsável
por:

1. **CRUD de empresas** (entidade `Empresa` com soft-delete).
2. **Vínculo N:M** entre `Usuario` e `Empresa` via tabela associativa
   `UsuarioEmpresa` (com perfis associados).
3. **Listagem de usuários** vinculados a uma empresa.
4. **Listagem de empresas** vinculadas a um usuário (método do repository,
   exposto indiretamente via `AuthService`).
5. **Auditoria** de operações sensíveis via `@Auditar()`.
6. **Proteção** contra abuso via `@Throttle({ sensitive: ... })`.

A separação de camadas segue o padrão da casa:
`domain (entity, repository)` → `application (service, controller)` →
`infrastructure (prisma repository)` → `prisma schema/migration`.

## Requirements (RFC 2119)

### Functional Requirements

- **REQ-EMP-001**: O sistema MUST expor `POST /empresas` para criar uma nova
  empresa, exigindo `nome` (string não vazia) e `responsavelId` (int não vazio),
  e opcionalmente `descricao`. Resposta MUST ser `201 Created` com a entidade
  completa (id, nome, descricao, ativo=true, responsavelId, createdAt,
  updatedAt).
  - BDD: `features/empresas.feature:Cenário: Criar empresa com dados válidos`
  - BDD: `features/empresas.feature:Cenário: Criar empresa sem nome`
  - BDD: `features/empresas.feature:Cenário: Criar empresa sem responsável`
  - ATDD: `test/empresas.e2e-spec.ts:POST /empresas`
  - TDD: `src/empresas/application/services/empresas.service.spec.ts:create`

- **REQ-EMP-002**: O sistema MUST expor `GET /empresas` retornando lista
  paginada (`{ data, total, page, limit, totalPages }`) apenas de empresas
  com `ativo: true` e `deletedAt: null`, ordenadas por `createdAt`.
  - BDD: `features/empresas.feature:Cenário: Listar empresas com paginação`
  - ATDD: `test/empresas.e2e-spec.ts:GET /empresas`
  - TDD: `src/empresas/application/services/empresas.service.spec.ts:findAll`

- **REQ-EMP-003**: O sistema MUST expor `GET /empresas/:id` retornando a
  empresa pelo `id` (UUID). Se não encontrada, MUST retornar `404 Not Found`
  com mensagem `"Empresa com ID {id} não encontrada"`.
  - BDD: `features/empresas.feature:Cenário: Buscar empresa por ID existente`
  - BDD: `features/empresas.feature:Cenário: Buscar empresa por ID inexistente`
  - ATDD: `test/empresas.e2e-spec.ts:GET /empresas/:id`
  - TDD: `src/empresas/application/services/empresas.service.spec.ts:findOne`

- **REQ-EMP-004**: O sistema MUST expor `PATCH /empresas/:id` aplicando
  *partial update* (campos opcionais). Se o id não existir, MUST retornar
  `404 Not Found`. Campos atualizáveis: `nome`, `descricao`, `responsavelId`.
  - BDD: `features/empresas.feature:Cenário: Atualizar empresa existente`
  - BDD: `features/empresas.feature:Cenário: Atualizar empresa inexistente`
  - ATDD: `test/empresas.e2e-spec.ts:PATCH /empresas/:id`
  - TDD: `src/empresas/application/services/empresas.service.spec.ts:update`

- **REQ-EMP-005**: O sistema MUST expor `DELETE /empresas/:id` realizando
  **soft-delete** (setando `ativo: false` e `deletedAt: now()`). Resposta
  MUST ser `204 No Content`. Após o soft-delete, a empresa MUST **não**
  aparecer em `GET /empresas`, `GET /empresas/:id` nem `GET /empresas/:id/usuarios`.
  - BDD: `features/empresas.feature:Cenário: Remover empresa (soft-delete)`
  - ATDD: `test/empresas.e2e-spec.ts:DELETE /empresas/:id`
  - TDD: `src/empresas/application/services/empresas.service.spec.ts:remove`

- **REQ-EMP-006**: O sistema MUST expor `POST /empresas/:id/usuarios` para
  vincular um `Usuario` à empresa com uma lista de `Perfil`s. O serviço MUST
  validar (a) existência da empresa, (b) existência do usuário,
  (c) existência de **cada** perfil em `perfilIds`. Se qualquer entidade
  referenciada não existir, MUST retornar `404 Not Found`. A operação MUST
  ser **idempotente**: re-chamar para o mesmo `(empresaId, usuarioId)`
  substitui a lista de perfis (upsert).
  - BDD: `features/empresas.feature:Cenário: Adicionar usuário à empresa`
  - BDD: `features/empresas.feature:Cenário: Adicionar usuário inexistente à empresa`
  - ATDD: `test/empresas.e2e-spec.ts:POST /empresas/:id/usuarios`
  - TDD: `src/empresas/application/services/empresas.service.spec.ts:addUser`

- **REQ-EMP-007**: O sistema MUST expor `GET /empresas/:id/usuarios`
  retornando a lista paginada de usuários vinculados à empresa, incluindo
  os perfis de cada usuário na resposta.
  - BDD: `features/empresas.feature:Cenário: Listar usuários de uma empresa`
  - ATDD: `test/empresas.e2e-spec.ts:POST /empresas/:id/usuarios > deve listar usuários`
  - TDD: `src/empresas/application/services/empresas.service.spec.ts:findUsersByCompany`

- **REQ-EMP-008**: O serviço MUST validar que **empresa, usuário e cada perfil
  referenciados existam** antes de criar o vínculo `UsuarioEmpresa`. A
  validação MUST ocorrer em ordem: empresa → usuário → perfis.
  - BDD: `features/empresas.feature:Cenário: Adicionar usuário inexistente à empresa`
  - ATDD: `test/empresas.e2e-spec.ts:POST /empresas/:id/usuarios > 404 em variação`
  - TDD: `src/empresas/application/services/empresas.service.spec.ts:addUser`

- **REQ-EMP-009**: O sistema MUST associar cada operação de mutação
  (`create`, `update`, `remove`) ao decorator `@Auditar({ acao, recurso: 'EMPRESA' })`
  para fins de trilha de auditoria. As ações MUST ser `CRIAR`, `ATUALIZAR` e
  `REMOVER` respectivamente.
  - ATDD: cobertura implícita em `test/empresas.e2e-spec.ts`
  - TDD: `src/empresas/application/services/empresas.service.spec.ts`

- **REQ-EMP-010**: O sistema MUST aplicar **rate-limiting** (`@Throttle`)
  aos endpoints `POST /empresas`, `PATCH /empresas/:id` e `DELETE /empresas/:id`
  com bucket `sensitive` (`limit: 10`, `ttl: 60_000` ms).
  - ATDD: implicitamente testado em suite de throttler (`test/`)
  - TDD: cobertura de decorators aplicada em `src/empresas/application/controllers/empresas.controller.ts`

### Non-Functional Requirements

- **NFR-EMP-001 (Segurança)**: Todos os endpoints MUST exigir autenticação
  via JWT Bearer (`@ApiBearerAuth('JWT-auth')`) e permissão granular
  (`@TemPermissao('CODIGO')`). Endpoints MUST retornar `401` se ausente
  token e `403` se a permissão estiver ausente.
  - ATDD: `test/empresas.e2e-spec.ts:Segurança e Autorização`

- **NFR-EMP-002 (Auditabilidade)**: Operações de mutação MUST ser
  registradas via `@Auditar()` com `recurso: 'EMPRESA'`, alimentando o
  módulo `audit-module` para consulta posterior.

- **NFR-EMP-003 (Rate-limit)**: Endpoints sensíveis MUST ser limitados a
  10 requisições por minuto por chave de throttler, mitigando abuso e
  força-bruta.

- **NFR-EMP-004 (Multi-tenancy)**: Toda checagem de permissão MUST
  considerar o header `x-empresa-id` (fornecido via decorator
  `@EmpresaId()`) e os perfis do usuário **dentro** daquela empresa
  (carregados pela claim `empresas[]` do JWT).

- **NFR-EMP-005 (Idempotência)**: A operação de vincular usuário MUST
  ser idempotente: repetições para o mesmo `(empresaId, usuarioId)` MUST
  substituir `perfilIds` em vez de duplicar.
  - ATDD: `test/empresas.e2e-spec.ts:deve atualizar perfis se o vínculo já existir`

- **NFR-EMP-006 (Soft-delete)**: A deleção MUST ser lógica: `ativo: false`
  e `deletedAt: now()`. Registros soft-deletados MUST ser filtrados das
  listagens e buscas (exceto admin com permissão explícita, fora do escopo).
  - ATDD: `test/empresas.e2e-spec.ts:deve falhar ao buscar empresa que sofreu soft delete`

- **NFR-EMP-007 (Documentação OpenAPI)**: Todos os endpoints MUST ser
  documentados via `@nestjs/swagger` com `@ApiOperation`, `@ApiResponse`,
  `@ApiTags('Empresas')` e `@ApiBearerAuth('JWT-auth')`.

- **NFR-EMP-008 (Validação de entrada)**: Os DTOs MUST usar `class-validator`
  e MUST ser aplicados via `ValidationPipe` global (já configurado em
  `src/main.ts`). Mensagens de erro MUST ser em PT-BR.

## Acceptance Criteria

- [x] **AC-01**: Empresa com dados válidos é criada e retorna `201` com
  `id`, `nome`, `descricao`, `ativo: true`, `responsavelId`, `createdAt`,
  `updatedAt`.
- [x] **AC-02**: Empresa sem `nome` retorna `400` com mensagem
  `"O nome é obrigatório"`.
- [x] **AC-03**: Empresa sem `responsavelId` retorna `400` com mensagem
  `"O ID do responsável é obrigatório"`.
- [x] **AC-04**: `GET /empresas` retorna `{ data: [...], total, page, limit, totalPages }`
  e filtra empresas inativas.
- [x] **AC-05**: `GET /empresas/:id` retorna `200` com a empresa ou `404`
  com mensagem `"... não encontrada"`.
- [x] **AC-06**: `PATCH /empresas/:id` aplica partial update e retorna
  `200` com a entidade atualizada.
- [x] **AC-07**: `DELETE /empresas/:id` retorna `204` e marca a empresa
  como `ativo: false`, `deletedAt: <timestamp>`. A empresa deixa de
  aparecer em todas as listagens.
- [x] **AC-08**: `POST /empresas/:id/usuarios` valida empresa, usuário
  e cada perfil; retorna `201` em sucesso ou `404` em qualquer ausência.
- [x] **AC-09**: `GET /empresas/:id/usuarios` retorna usuários
  paginados com perfis embutidos.
- [x] **AC-10**: Requisições sem token retornam `401`.
- [x] **AC-11**: Requisições com token mas sem permissão retornam `403`.
- [x] **AC-12**: Idempotência: re-chamar `POST /:id/usuarios` para o
  mesmo par `(empresa, usuario)` substitui `perfilIds`.
- [x] **AC-13**: Throttle de 10 req/min em `POST/PATCH/DELETE`.

## API Specification

> Base path: `/empresas`
> Auth: Bearer JWT obrigatório em todos os endpoints.

### Endpoint 1: `POST /empresas`

**Permissão**: `CREATE_EMPRESA`
**Rate-limit**: 10 req/min (sensitive)
**Auditoria**: `CRIAR` em `EMPRESA`

**Request**:
```json
{
  "nome": "Tech Solutions",
  "descricao": "Empresa de TI",
  "responsavelId": 1
}
```

**Response** (201):
```json
{
  "id": "uuid-123",
  "nome": "Tech Solutions",
  "descricao": "Empresa de TI",
  "ativo": true,
  "responsavelId": 1,
  "createdAt": "2026-06-15T12:00:00.000Z",
  "updatedAt": "2026-06-15T12:00:00.000Z"
}
```

**Error Responses**:
- `400`: validação (sem nome, sem responsável, tipo errado)
- `401`: sem token
- `403`: sem permissão `CREATE_EMPRESA`

### Endpoint 2: `GET /empresas`

**Permissão**: `READ_EMPRESAS`

**Query**:
- `page` (int, default 1)
- `limit` (int, default 10)

**Response** (200):
```json
{
  "data": [{ "id": "uuid-123", "nome": "Tech", "ativo": true, "responsavelId": 1, "...": "..." }],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

**Error Responses**:
- `401`: sem token
- `403`: sem permissão `READ_EMPRESAS`

### Endpoint 3: `GET /empresas/:id`

**Permissão**: `READ_EMPRESA_BY_ID`

**Response** (200):
```json
{
  "id": "uuid-123",
  "nome": "Tech Solutions",
  "descricao": "Empresa de TI",
  "ativo": true,
  "responsavelId": 1,
  "createdAt": "2026-06-15T12:00:00.000Z",
  "updatedAt": "2026-06-15T12:00:00.000Z"
}
```

**Error Responses**:
- `401`: sem token
- `403`: sem permissão
- `404`: empresa não encontrada

### Endpoint 4: `PATCH /empresas/:id`

**Permissão**: `UPDATE_EMPRESA`
**Rate-limit**: 10 req/min (sensitive)
**Auditoria**: `ATUALIZAR` em `EMPRESA`

**Request** (todos os campos opcionais):
```json
{
  "nome": "Novo Nome",
  "descricao": "Nova desc",
  "responsavelId": 2
}
```

**Response** (200): entidade atualizada.
**Error Responses**: `400` (validação), `401`, `403`, `404`.

### Endpoint 5: `DELETE /empresas/:id`

**Permissão**: `DELETE_EMPRESA`
**Rate-limit**: 10 req/min (sensitive)
**Auditoria**: `REMOVER` em `EMPRESA`

**Response**: `204 No Content`.
**Error Responses**: `401`, `403`, `404`.

### Endpoint 6: `POST /empresas/:id/usuarios`

**Permissão**: `ADD_USER_TO_EMPRESA`

**Request**:
```json
{
  "usuarioId": 5,
  "perfilIds": [1, 2]
}
```

**Response** (201): `void` (operação idempotente).
**Error Responses**:
- `400`: `perfilIds` vazio ou tipos errados
- `401`, `403`
- `404`: empresa, usuário OU perfil não encontrado

### Endpoint 7: `GET /empresas/:id/usuarios`

**Permissão**: `READ_EMPRESA_USUARIOS`

**Query**: `page`, `limit`
**Response** (200): `{ data: [{ id, email, perfis: [...] }], total, page, limit, totalPages }`
**Error Responses**: `401`, `403`, `404` (empresa).

## Data Models

### Entity: `Empresa`

| Field           | Type        | Required | Description                                  |
| --------------- | ----------- | -------- | -------------------------------------------- |
| id              | UUID (PK)   | Yes      | Identificador único (gerado pelo DB)         |
| nome            | String      | Yes      | Nome da empresa (não vazio)                  |
| descricao       | String?     | No       | Descrição opcional                           |
| ativo           | Boolean     | Yes      | Flag lógica de ativação (default `true`)     |
| responsavelId   | Int (FK)    | Yes      | FK para `Usuario.id` (responsável)           |
| createdAt       | DateTime    | Yes      | Timestamp de criação                         |
| updatedAt       | DateTime    | Yes      | Timestamp de atualização                     |
| deletedAt       | DateTime?   | No       | Timestamp de soft-delete (null = ativa)      |

### Entity: `UsuarioEmpresa` (tabela associativa)

| Field         | Type     | Required | Description                              |
| ------------- | -------- | -------- | ---------------------------------------- |
| usuarioId     | Int (FK) | Yes      | FK para `Usuario.id`                    |
| empresaId     | UUID (FK)| Yes      | FK para `Empresa.id`                    |
| perfis        | Perfil[] | Yes      | N:M com `Perfil` (perfis no contexto)   |
| createdAt     | DateTime | Yes      | Timestamp de criação do vínculo          |

### Relationships

- `Empresa` N:1 `Usuario` (via `responsavelId`).
- `Empresa` 1:N `UsuarioEmpresa`.
- `Usuario` 1:N `UsuarioEmpresa`.
- `UsuarioEmpresa` N:M `Perfil` (atribuídos por vínculo).
- `Empresa` 1:N `Perfil` (perfis por empresa).

## Edge Cases

1. **Criar empresa sem `nome`** — DTO rejeita com `400` e mensagem
   `"O nome é obrigatório"`.
2. **Criar empresa sem `responsavelId`** — DTO rejeita com `400` e mensagem
   `"O ID do responsável é obrigatório"`.
3. **GET com id inexistente** — Service lança `NotFoundException` → `404`.
4. **PATCH/DELETE com id inexistente** — Mesmo tratamento (`404`).
5. **Soft-deleted empresa** — Não aparece em `GET /empresas` nem em
   `GET /empresas/:id` (filtro `ativo: true AND deletedAt: null`).
6. **Vincular usuário inexistente** — `404` com mensagem `"Usuário com
   ID {id} não encontrado"`.
7. **Vincular perfil inexistente** — `404` com mensagem `"Perfil com
   ID {id} não encontrado"`. Validação é feita em **loop** sobre
   `perfilIds`.
8. **Vincular usuário já vinculado** — Operação é **idempotente**:
   `upsert` substitui `perfilIds` em vez de duplicar linhas.
9. **Vincular com `perfilIds: []`** — DTO rejeita com `400` (validador
   `@IsNotEmpty()` no array).
10. **Vincular com `x-empresa-id` faltando** — middleware de tenant
    responde `403` (ver módulo `auth`).
11. **Throttling excedido** — `429 Too Many Requests` após 10 req/min.

## Acceptance Tests (ATDD)

Arquivo: `test/empresas.e2e-spec.ts`
Describes: `EmpresasController (e2e)` com sub-describes:
- `Segurança e Autorização` (3 testes: 401 sem token, 403 sem permissão em POST/GET)
- `Cenários de Erro e Casos de Borda` (4 testes: 404 em PATCH/DELETE/POST sem empresa, soft-deleted)
- `POST /empresas` (2 testes: criar 201, 400 sem nome)
- `GET /empresas` (1 teste: listar paginado)
- `GET /empresas/:id` (2 testes: 200 existente, 404 inexistente)
- `PATCH /empresas/:id` (1 teste: atualizar nome)
- `DELETE /empresas/:id` (1 teste: soft-delete + checagem DB)
- `POST /empresas/:id/usuarios` (5 testes: vincular, listar, idempotência, 404 user, 404 perfil)

Total: **~19 testes ATDD**.

## Unit Tests (TDD)

Arquivo: `src/empresas/application/services/empresas.service.spec.ts`
Describes: `EmpresasService` com sub-describes:
- `create` (1 teste)
- `findAll` (1 teste)
- `findOne` (2 testes: sucesso e 404)
- `update` (2 testes: sucesso e 404)
- `remove` (2 testes: sucesso e 404)
- `addUser` (4 testes: sucesso, 404 empresa, 404 user, 404 perfil)
- `findUsersByCompany` (2 testes: sucesso e 404)

Total: **~14 testes TDD**.

## Technical Notes

- **UUID como PK**: id da empresa é gerado pelo DB (Prisma `@default(uuid())`).
  O DTO **não** aceita `id` no input; o retorno carrega o id gerado.
- **Multi-tenancy**: o decorator `@TemPermissao()` (em `src/auth/`)
  consulta os perfis do JWT claim `empresas[].perfis[].permissoes[]`. O
  tenant atual vem do header `x-empresa-id` via `@EmpresaId()`.
- **Auditoria**: o decorator `@Auditar()` enriquece o log com
  `{ usuarioId, acao, recurso, contexto, ip, userAgent }` e persiste via
  `audit-module`.
- **Throttle**: configurado em `src/app.module.ts` com bucket `sensitive`
  (10 req / 60s).
- **Repository pattern**: `EmpresaRepository` é uma classe abstrata
  (port). `PrismaEmpresaRepository` (em
  `src/empresas/infrastructure/repositories/`) é a implementação
  (adapter). O módulo registra via token NestJS.
- **Domain layer**: a entidade `Empresa` é um POJO sem dependências de
  framework; o repository é injetado por abstração.
- **Migration**: tabela `empresa` + tabela associativa `usuario_empresa`
  (com FK composta `@@id([empresaId, usuarioId])`) + tabela associativa
  `perfil_on_usuario_empresa` (N:M para perfis).
- **Seed**: permissions são criadas via `prisma.permissao.create({ data:
  { codigo: 'CREATE_EMPRESA', ... }})` no `beforeEach` do e2e-spec; em
  produção elas vivem no seed/migrations.

## BDD Scenarios Associated

Arquivo: `features/empresas.feature` (11 cenários)

1. `Cenário: Criar empresa com dados válidos`
2. `Cenário: Criar empresa sem nome`
3. `Cenário: Criar empresa sem responsável`
4. `Cenário: Listar empresas com paginação`
5. `Cenário: Buscar empresa por ID existente`
6. `Cenário: Buscar empresa por ID inexistente`
7. `Cenário: Atualizar empresa existente`
8. `Cenário: Atualizar empresa inexistente`
9. `Cenário: Remover empresa (soft-delete)`
10. `Cenário: Adicionar usuário à empresa`
11. `Cenário: Adicionar usuário inexistente à empresa`
12. `Cenário: Listar usuários de uma empresa`

Total: **12 cenários BDD** (incluindo o `Listar usuários` no final do arquivo).

## Acceptance Tests Associated

- `test/empresas.e2e-spec.ts` (suite E2E completa)
- `src/empresas/application/services/empresas.service.spec.ts` (unit tests)

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved
- [x] Implemented
- [x] Documented retroativamente

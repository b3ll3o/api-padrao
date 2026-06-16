# Feature: Usuários (`usuarios`) - Design Specification

> **Status**: Retroativo — feature implementada e validada
> **Workflow**: DDD → BDD → SDD → ATDD → TDD
> **Versão do design**: 1.0.0
> **Data**: 2026-06-15

## Overview

O módulo `usuarios` implementa o ciclo de vida completo de identidade no sistema `api-padrao`. Ele é a raiz do modelo multi-tenant: cada `Usuario` existe de forma independente e é vinculado a zero ou mais `Empresa` através da entidade associativa `UsuarioEmpresa`, que carrega os `Perfil(is)` (e, transitivamente, as `Permissao(es)`) que o usuário possui **naquela empresa específica**.

A feature cobre:

1. **Auto-cadastro público** (`POST /usuarios`).
2. **Gestão administrativa** de usuários (listagem, busca, atualização, soft delete, restauração).
3. **Consulta de vínculos** do usuário com empresas.
4. **Autorização granular** baseada em permissões por endpoint, com fallback para a regra "admin global" (perfil `ADMIN` em qualquer empresa) vs. "admin de empresa" (perfil `ADMIN` na empresa alvo).
5. **Soft delete** padronizado via `BaseEntity` (campos `ativo` e `deletedAt`).

A arquitetura segue DDD estrito: a camada de domínio não conhece Prisma/NestJS; a camada de aplicação orquestra casos de uso; a camada de infraestrutura implementa os ports definidos pelo domínio.

## Requirements (RFC 2119)

### Functional Requirements

#### Identidade e cadastro

- **REQ-USER-001**: O sistema MUST expor `POST /usuarios` como endpoint público (sem autenticação) para auto-cadastro de novos usuários.
- **REQ-USER-002**: O sistema MUST validar que o campo `email` é um endereço de e-mail sintaticamente válido (RFC 5322 subset via `@IsEmail`).
- **REQ-USER-003**: O sistema MUST validar que a `senha` tem no mínimo 8 caracteres.
- **REQ-USER-004**: O sistema MUST validar que a `senha` contém pelo menos: (a) uma letra maiúscula, (b) uma letra minúscula, e (c) um dígito numérico **ou** um caractere especial (regex `((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$`).
- **REQ-USER-005**: O sistema MUST retornar `400 Bad Request` com mensagem localizável quando qualquer validação de `REQ-USER-002`, `REQ-USER-003` ou `REQ-USER-004` falhar.
- **REQ-USER-006**: O sistema MUST rejeitar o cadastro quando o `email` já existir para outro usuário, retornando `409 Conflict` com a mensagem `"Usuário com este e-mail já cadastrado."`.
- **REQ-USER-007**: O sistema MUST persistir a senha apenas como hash `bcrypt` (custo 10), nunca em texto claro.
- **REQ-USER-008**: O sistema MUST retornar `201 Created` com o corpo do `Usuario` criado (id, email, timestamps) em caso de sucesso. A propriedade `senha` MUST NOT ser retornada.

#### Listagem

- **REQ-USER-010**: O sistema MUST expor `GET /usuarios` para listagem paginada.
- **REQ-USER-011**: O sistema MUST exigir a permissão `READ_USUARIOS` no token JWT para acessar `GET /usuarios`.
- **REQ-USER-012**: O sistema MUST aceitar query params `page` e `limit` via `PaginationDto`.
- **REQ-USER-013**: O sistema MUST retornar a estrutura `PaginatedResponseDto<Usuario>` com `data: Usuario[]`, `total: number`, `page: number`, `limit: number`, `totalPages: number`.
- **REQ-USER-014**: O sistema MUST excluir por padrão usuários com `deletedAt != null` (soft-deletados) da listagem.
- **REQ-USER-015**: O sistema MUST negar acesso (`403 Forbidden`) a usuários sem o perfil `ADMIN` em nenhuma empresa ou na empresa-alvo do header `x-empresa-id`.

#### Busca por ID

- **REQ-USER-020**: O sistema MUST expor `GET /usuarios/:id` para retornar um usuário pelo seu identificador numérico.
- **REQ-USER-021**: O sistema MUST exigir autenticação JWT e a permissão `READ_USUARIO_BY_ID`.
- **REQ-USER-022**: O sistema MUST retornar o próprio `Usuario` quando o `id` da URL for igual ao `userId` do token, sem checagem adicional de permissão.
- **REQ-USER-023**: O sistema MUST permitir que um `ADMIN` (perfil em qualquer empresa) acesse dados de qualquer usuário.
- **REQ-USER-024**: O sistema MUST retornar `403 Forbidden` quando o solicitante não é o próprio usuário e não é `ADMIN`.
- **REQ-USER-025**: O sistema MUST retornar `404 Not Found` quando o `id` não existir ou o usuário estiver soft-deletado (`deletedAt != null`).
- **REQ-USER-026**: O sistema MUST excluir o campo `senha` do payload de resposta (via `@Exclude()` na entidade + `ClassSerializerInterceptor` global).

#### Atualização

- **REQ-USER-030**: O sistema MUST expor `PATCH /usuarios/:id` para atualização parcial de um usuário.
- **REQ-USER-031**: O sistema MUST exigir autenticação JWT e a permissão `UPDATE_USUARIO`.
- **REQ-USER-032**: O sistema MUST aplicar throttling de 10 requisições por minuto no endpoint `PATCH /usuarios/:id` (decorator `@Throttle({ sensitive: { limit: 10, ttl: 60000 } })`).
- **REQ-USER-033**: O sistema MUST permitir que o próprio usuário atualize seu `email` e `senha`.
- **REQ-USER-034**: O sistema MUST permitir que um `ADMIN` atualize dados de qualquer usuário.
- **REQ-USER-035**: O sistema MUST permitir que um `ADMIN` realize **soft delete** enviando `{ "ativo": false }` no body.
- **REQ-USER-036**: O sistema MUST permitir que um `ADMIN` **restaure** um usuário soft-deletado enviando `{ "ativo": true }` no body.
- **REQ-USER-037**: O sistema MUST retornar `409 Conflict` se `ativo: true` for enviado para um usuário **não** deletado, ou se `ativo: false` for enviado para um usuário já deletado.
- **REQ-USER-038**: O sistema MUST validar unicidade de e-mail na atualização; caso o novo e-mail já pertença a outro usuário, MUST retornar `409 Conflict`.
- **REQ-USER-039**: O sistema MUST re-hash a `senha` com `bcrypt` sempre que ela for alterada.
- **REQ-USER-040**: O sistema MUST registrar auditoria em toda mutação via decorator `@Auditar({ acao: 'ATUALIZAR', recurso: 'USUARIO' })`.

#### Vínculo com empresas

- **REQ-USER-050**: O sistema MUST expor `GET /usuarios/:id/empresas` para listar empresas às quais um usuário está vinculado.
- **REQ-USER-051**: O sistema MUST exigir a permissão `READ_USUARIO_EMPRESAS`.
- **REQ-USER-052**: O sistema MUST retornar `PaginatedResponseDto<Empresa>` com os dados da `UsuarioEmpresa` (perfis incluídos).

### Non-Functional Requirements

- **NFR-USER-001 (Segurança)**: O sistema MUST hashear todas as senhas com `bcrypt` (custo ≥ 10) antes de persistir. Texto claro MUST NOT aparecer em logs, traces, ou responses.
- **NFR-USER-002 (Segurança)**: O sistema MUST aplicar `@Exclude()` no campo `senha` da entidade `Usuario`, garantindo que o `ClassSerializerInterceptor` global remova o campo de qualquer serialização.
- **NFR-USER-003 (Segurança)**: O sistema MUST exigir HTTPS em produção para qualquer endpoint que trafegue credenciais. `POST /usuarios` SHALL ser protegido por HSTS quando atrás de proxy.
- **NFR-USER-004 (Auditoria)**: O sistema MUST registrar `acao` e `recurso` em todo `POST` e `PATCH` via decorator `@Auditar`.
- **NFR-USER-005 (Performance)**: O sistema MUST retornar a listagem em até 500ms (P95) para até 10.000 usuários com índice em `email` e `deletedAt`.
- **NFR-USER-006 (Soft delete)**: O sistema MUST nunca realizar `DELETE` físico; toda remoção SHALL setar `deletedAt = NOW()` e `ativo = false`. `BaseRepository` MUST filtrar `deletedAt: null` por padrão.
- **NFR-USER-007 (Rastreabilidade)**: Todo arquivo de código SHOULD conter comentários linkando para `// BDD:`, `// SDD:`, `// ATDD:`, `// TDD:` conforme `AGENTS.md`.
- **NFR-USER-008 (Idempotência)**: `PATCH /usuarios/:id` com `{ ativo: true }` em usuário já restaurado SHALL retornar `409`, nunca `200` com efeito silencioso.
- **NFR-USER-009 (Multi-tenancy)**: A autorização SHALL considerar o header `x-empresa-id` para diferenciar admin global vs. admin de empresa.
- **NFR-USER-010 (Observabilidade)**: O serviço SHOULD logar `email` e `id` em mutações (criação, atualização, soft delete, restauração) para fins de auditoria operacional.

## Acceptance Criteria

- [x] **AC-USER-01**: `POST /usuarios` com email e senha válidos retorna 201 e o usuário criado, sem o campo `senha`.
- [x] **AC-USER-02**: `POST /usuarios` com email já existente retorna 409 com mensagem contendo "já existe".
- [x] **AC-USER-03**: `POST /usuarios` com email inválido retorna 400 com mensagem "E-mail inválido".
- [x] **AC-USER-04**: `POST /usuarios` com senha sem maiúscula retorna 400 com mensagem contendo "maiúscula".
- [x] **AC-USER-05**: `POST /usuarios` com senha curta (< 8) retorna 400 com mensagem "mínimo 8 caracteres".
- [x] **AC-USER-06**: `GET /usuarios?page=1&limit=10` autenticado como admin retorna 200 com `{ data: [...], total: N }`.
- [x] **AC-USER-07**: `GET /usuarios/:id` para um ID existente retorna 200, sem `senha` no payload.
- [x] **AC-USER-08**: `GET /usuarios/:id` para ID inexistente ou soft-deletado retorna 404.
- [x] **AC-USER-09**: `PATCH /usuarios/:id` com `{ email }` válido atualiza o e-mail e retorna 200.
- [x] **AC-USER-10**: `PATCH /usuarios/:id` com `{ senha }` válida re-hash a senha e retorna 200.
- [x] **AC-USER-11**: `PATCH /usuarios/:id` com `{ ativo: false }` (admin) realiza soft delete; `deletedAt` deixa de ser `null`.
- [x] **AC-USER-12**: `PATCH /usuarios/:id` com `{ ativo: true }` em usuário soft-deletado (admin) restaura; `deletedAt` volta a `null`.
- [x] **AC-USER-13**: `GET /usuarios` sem permissão `READ_USUARIOS` retorna 403.
- [x] **AC-USER-14**: `GET /usuarios/:id/empresas` retorna 200 com lista paginada de empresas.

## API Specification

### Endpoint 1: `POST /usuarios` (público)

Cria um novo usuário. Endpoint público (auto-cadastro).

**Request**:

```json
{
  "email": "novo.usuario@empresa.com",
  "senha": "Password123!"
}
```

**Response** (201):

```json
{
  "id": 42,
  "email": "novo.usuario@empresa.com",
  "ativo": true,
  "deletedAt": null,
  "createdAt": "2026-06-15T12:00:00.000Z",
  "updatedAt": "2026-06-15T12:00:00.000Z",
  "empresas": []
}
```

**Error Responses**:
- 400: validação falhou (email inválido, senha fraca, campos faltando)
- 409: email já cadastrado

---

### Endpoint 2: `GET /usuarios` (admin)

Lista usuários paginados. Requer permissão `READ_USUARIOS`.

**Request (query)**:

```
GET /usuarios?page=1&limit=10
Headers: Authorization: Bearer <jwt>, x-empresa-id: <uuid>
```

**Response** (200):

```json
{
  "data": [
    { "id": 1, "email": "user1@empresa.com", "ativo": true, "deletedAt": null, "createdAt": "...", "updatedAt": "...", "empresas": [] }
  ],
  "total": 100,
  "page": 1,
  "limit": 10,
  "totalPages": 10
}
```

**Error Responses**:
- 401: token ausente/inválido
- 403: sem permissão `READ_USUARIOS` (não é admin)

---

### Endpoint 3: `GET /usuarios/:id`

Busca usuário por ID. Requer permissão `READ_USUARIO_BY_ID`; o próprio usuário acessa seus dados.

**Request**:

```
GET /usuarios/1
Headers: Authorization: Bearer <jwt>, x-empresa-id: <uuid>
```

**Response** (200):

```json
{
  "id": 1,
  "email": "user1@empresa.com",
  "ativo": true,
  "deletedAt": null,
  "createdAt": "...",
  "updatedAt": "...",
  "empresas": [
    { "empresaId": "...", "perfis": [{ "id": 1, "codigo": "ADMIN" }] }
  ]
}
```

**Error Responses**:
- 401: sem token
- 403: tentando acessar dados de outro usuário sem ser admin
- 404: ID inexistente ou soft-deletado

---

### Endpoint 4: `PATCH /usuarios/:id`

Atualização parcial. Suporta: email, senha, ativo (soft delete/restore).

**Request**:

```json
PATCH /usuarios/1
{
  "email": "novo.email@empresa.com"
}
```

ou soft delete:

```json
PATCH /usuarios/1
{
  "ativo": false
}
```

ou restauração:

```json
PATCH /usuarios/1
{
  "ativo": true
}
```

**Response** (200): corpo do `Usuario` atualizado.

**Error Responses**:
- 401: sem token
- 403: sem permissão ou não-admin tentando soft delete/restore
- 404: ID inexistente
- 409: e-mail duplicado, ou `ativo: true` em usuário não-deletado, ou `ativo: false` em usuário já deletado

**Rate limit**: 10 req/min (`@Throttle({ sensitive: { limit: 10, ttl: 60000 } })`).

---

### Endpoint 5: `GET /usuarios/:id/empresas`

Lista empresas vinculadas ao usuário. Requer permissão `READ_USUARIO_EMPRESAS`.

**Request**:

```
GET /usuarios/1/empresas?page=1&limit=10
Headers: Authorization: Bearer <jwt>, x-empresa-id: <uuid>
```

**Response** (200):

```json
{
  "data": [
    { "id": "...", "nome": "Empresa Teste", "perfis": [{ "id": 1, "codigo": "ADMIN" }] }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

## Data Models

### Entity: `Usuario`

Estende `BaseEntity` (campos `id`, `createdAt`, `updatedAt`, `ativo`, `deletedAt`).

| Field      | Type                | Required | Description                                                       |
| ---------- | ------------------- | -------- | ----------------------------------------------------------------- |
| id         | number (autoinc)    | Yes      | Chave primária                                                    |
| email      | string              | Yes      | E-mail único no sistema                                           |
| senha      | string (bcrypt)     | No       | Hash da senha. **Nunca retornado em responses** (`@Exclude()`)    |
| ativo      | boolean             | Yes      | Flag derivada de `deletedAt == null`                              |
| deletedAt  | Date \| null        | No       | Soft delete: `null` = ativo, `Date` = deletado                    |
| createdAt  | Date                | Yes      | Criação (herdado de `BaseEntity`)                                 |
| updatedAt  | Date                | Yes      | Última atualização (herdado de `BaseEntity`)                     |
| empresas   | UsuarioEmpresa[]    | No       | Vínculos com empresas (lazy via repositório)                      |

### Entity: `UsuarioEmpresa` (associativa)

Tabela N:N entre `Usuario` e `Empresa` com payload adicional (`perfis`).

| Field       | Type     | Required | Description                              |
| ----------- | -------- | -------- | ---------------------------------------- |
| id          | UUID     | Yes      | Chave primária                           |
| usuarioId   | number   | Yes      | FK para `Usuario`                        |
| empresaId   | UUID     | Yes      | FK para `Empresa`                        |
| perfis      | Perfil[] | Yes      | Perfis do usuário naquela empresa        |
| createdAt   | Date     | Yes      | Criação                                  |
| updatedAt   | Date     | Yes      | Última atualização                       |

### Permissões consumidas

- `READ_USUARIOS` — listagem (`GET /usuarios`).
- `READ_USUARIO_BY_ID` — busca individual (`GET /usuarios/:id`).
- `UPDATE_USUARIO` — atualização + soft delete + restore (`PATCH /usuarios/:id`).
- `READ_USUARIO_EMPRESAS` — listagem de empresas (`GET /usuarios/:id/empresas`).
- `DELETE_USUARIO` — legado (soft delete é hoje via `UPDATE_USUARIO`).

### Perfis que afetam autorização

- `ADMIN` — perfil que confere admin global ou admin de empresa.
  - **Admin global**: possui `ADMIN` em qualquer empresa → pode acessar todos os usuários e fazer soft delete/restore.
  - **Admin de empresa**: possui `ADMIN` na empresa indicada pelo header `x-empresa-id` → pode listar/editar usuários dessa empresa.

## Edge Cases

1. **Email com maiúsculas/minúsculas diferentes**: o Prisma adapter SHOULD normalizar para lowercase antes de comparar; a constraint `@unique` em `email` no schema é case-sensitive por padrão. **Comportamento atual**: comparação exata (`findByEmail` no repositório); `CreateUsuarioDto` não força lowercase — dois cadastros `User@x.com` e `user@x.com` seriam considerados distintos a nível de banco. **Mitigação recomendada**: adicionar `@Transform(({ value }) => value.toLowerCase().trim())` no DTO.
2. **Soft delete em cascata**: o soft delete de um `Usuario` NÃO remove os `UsuarioEmpresa` vinculados. Empresas continuam listando o usuário como membro histórico. **Comportamento intencional** — preserva trilha de auditoria.
3. **PATCH com `senha` undefined**: se o body não contém `senha`, o serviço MUST NOT re-hash a senha atual. Implementação atual checa `if (updateUsuarioDto.senha)`.
4. **Restauração com `ativo: true` em usuário não-deletado**: retorna 409, não 200 silencioso (`REQ-USER-037`).
5. **Auto-cadastro + collision em `email`**: 409 imediato no service (`create` chama `findByEmail` antes de `create`).
6. **JWT expirado em `GET /usuarios/:id`**: retorna 401, não 403.
7. **Header `x-empresa-id` ausente em endpoint admin-only**: a checagem de "admin de empresa" SHALL ser tratada como `false`; o usuário SHALL cair na checagem de "admin global".
8. **Usuário sem empresas vinculadas**: o `GET /usuarios/:id/empresas` SHALL retornar `{ data: [], total: 0 }` (não 404).
9. **Senha com mais de 72 caracteres**: bcrypt trunca silenciosamente em 72 bytes. SHOULD validar tamanho máximo (ex.: 128) no DTO.
10. **Race condition em cadastro duplicado**: existe janela entre `findByEmail` e `create`. Aceitável no estado atual — `@unique` no schema Prisma garante integridade a nível de banco (retornaria 500 P2002 em caso de colisão real). **Mitigação recomendada**: capturar `Prisma.PrismaClientKnownRequestError` e re-mapear para 409.

## BDD Scenarios Associated

Cenários definidos em `features/usuarios.feature`:

1. `Cenário: Criar usuário com dados válidos` → `AC-USER-01`
2. `Cenário: Criar usuário com e-mail já existente` → `AC-USER-02`
3. `Cenário: Criar usuário com e-mail inválido` → `AC-USER-03`
4. `Cenário: Criar usuário com senha fraca - sem maiúscula` → `AC-USER-04`
5. `Cenário: Criar usuário com senha curta` → `AC-USER-05`
6. `Cenário: Listar usuários com paginação` → `AC-USER-06`
7. `Cenário: Buscar usuário por ID existente` → `AC-USER-07`
8. `Cenário: Buscar usuário por ID inexistente` → `AC-USER-08`
9. `Cenário: Atualizar e-mail de usuário` → `AC-USER-09`
10. `Cenário: Atualizar senha de usuário` → `AC-USER-10`
11. `Cenário: Desativar usuário (soft-delete)` → `AC-USER-11`
12. `Cenário: Reativar usuário` → `AC-USER-12`
13. `Cenário: Usuário não-admin não pode listar usuários` → `AC-USER-13`

## Acceptance Tests Associated

- `test/usuarios.e2e-spec.ts` — suíte e2e completa (cobre AC-USER-01 a AC-USER-14).
- `src/usuarios/application/services/usuarios.service.spec.ts` — testes unitários do service.

## Technical Notes

- **Stack**: NestJS 11, Fastify, Prisma 5, class-validator, bcrypt, `@nestjs/throttler`, `@nestjs/swagger`.
- **Decorator customizado**: `@TemPermissao(Permissoes.XXX)` valida permissões no token JWT e retorna 403 se ausentes.
- **Decorator `@Public()`**: marca `POST /usuarios` como rota isenta de autenticação.
- **Decorator `@Auditar(...)`**: registra ação + recurso em log/middleware de auditoria.
- **`ClassSerializerInterceptor` global**: garante que campos com `@Exclude()` nunca vazem.
- **`BaseRepository` do `shared`**: aplica filtro `deletedAt: null` automaticamente em `findOne`/`findAll`. O service passa `includeDeleted=true` quando precisa (soft delete, restore, update em deletado).
- **`IUsuarioAuthorizationService`**: porta que delega regras de "pode acessar/atualizar/restaurar" para um serviço dedicado (testável isoladamente).

## Status

- [x] Draft
- [x] In Review
- [x] Approved
- [x] Implemented (retroativo)

**Implementação validada por**:
- Suíte BDD: 13 cenários em `features/usuarios.feature`
- Suíte e2e: `test/usuarios.e2e-spec.ts`
- Suíte unitária: `src/usuarios/application/services/usuarios.service.spec.ts`

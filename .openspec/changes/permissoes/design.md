# Permissões - Design Specification (SDD)

> **Feature**: `permissoes` (CR retroativo)
> **Módulo**: `src/permissoes/`
> **Status**: Implementado / em produção (documentação retroativa)

---

## Overview

O módulo **Permissões** implementa o catálogo de permissões atômicas globais do `api-padrao`. Cada permissão representa **uma ação concreta que o sistema sabe executar** (ex.: `READ_USUARIOS`, `CREATE_EMPRESA`) e é referenciada **literalmente** no código-fonte pelo decorator `@TemPermissao('CODIGO')` para autorizar endpoints HTTP.

**Diferente de `Perfil`** (escopado por empresa), as permissões são **globais** — independentes do tenant — porque a autorização é decidida em tempo de compilação (decorators estáticos) e não em tempo de execução (políticas dinâmicas por tenant).

O módulo expõe 5 endpoints REST para gestão administrativa do catálogo (CRUD com soft-delete e restore) e mantém uma relação **N:N** com a entidade `Perfil`, sendo o lado inverso gerenciado por `Perfil`.

---

## Requirements (RFC 2119)

### Requisitos Funcionais

#### Identidade e Unicidade

- **REQ-PERM-001**: O sistema MUST garantir que `nome` seja **único globalmente** (case-sensitive) entre todas as permissões, ativas ou deletadas. Tentativas de duplicidade MUST retornar **HTTP 409 Conflict**.
- **REQ-PERM-002**: O sistema MUST garantir que `codigo` seja **único globalmente** (case-sensitive) entre todas as permissões, ativas ou deletadas. Tentativas de duplicidade MUST retornar **HTTP 409 Conflict**.
- **REQ-PERM-003**: O sistema MUST validar `nome`, `codigo` e `descricao` como strings **não vazias** no DTO de criação (HTTP 400 em ausência).
- **REQ-PERM-004**: O sistema SHOULD validar que `codigo` siga convenção `SCREAMING_SNAKE_CASE` (regex `^[A-Z][A-Z0-9_]*$`) — alerta no log, mas não bloqueia criação.

#### Escopo Global (NÃO escopado por Empresa)

- **REQ-PERM-005**: Permissões SHALL ser **entidades globais**, não escopadas por `empresaId`. Nenhuma rota de permissões MUST exigir `x-empresa-id` como filtro de tenant.
- **REQ-PERM-006**: O header `x-empresa-id` SHALL ser **opcional** em todas as rotas do módulo `permissoes`. Quando ausente, o sistema MUST operar no catálogo global.

#### CRUD Básico

- **REQ-PERM-010**: O sistema MUST permitir **criar** uma permissão via `POST /permissoes` (autorização: `CREATE_PERMISSAO`). Resposta MUST ser **HTTP 201** com a entidade criada.
- **REQ-PERM-011**: O sistema MUST permitir **listar** permissões via `GET /permissoes?page&limit` (autorização: `READ_PERMISSOES`), retornando `PaginatedResponseDto<Permissao>` com `data`, `total`, `page`, `limit`, `totalPages`.
- **REQ-PERM-012**: O sistema MUST permitir **buscar por ID** via `GET /permissoes/:id` (autorização: `READ_PERMISSAO_BY_ID`), retornando a permissão ativa (não soft-deleted) ou **HTTP 404**.
- **REQ-PERM-013**: O sistema MUST permitir **buscar por nome** via `GET /permissoes/nome/:nome?page&limit` (autorização: `READ_PERMISSAO_BY_NOME`), usando correspondência `contains` (case-sensitive) e retornando `PaginatedResponseDto<Permissao>`.
- **REQ-PERM-014**: O sistema MUST permitir **atualizar** uma permissão via `PATCH /permissoes/:id` (autorização: `UPDATE_PERMISSAO`). Campos atualizáveis: `nome`, `codigo`, `descricao`, `ativo`. Resposta MUST ser **HTTP 200** com a entidade atualizada.

#### Soft-Delete e Restore

- **REQ-PERM-020**: O sistema MUST implementar **soft-delete** via flag `ativo: false` no `PATCH /permissoes/:id`. Internamente, o sistema MUST setar `deletedAt = NOW()` e `ativo = false`.
- **REQ-PERM-021**: O sistema MUST implementar **restore** via flag `ativo: true` no `PATCH /permissoes/:id` (sobre permissão soft-deleted). Internamente, o sistema MUST setar `deletedAt = null` e `ativo = true`.
- **REQ-PERM-022**: O sistema MUST **bloquear restore** de uma permissão que NÃO esteja soft-deleted (HTTP 409 Conflict).
- **REQ-PERM-023**: O sistema MUST **bloquear soft-delete** de uma permissão que já esteja soft-deleted (HTTP 409 Conflict).
- **REQ-PERM-024**: O sistema MUST **exigir perfil ADMIN** (`AuthorizationService.isAdmin === true`) para executar soft-delete ou restore, caso contrário SHALL retornar **HTTP 403 Forbidden**.

#### Listagem e Filtros

- **REQ-PERM-030**: A listagem (`GET /permissoes`) MUST retornar, por padrão, **apenas permissões ativas** (não soft-deleted). Permissões deletadas SHALL aparecer apenas quando `includeDeleted = true` (uso interno, não exposto via controller).
- **REQ-PERM-031**: O sistema MUST aplicar **paginação** com `page >= 1` e `limit` no intervalo `[1, 100]`. Valores fora do intervalo SHALL ser clampados ou rejeitados (HTTP 400).
- **REQ-PERM-032**: O sistema SHOULD aplicar **cache de 60 segundos** (`@CacheTTL(60)`) na listagem geral, dado que o catálogo é raramente alterado.

#### Associação com Perfil

- **REQ-PERM-040**: A relação N:N entre `Permissao` e `Perfil` SHALL ser gerenciada pelo lado `Perfil` (FK e tabela de junção mantidas em `perfil.permissoes`).
- **REQ-PERM-041**: O sistema MUST permitir que uma permissão soft-deleted **continue associada** a um perfil (vínculo preservado para auditoria). O perfil SHALL continuar referenciando a permissão mesmo após soft-delete.
- **REQ-PERM-042**: O sistema MUST **NÃO permitir** hard-delete (`DELETE FROM`) de uma permissão enquanto existirem perfis vinculados. (Atualmente, a aplicação nem expõe endpoint de hard-delete — apenas soft-delete.)

#### Documentação e Observabilidade

- **REQ-PERM-050**: Todos os endpoints MUST ser documentados via Swagger (`@ApiTags('Permissões')`, `@ApiOperation`, `@ApiResponse`).
- **REQ-PERM-051**: O sistema MUST emitir **logs estruturados** (`Logger`) em todas as mutações: criação, atualização, soft-delete, restore.

### Requisitos Não-Funcionais

- **REQ-PERM-NFR-01** (Performance): Listagem paginada MUST responder em < 100ms (p99) com até 1000 permissões.
- **REQ-PERM-NFR-02** (Segurança): Endpoints MUST exigir JWT válido + permissão específica; rotas sem permissão válida MUST retornar HTTP 403.
- **REQ-PERM-NFR-03** (Auditoria): Toda mutação (create/update/delete/restore) MUST gerar log com `id`, `nome`, `usuarioLogado.userId`.
- **REQ-PERM-NFR-04** (Cache): Listagem geral MUST ter TTL ≤ 60s e ser invalidada manualmente após mutação (configuração de `@CacheInterceptor`).
- **REQ-PERM-NFR-05** (Rastreabilidade): Cada arquivo de código MUST conter comentários de cabeçalho referenciando BDD/SDD/ATDD/TDD conforme convenção `AGENTS.md`.

---

## Acceptance Criteria

- [x] **AC-01**: Criar permissão com `nome`, `codigo` e `descricao` válidos MUST retornar HTTP 201 com a entidade. *(BDD: `Cenário: Criar permissão com dados válidos`)*
- [x] **AC-02**: Criar permissão sem `nome` MUST retornar HTTP 400. *(BDD: `Cenário: Criar permissão sem nome`)*
- [x] **AC-03**: Criar permissão sem `codigo` MUST retornar HTTP 400. *(BDD: `Cenário: Criar permissão sem código`)*
- [x] **AC-04**: Criar permissão com `nome` já existente MUST retornar HTTP 409. *(BDD: `Cenário: Criar permissão com código duplicado`)*
- [x] **AC-05**: Listar permissões com `?page&limit` MUST retornar HTTP 200 com `data[]` e `total`. *(BDD: `Cenário: Listar permissões com paginação`)*
- [x] **AC-06**: Buscar permissão por ID existente MUST retornar HTTP 200 com a entidade. *(BDD: `Cenário: Buscar permissão por ID`)*
- [x] **AC-07**: Buscar permissão por ID inexistente MUST retornar HTTP 404. *(BDD: `Cenário: Buscar permissão por ID inexistente`)*
- [x] **AC-08**: Buscar permissão por nome (contains) MUST retornar HTTP 200 com permissões que contenham o termo. *(BDD: `Cenário: Buscar permissão por código` — variação no controller)*
- [x] **AC-09**: Atualizar permissão existente MUST retornar HTTP 200 com a entidade atualizada. *(BDD: `Cenário: Atualizar permissão`)*
- [x] **AC-10**: PATCH com `ativo: true` em permissão soft-deleted por ADMIN MUST restaurar (HTTP 200, `deletedAt: null`).
- [x] **AC-11**: PATCH com `ativo: true` em permissão NÃO deletada MUST retornar HTTP 409.
- [x] **AC-12**: PATCH com `ativo: false` por ADMIN MUST soft-deletar (HTTP 200, `deletedAt != null`).
- [x] **AC-13**: PATCH com `ativo: false` por NÃO-ADMIN MUST retornar HTTP 403.
- [x] **AC-14**: Usuário sem permissão específica MUST receber HTTP 403 em todas as rotas protegidas (gate via `@TemPermissao`).
- [x] **AC-15**: Permissões globais (escopo cross-tenant) MUST funcionar sem header `x-empresa-id`.

---

## API Specification

### Endpoint 1: `POST /permissoes` — Criar permissão

**Autorização**: `@TemPermissao('CREATE_PERMISSAO')`

**Request Body** (`CreatePermissaoDto`):

```json
{
  "nome": "read:usuarios",
  "codigo": "READ_USUARIOS",
  "descricao": "Permite visualizar usuários"
}
```

**Response** (201 Created):

```json
{
  "id": 7,
  "nome": "read:usuarios",
  "codigo": "READ_USUARIOS",
  "descricao": "Permite visualizar usuários",
  "ativo": true,
  "createdAt": "2026-06-15T10:00:00.000Z",
  "updatedAt": "2026-06-15T10:00:00.000Z",
  "deletedAt": null
}
```

**Error Responses**:

- `400 Bad Request`: `nome`, `codigo` ou `descricao` ausentes/inválidos.
- `401 Unauthorized`: JWT ausente ou inválido.
- `403 Forbidden`: usuário autenticado sem `CREATE_PERMISSAO`.
- `409 Conflict`: `nome` ou `codigo` já cadastrados.

---

### Endpoint 2: `GET /permissoes` — Listar permissões (paginado)

**Autorização**: `@TemPermissao('READ_PERMISSOES')`
**Cache**: `@CacheTTL(60)` (60 segundos)

**Query Parameters** (`PaginationDto`):

| Param  | Tipo    | Default | Descrição                |
|--------|---------|---------|--------------------------|
| page   | number  | 1       | Página (≥ 1).            |
| limit  | number  | 10      | Itens por página (1-100).|

**Response** (200 OK):

```json
{
  "data": [
    { "id": 1, "nome": "read:usuarios", "codigo": "READ_USUARIOS", "descricao": "...", "ativo": true, "createdAt": "...", "updatedAt": "...", "deletedAt": null }
  ],
  "total": 12,
  "page": 1,
  "limit": 10,
  "totalPages": 2
}
```

**Error Responses**:

- `401 Unauthorized`: JWT ausente.
- `403 Forbidden`: sem `READ_PERMISSOES`.

---

### Endpoint 3: `GET /permissoes/:id` — Buscar por ID

**Autorização**: `@TemPermissao('READ_PERMISSAO_BY_ID')`

**Path Parameters**:

- `id` (number, obrigatório): ID da permissão.

**Response** (200 OK): `Permissao` (sem soft-deleted por padrão).

**Error Responses**:

- `404 Not Found`: ID inexistente ou soft-deleted.

---

### Endpoint 4: `GET /permissoes/nome/:nome` — Buscar por nome (contains)

**Autorização**: `@TemPermissao('READ_PERMISSAO_BY_NOME')`

**Path Parameters**:

- `nome` (string, obrigatório): substring a buscar (case-sensitive).

**Query Parameters** (`PaginationDto`): `page`, `limit`.

**Response** (200 OK): `PaginatedResponseDto<Permissao>` com permissões cujo `nome` contém a substring.

> **Nota**: A spec BDD original mencionava `GET /permissoes/codigo/:codigo` (busca exata por `codigo`). O sistema atual implementa busca `contains` por `nome`. Decisão alinhada com UX de autocomplete em admin UIs. Ver Seção de Pendências no `proposal.md`.

---

### Endpoint 5: `PATCH /permissoes/:id` — Atualizar / Soft-Delete / Restore

**Autorização**: `@TemPermissao('UPDATE_PERMISSAO')`

**Path Parameters**:

- `id` (number, obrigatório): ID da permissão.

**Request Body** (`UpdatePermissaoDto`, parcial):

```json
{
  "nome": "read:usuarios",
  "descricao": "Nova descrição",
  "ativo": false
}
```

**Response** (200 OK): `Permissao` atualizada.

**Error Responses**:

- `400 Bad Request`: DTO inválido.
- `401 Unauthorized`: JWT ausente.
- `403 Forbidden`: sem `UPDATE_PERMISSAO` OU tentativa de restore/soft-delete por não-ADMIN.
- `404 Not Found`: ID inexistente.
- `409 Conflict`:
  - Tentativa de restore em permissão não-deletada.
  - Tentativa de soft-delete em permissão já deletada.

**Comportamento especial**:

- `ativo: true` em permissão soft-deleted → **restore** (exige ADMIN).
- `ativo: false` em permissão ativa → **soft-delete** (exige ADMIN).
- Outros campos (`nome`, `codigo`, `descricao`) → atualização simples, sem restrição ADMIN.

---

## Data Models

### Entity: `Permissao`

| Campo      | Tipo                | Required | Unique | Default | Descrição                                              |
|------------|---------------------|----------|--------|---------|--------------------------------------------------------|
| id         | number (Int, autoinc)| Yes      | Yes    | auto    | Chave primária.                                        |
| nome       | string              | Yes      | **Yes**| —       | Nome legível (ex.: `read:usuarios`).                  |
| codigo     | string              | Yes      | **Yes**| —       | Código canônico (ex.: `READ_USUARIOS`, SCREAMING_SNAKE).|
| descricao  | string              | Yes      | No     | —       | Descrição do que a permissão autoriza.                 |
| ativo      | boolean             | No       | No     | `true`  | Espelho lógico de `deletedAt` (ativo = não-deletado). |
| createdAt  | DateTime            | Yes      | No     | NOW     | Criação (herdado de `BaseEntity`).                     |
| updatedAt  | DateTime            | Yes      | No     | NOW     | Última atualização (herdado de `BaseEntity`).          |
| deletedAt  | DateTime \| null    | No       | No     | `null`  | Soft-delete (herdado de `BaseEntity`).                 |

### Repository Interface: `PermissaoRepository`

```typescript
interface PermissaoRepository {
  create(dto: CreatePermissaoDto): Promise<Permissao>;
  findAll(skip: number, take: number, includeDeleted?: boolean): Promise<[Permissao[], number]>;
  findOne(id: number, includeDeleted?: boolean): Promise<Permissao | null>;
  findByNome(nome: string): Promise<Permissao | null>;
  findByNomeContaining(nome: string, skip: number, take: number, includeDeleted?: boolean): Promise<[Permissao[], number]>;
  update(id: number, dto: UpdatePermissaoDto): Promise<Permissao | null>;
  remove(id: number): Promise<Permissao | null>;
  restore(id: number): Promise<Permissao | null>;
}
```

---

## Edge Cases

1. **Permissão soft-deleted mas referenciada por Perfil**: O vínculo N:N SHALL ser preservado. A permissão não SHALL aparecer em listagens padrão (`includeDeleted = false`), mas SHALL aparecer quando `findOne(id, true)` é chamado internamente para permitir restore.
2. **Restaurar permissão cujo `nome` foi re-aproveitado por outra ativa**: Cenário SHOULD ser detectado — a verificação `findByNome` SHALL ocorrer antes do restore. (Atualmente, o código não valida este caso; ver AC pendente.)
3. **Cache stale após mutação**: O `@CacheInterceptor` SHOULD ser invalidado manualmente em mutações. (Atualmente, o cache TTL de 60s é a única mitigação; mutações não invalidam.)
4. **Busca por `nome` com caracteres especiais (LIKE escape)**: O repositório SHALL escapar `%` e `_` para evitar injection/SQL wildcard leakage.
5. **Race condition no create**: Duas requisições simultâneas com mesmo `nome` podem ambas passar pela checagem e ambas criar. (Mitigação: constraint `@unique` no banco — segunda inserção falha com P2002 → tratado como 409.)
6. **Soft-delete de permissão usada em `@TemPermissao`**: O decorator SHALL continuar resolvendo o gate, mas como a permissão está deletada, ela não SHALL constar no JWT do usuário (gerado a partir do `Perfil.permissoes` atuais). Decisão: comportamento idempotente — gate nega acesso, mas sem erro.

---

## Acceptance Tests (ATDD — e2e)

Localização: `test/permissoes.e2e-spec.ts`

```typescript
describe('PermissoesController (e2e)', () => {
  // POST /permissoes
  it('deve criar uma permissão');                                       // AC-01
  it('deve retornar 403 se o usuário não tiver permissão para criar');   // AC-14
  it('deve retornar 400 se o nome estiver faltando');                   // AC-02
  it('deve retornar 409 se a permissão com o mesmo nome já existir');  // AC-04

  // GET /permissoes
  it('deve retornar uma lista paginada de permissões');                 // AC-05
  it('deve retornar 403 se o usuário não tiver permissão para ler');    // AC-14

  // GET /permissoes/:id
  it('deve retornar uma única permissão');                              // AC-06
  it('deve retornar 403 se o usuário não tiver permissão por ID');      // AC-14
  it('deve retornar 404 se a permissão não for encontrada');            // AC-07

  // GET /permissoes/nome/:nome
  it('deve retornar permissões que contêm a string no nome');           // AC-08
  it('deve retornar 403 sem permissão por nome');                       // AC-14
  it('deve retornar um array vazio se nenhuma permissão for encontrada');// AC-08 (edge)

  // PATCH /permissoes/:id
  it('deve atualizar uma permissão');                                   // AC-09
  it('deve retornar 403 sem permissão para atualizar');                 // AC-14
  it('deve retornar 404 se a permissão a ser atualizada não existe');   // AC-09 (edge)
  it('deve restaurar uma permissão deletada via PATCH {ativo:true}');  // AC-10
  it('deve retornar 403 se não for admin ao tentar restaurar');         // AC-11
  it('deve retornar 409 se tentar restaurar uma permissão não deletada');// AC-11
  it('deve realizar soft delete via PATCH {ativo:false}');              // AC-12
  it('deve retornar 403 se não for admin ao tentar deletar');           // AC-13
  it('deve retornar 409 se tentar deletar uma permissão já deletada'); // AC-13 (edge)
});
```

---

## TDD (Unit Tests)

Localização: `src/permissoes/application/services/permissoes.service.spec.ts`

Cobertura atual (resumo):

- `criação`: sucesso, duplicidade lança `ConflictException`.
- `busca de todos`: paginação padrão exclui deletados; `includeDeleted = true` inclui.
- `busca por um`: padrão exclui deletados; `includeDeleted = true` inclui; não encontrado lança `NotFoundException`.
- `busca por nome`: paginação padrão; `includeDeleted = true` inclui.
- `atualização`: sucesso; não encontrado lança `NotFoundException`; restore com `ativo: true` (admin); restore em não-deletada lança `ConflictException`; restore sem admin lança `ForbiddenException`; soft-delete com `ativo: false` (admin); soft-delete em já-deletada lança `ConflictException`; soft-delete sem admin lança `ForbiddenException`.
- `remoção`: sucesso (admin); não encontrado; não-admin lança `ForbiddenException`.
- `restauração`: sucesso (admin); não encontrado; não-deletada lança `ConflictException`; não-admin lança `ForbiddenException`.

---

## BDD Scenarios (Rastreabilidade)

Mapeamento BDD → requisitos (do arquivo `features/permissoes.feature`):

| # | Cenário BDD | REQ Coberto | AC Coberto |
|---|-------------|-------------|-----------|
| 1 | Criar permissão com dados válidos | REQ-PERM-001..010, NFR-05 | AC-01 |
| 2 | Criar permissão sem código | REQ-PERM-003, REQ-PERM-010 | AC-03 |
| 3 | Criar permissão com código duplicado | REQ-PERM-001, REQ-PERM-002 | AC-04 |
| 4 | Listar permissões com paginação | REQ-PERM-011, REQ-PERM-030, REQ-PERM-031, REQ-PERM-NFR-04 | AC-05 |
| 5 | Buscar permissão por ID | REQ-PERM-012 | AC-06 |
| 6 | Buscar permissão por código | REQ-PERM-013 (variação) | AC-08 |
| 7 | Buscar permissão por ID inexistente | REQ-PERM-012 | AC-07 |
| 8 | Atualizar permissão | REQ-PERM-014 | AC-09 |
| 9 | Criar permissão sem nome | REQ-PERM-003, REQ-PERM-010 | AC-02 |
| 10 | Permissão associada a perfil não pode ser removida | REQ-PERM-020, REQ-PERM-024, REQ-PERM-040..042 | AC-12/13 |
| 11 | Listar permissões por perfil | REQ-PERM-040 (escopo de `perfis`) | (fora do escopo desta CR) |

---

## Technical Notes

### Decorator de Autorização

```typescript
@TemPermissao('READ_PERMISSOES')
@Get()
findAll(...) { ... }
```

O decorator `@TemPermissao(...)` é resolvido por um `Guard` que:

1. Extrai o JWT do header `Authorization: Bearer <token>`.
2. Decodifica o payload (já hidratado com `empresas[].perfis[].permissoes[].codigo`).
3. Verifica se o `codigo` exigido está presente em **algum** dos perfis do usuário.
4. Se ausente, lança `ForbiddenException` (HTTP 403).
5. Se presente, prossegue.

### Auto-referência: Permissões do Próprio Módulo

O módulo `permissoes` consome 6 permissões próprias (`CREATE_PERMISSAO`, `READ_PERMISSOES`, `READ_PERMISSAO_BY_ID`, `READ_PERMISSAO_BY_NOME`, `UPDATE_PERMISSAO`, `DELETE_PERMISSAO`). Estas devem ser criadas via **seed/migration** e atribuídas a um perfil administrativo. Sem isso, o módulo é inacessível após deploy.

### Cache

O `@CacheInterceptor` + `@CacheTTL(60)` no `findAll` reduz carga no banco. **Limitação atual**: mutações (create/update/delete) NÃO invalidam o cache — confia-se no TTL de 60s. Para catálogo altamente estável, é aceitável; pode ser refinado futuramente.

### Soft-Delete: Padrão de Projeto

- `ativo` (boolean) e `deletedAt` (DateTime) são **mantidos em sincronia** pelo repositório/serviço.
- Toda query "padrão" filtra `deletedAt = null` e `ativo = true`.
- Soft-delete: setar `ativo = false`, `deletedAt = NOW()`.
- Restore: setar `ativo = true`, `deletedAt = null`.

### Tratamento de Exceções

| HTTP | Exceção Nest            | Quando                                          |
|------|--------------------------|-------------------------------------------------|
| 400  | `BadRequestException`    | DTO inválido (validation pipe).                 |
| 401  | `UnauthorizedException`  | JWT ausente / inválido.                          |
| 403  | `ForbiddenException`     | Sem permissão / não-admin tentando restore/delete.|
| 404  | `NotFoundException`      | ID inexistente.                                  |
| 409  | `ConflictException`      | `nome`/`codigo` duplicado, restore não-deletado, soft-delete já-deletado.|

---

## Status

- [x] Draft
- [x] In Review (retroativo)
- [x] Approved (CR retroativo)
- [x] Implemented (em produção, com pendências menores documentadas)

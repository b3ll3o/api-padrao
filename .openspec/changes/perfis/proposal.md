# Feature: Perfis (perfis) — Change Request

> **Tipo**: Change Request retroativo. A feature `perfis` já está implementada e este documento registra formalmente a decisão de design, requisitos e tasks cumpridas.

## Why

A API `api-padrao` adota um modelo **multi-tenant com RBAC (Role-Based Access Control) granular por empresa**: cada `Usuario` é vinculado a uma ou mais `Empresa`, e em cada empresa recebe um ou mais `Perfil`, onde cada `Perfil` agrega um conjunto de `Permissao`. Sem um cadastro de `Perfil` por empresa, o `@TemPermissao` (guard global) e o payload do JWT emitido por `auth` não têm como expressar políticas distintas para a Empresa A e Empresa B.

A feature `perfis` foi introduzida para estabelecer:

1. **Perfis escopados por empresa** — um `Perfil` pertence a **uma** `Empresa` (`empresaId` FK). A unicidade de `nome` e `codigo` é composta: `(nome, empresaId)` e `(codigo, empresaId)`. Isso permite que Empresa A e Empresa B tenham um "ADMIN" com permissões diferentes.
2. **Associação N:N com `Permissao`** — um `Perfil` agrega um conjunto de permissões globais. A tabela de junção `perfil_permissao` é gerenciada pela migration Prisma e exposta via `permissoes?: Permissao[]` no DTO/entidade.
3. **Associação N:M com `Usuario`** via `UsuarioEmpresa` — um `Perfil` é atribuído a usuários dentro do vínculo usuário-empresa (não diretamente em `Usuario`).
4. **Endpoints CRUD com escopo de tenancy** — todas as operações de leitura/escrita **devem** considerar o contexto da empresa (header `x-empresa-id` + tenant no payload do JWT).
5. **Soft delete recuperável** — a remoção é lógica (campos `ativo: boolean` e `deletedAt: DateTime`); o flag `ativo` no `UpdatePerfilDto` aciona restore (true) ou soft delete (false) e é restrito a perfis com código `ADMIN`.

A solução foi escolhida em vez de perfis globais para refletir o modelo de tenancy já estabelecido em `empresas` e sustentado pelo guard multi-tenant do `auth`.

## What Changes

### Adiciona

- **Endpoints REST** (todos sob `Bearer JWT` e guard `@TemPermissao`):
  - `POST /perfis` — cria um perfil vinculado a uma empresa; valida duplicidade de `nome` por `empresaId`; valida existência das `Permissao` referenciadas.
  - `GET /perfis` — lista paginada (`PaginationDto`) filtrada por `empresaId` (escopo de tenancy).
  - `GET /perfis/:id` — busca por ID com escopo de tenancy.
  - `GET /perfis/nome/:nome` — busca paginada por `contains` (case-insensitive) no `nome`, com escopo de tenancy.
  - `PATCH /perfis/:id` — atualiza nome/codigo/descricao/permissoes/ativo; o flag `ativo` é tratado como soft-delete/restore e exige perfil `ADMIN` no vínculo do `usuarioLogado`.
- **Modelo de persistência** (Prisma) — tabela `perfis`:
  - `id` (PK, autoincrement), `nome`, `codigo`, `descricao`, `empresaId` (FK), `ativo` (bool), `deletedAt` (DateTime, nullable), timestamps.
  - Unique composta: `(nome, empresaId)` e `(codigo, empresaId)` — registrada em migration.
  - Tabela de junção `perfil_permissao` (N:N) com `perfilId` + `permissaoId`.
- **Camada de domínio**:
  - Entidade `Perfil` (estende `BaseEntity`).
  - Repositório abstrato `PerfilRepository` (contrato de domínio).
  - Repositório concreto `PrismaPerfilRepository` (infraestrutura, usa `prisma.extended.perfil` para ignorar soft-deleted por padrão e `prisma.perfil` quando `includeDeleted=true`).
- **Serviço de aplicação** `PerfisService` com regras de negócio:
  - `create()` valida permissões referenciadas e rejeita duplicidade de `nome` por empresa (`ConflictException`).
  - `findAll/findOne/findByNomeContaining` aceitam `empresaId` opcional para escopo de tenancy.
  - `update()` valida `permissoesIds`; se `ativo` vier no body, exige que `usuarioLogado` possua perfil com `codigo === 'ADMIN'` em **alguma** das empresas (`ForbiddenException` caso contrário); `ativo: true` em perfil já ativo → `ConflictException`; `ativo: false` em perfil já deletado → `ConflictException`.
- **DTOs** validados com `class-validator`:
  - `CreatePerfilDto` — `nome`, `codigo`, `descricao`, `empresaId` (todos obrigatórios), `permissoesIds` (opcional, array de `number`).
  - `UpdatePerfilDto extends PartialType(CreatePerfilDto)` — adiciona `ativo?: boolean` (soft delete/restore).
- **Documentação BDD** com **11 cenários** em `features/perfis.feature` (criação válida, validações, conflito, listagem, busca por ID, atualização, gestão de permissões, busca por nome, etc.).
- **Módulo NestJS** `PerfisModule` — provê `PerfisService` + `PerfilRepository` (binding para `PrismaPerfilRepository`); importa `PrismaModule` e `forwardRef(() => PermissoesModule)`.

### Não altera (escopo)

- Não cria permissões globais (vive no change `permissoes`).
- Não vincula perfis diretamente a `Usuario` (a relação é N:M via `UsuarioEmpresa`).
- Não implementa exclusão física (hard delete) — soft delete apenas, com restore.
- Não introduz auditoria própria (consome a auditoria cross-cutting do projeto via `AuditInterceptor`).

## Impact

| Área | Tipo de impacto | Descrição |
|------|-----------------|-----------|
| Banco de dados | Migration | Nova tabela `perfis` + tabela de junção `perfil_permissao`; índice único composto em `(nome, empresaId)` e `(codigo, empresaId)`; FK para `empresas`. |
| Outros módulos | Dependência | `auth` consome perfis no payload JWT; `permissoes` é consultado em validação de create/update; `usuarios` referencia perfis via `UsuarioEmpresa`. |
| Segurança | Endurecimento | Todas as rotas protegidas por `@TemPermissao` com permissões específicas (`CREATE_PERFIL`, `READ_PERFIS`, `READ_PERFIL_BY_ID`, `READ_PERFIL_BY_NOME`, `UPDATE_PERFIL`). Escopo de tenancy obrigatório em todas as queries. |
| Operacional | Configuração | Nenhuma env nova; apenas herda de `auth`/`prisma`. |
| API pública | Contrato | 5 novos endpoints REST sob `/perfis`; header `x-empresa-id` documentado. |
| Testes | Cobertura | 11 cenários BDD + 5 testes e2e + 18+ testes unitários do service. |

### Usuários impactados

- **Consumidores da API**: precisam enviar `x-empresa-id` em todas as chamadas e respeitar o conjunto de permissões atribuído ao seu perfil de usuário.
- **Operações**: perfis são cadastrados por empresa; revogação é feita por `ativo: false` (soft delete), não por exclusão física.

## Risks

Todos os riscos abaixo são **baixos** porque a feature já está implementada, testada (unit + e2e + BDD) e em uso. Esta documentação é retroativa.

| Risco | Probabilidade | Impacto | Mitigação existente |
|-------|---------------|---------|---------------------|
| Vazamento cross-tenant (perfil de outra empresa) | Baixa | Alto | Todas as queries filtram por `empresaId` quando o contexto está presente; testes e2e validam isolamento. |
| Duplicação de `nome`/`codigo` entre empresas | N/A | N/A | Permitido por design (escopo por empresa). |
| Restauro indevido por usuário não-admin | Baixa | Médio | `update()` exige `codigo === 'ADMIN'` no payload do `usuarioLogado` antes de aceitar `ativo`. |
| Bloat do payload de `GET /perfis` com `permissoes` | Baixa | Baixo | `include: { permissoes: true }` é fixo, mas a relação é curada pela FK; otimização futura pode fazer `select`. |
| Acoplamento via `forwardRef` com `PermissoesModule` | Baixa | Baixo | Resolve ciclo entre `perfis ↔ permissoes` (perfis validam permissões; permissoes referenciam perfis). |
| Soft delete vira "deletado permanente" se ninguém restaurar | Baixa | Baixo | Restore via `PATCH { ativo: true }`; admin consegue auditar via `includeDeleted: true`. |
| Busca `findByNome` exata vs `findByNomeContaining` confunde consumidor | Baixa | Baixo | Rota `GET /perfis/nome/:nome` documentada como `contains` (paginado). Conflito de unicidade é detectado em `create()` via `findByNome` exato. |

## Status

- [x] Implementado
- [x] Testado (BDD + ATDD + TDD)
- [x] Documentado (este CR + `src/perfis/README.md` + `AGENTS.md`)

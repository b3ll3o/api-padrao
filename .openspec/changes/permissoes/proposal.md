# Change Request: Permissões (Permissões Atômicas Globais)

> **Status**: Retroativo (Change Request documentado após implementação)
> **Módulo**: `src/permissoes/`
> **Tipo**: CRUD de domínio atômico + governança

---

## 1. Resumo

Esta Change Request documenta retroativamente a feature **Permissões** do projeto `api-padrao`. A feature já se encontra **implementada, testada e em produção**, mas carecia de Change Request formal conforme exige o workflow DDD → BDD → SDD → ATDD → TDD descrito em `AGENTS.md`.

A feature implementa o catálogo de **permissões atômicas globais** do sistema, que são atribuídas a `Perfis` (N:N) e consumidas em tempo de execução pelo decorator `@TemPermissao(...)` para autorizar endpoints HTTP.

---

## 2. Contexto e Motivação

A autorização em uma API multi-tenant baseada em RBAC (Role-Based Access Control) precisa separar **dois eixos ortogonais**:

1. **Quem é o usuário?** → entidade `Usuario` + vínculo com `Empresa` (tenant).
2. **O que ele pode fazer?** → entidade `Perfil` (escopado por empresa) ↔ entidade `Permissao` (átomo global, cross-tenant).

Permissões representam **ações concretas que o sistema sabe executar** (ex.: `CREATE_USER`, `READ_USUARIOS`, `DELETE_PERMISSAO`). Por serem a unidade mínima de autorização e por serem referenciadas **literalmente** no código-fonte via decorator `@TemPermissao('READ_USUARIOS')`, elas **não podem variar por empresa** — caso contrário, o mesmo decorator teria semântica diferente em tenants diferentes, tornando o código de aplicação inseguro e não-determinístico.

A separação **Perfil (escopado) ↔ Permissão (global)** é o que viabiliza:

- Reutilizar o mesmo conjunto de permissões em todas as empresas;
- Versionar capacidades no código sem migração por tenant;
- Aplicar o **princípio do menor privilégio** ao construir perfis;
- Auditar gates de autorização de forma centralizada (catalogável).

---

## 3. Escopo

### 3.1 Dentro do escopo

- CRUD da entidade `Permissao` (criar, listar paginado, buscar por ID, buscar por nome, atualizar, restaurar).
- Unicidade global de `nome` e `codigo`.
- Soft-delete via flag `ativo` + `deletedAt` (com restauração restrita a administradores).
- Associação N:N entre `Permissao` e `Perfil` (apenas via `Perfil`; permissão não gerencia o lado inverso diretamente).
- Catálogo global: `x-empresa-id` é **opcional** nestas rotas (não há escopo por tenant).
- Documentação Swagger completa via `@ApiTags('Permissões')` + `@ApiOperation` + `@ApiResponse`.
- Cache de 60s para listagem geral (catálogo é estático, leitura pesada).

### 3.2 Fora do escopo

- Associação direta de permissões a `Usuario` (sempre via `Perfil`).
- Permissões escopadas por empresa (vedado por design).
- Versionamento de permissões (mudanças de `codigo` são feitas via migration + refactor coordinated).
- Multi-idioma de `descricao` (apenas PT-BR por enquanto).
- Auditoria detalhada de mudanças em permissões (log básico via `Logger` apenas).

---

## 4. Decisões de Design (resumo executivo)

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| Escopo da permissão | **Global** (não por empresa) | Decorator `@TemPermissao` é estático no código; escopo por tenant quebraria autorização. |
| Identidade canônica | `codigo` (string única) | É o que aparece literalmente no código (`@TemPermissao('READ_USUARIOS')`). |
| Identidade legível | `nome` (string única) | Apresentação em UI, logs e mensagens de erro. |
| Unicidade | `nome` **e** `codigo` `@unique` globais | Impede colisão cross-tenant e ambiguidade. |
| Exclusão | Soft-delete (`ativo`/`deletedAt`) | Preserva integridade referencial com `Perfil` e auditoria. |
| Restauração | Apenas `ADMIN` (via `AuthorizationService.isAdmin`) | Operação sensível, evita privilege escalation. |
| Listagem geral | Cache 60s (`@CacheTTL(60)`) | Catálogo é leitura pesada, alteração rara. |
| Busca por nome | Contains + paginado (`GET /permissoes/nome/:nome`) | UX: usuário digita parte do nome. |
| Header `x-empresa-id` | Opcional (não escopado) | Conforme governança descrita em `src/permissoes/README.md`. |

---

## 5. Modelo Conceitual (DDD)

### 5.1 Entidade

`Permissao` (aggregate root) — herda de `BaseEntity` (campos `id`, `createdAt`, `updatedAt`, `deletedAt`, `ativo`).

```text
Permissao {
  id:        number   (PK)
  nome:      string   (@unique, global)
  codigo:    string   (@unique, global)
  descricao: string
  ativo:     boolean  (default true)
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt: DateTime | null
}
```

### 5.2 Relacionamentos

- `Permissao` **N:N** ↔ `Perfil` (lado inverso gerenciado por `Perfil`).
- `Permissao` **N:N** ↔ `Usuario` indireto (sempre via `Perfil` + `UsuarioEmpresa`).

### 5.3 Invariantes de Domínio

- INV-PERM-01: `nome` SHALL ser único globalmente (case-sensitive, validado no repositório).
- INV-PERM-02: `codigo` SHALL ser único globalmente e SHOULD seguir convenção `SCREAMING_SNAKE_CASE`.
- INV-PERM-03: `descricao` SHOULD ser não vazia.
- INV-PERM-04: Permissão "ativa" SHALL ter `deletedAt === null` e `ativo === true`.
- INV-PERM-05: Permissão "deletada" SHALL ter `deletedAt !== null` e `ativo === false`.
- INV-PERM-06: Uma permissão associada a um `Perfil` SHALL poder ser soft-deleted (não há constraint FK bloqueante; o vínculo N:N é preservado).

---

## 6. Endpoints (resumo)

5 endpoints REST sob `/permissoes`:

| # | Método | Path | Permissão de Acesso | Descrição |
|---|--------|------|---------------------|-----------|
| 1 | `POST` | `/permissoes` | `CREATE_PERMISSAO` | Criar nova permissão (admin). |
| 2 | `GET`  | `/permissoes` | `READ_PERMISSOES` | Listar paginado (cache 60s). |
| 3 | `GET`  | `/permissoes/:id` | `READ_PERMISSAO_BY_ID` | Buscar por ID. |
| 4 | `GET`  | `/permissoes/nome/:nome` | `READ_PERMISSAO_BY_NOME` | Buscar por nome (contains, paginado). |
| 5 | `PATCH`| `/permissoes/:id` | `UPDATE_PERMISSAO` | Atualizar / soft-delete / restore (admin). |

> **Nota**: O endpoint `GET /permissoes/codigo/:codigo` aparece na spec BDD original (`features/permissoes.feature:Cenário: Buscar permissão por código`), mas **não foi implementado** no controller atual. O sistema de teste e2e cobre o endpoint `GET /permissoes/nome/:nome` como variação. Ver seção "Pendências" abaixo.

---

## 7. Permissões Próprias (auto-referência)

A própria entidade consome 6 permissões de catálogo que a protegem:

- `CREATE_PERMISSAO`
- `READ_PERMISSOES`
- `READ_PERMISSAO_BY_ID`
- `READ_PERMISSAO_BY_NOME`
- `UPDATE_PERMISSAO`
- `DELETE_PERMISSAO`

Estas permissões devem ser criadas via seed/migration inicial e atribuídas a um perfil administrativo global (ex.: `ADMIN`).

---

## 8. Pendências / Divergências Identificadas

1. **Endpoint `GET /permissoes/codigo/:codigo` documentado mas não implementado.**
   - Spec BDD: `features/permissoes.feature:Cenário: Buscar permissão por código`.
   - Controller atual expõe apenas `GET /permissoes/nome/:nome` (busca por nome, contains).
   - **Recomendação**: ou implementar o endpoint, ou atualizar a spec BDD para refletir a decisão de design final (busca por nome é mais flexível via `contains`).

2. **Endpoint `DELETE /permissoes/:id` documentado no BDD mas não exposto no controller.**
   - Spec BDD: `features/permissoes.feature:Cenário: Permissão associada a perfil não pode ser removida`.
   - Controller atual usa `PATCH` com `ativo: false` para soft-delete (decisão consciente, evita DELETE físico).
   - **Recomendação**: alinhar a spec BDD ao contrato HTTP atual (PATCH com flag `ativo`).

3. **Endpoint `GET /perfis/:id/permissoes` documentado no BDD mas pertence ao módulo `perfis`.**
   - Spec BDD: `features/permissoes.feature:Cenário: Listar permissões por perfil`.
   - Esse endpoint está fora do escopo desta CR; pertence à CR de `perfis`.
   - **Recomendação**: mover/remover este cenário do `features/permissoes.feature` (pertence à feature de perfis).

---

## 9. Critérios de Aceitação Globais

A feature é considerada **PRONTA** quando:

- AC-G-01: Todos os 11 cenários BDD em `features/permissoes.feature` estão refletidos nos testes e2e ou marcados como remoções/movimentações justificadas.
- AC-G-02: Todos os testes unitários em `src/permissoes/application/services/permissoes.service.spec.ts` passam.
- AC-G-03: Todos os testes e2e em `test/permissoes.e2e-spec.ts` passam.
- AC-G-04: O decorator `@TemPermissao` consegue autorizar corretamente os 5 endpoints com base no JWT do usuário.
- AC-G-05: Soft-delete e restore funcionam corretamente, com autorização de admin verificada.
- AC-G-06: Documentação Swagger acessível em `/api/docs#/Permissões`.
- AC-G-07: Cache de listagem está invalidado/ativo corretamente.
- AC-G-08: Pendências da Seção 8 estão rastreadas em issues ou resolvidas.

---

## 10. Rastreabilidade

| Artefato | Caminho |
|----------|---------|
| Spec BDD | `features/permissoes.feature` |
| Testes unitários (TDD) | `src/permissoes/application/services/permissoes.service.spec.ts` (+ `dto/*.spec.ts`, `domain/entities/*.spec.ts`) |
| Testes e2e (ATDD) | `test/permissoes.e2e-spec.ts` |
| Implementação | `src/permissoes/` (DDD: domain, application, infrastructure, dto) |
| Especificação SDD | `.openspec/changes/permissoes/design.md` |
| Tasks | `.openspec/changes/permissoes/tasks.md` |
| Documentação de módulo | `src/permissoes/README.md` |
| Decorator consumidor | `src/auth/application/decorators/temPermissao.decorator.ts` |
| Serviço de autorização | `src/shared/domain/services/authorization.service.ts` |

---

## 11. Próximos Passos

1. Validar este CR com stakeholders (engenharia + segurança).
2. Resolver as 3 pendências da Seção 8.
3. Promover para `.openspec/specs/permissoes.md` após todas as pendências serem fechadas.
4. Auditar quais `@TemPermissao(...)` literals existem no código e garantir que cada um aponta para uma permissão cadastrada (inventário).

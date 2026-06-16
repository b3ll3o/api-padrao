# Módulo de Perfis (`perfis`)

Gerencia os perfis de acesso (ex.: ADMIN, GESTOR, OPERADOR) vinculados às empresas. O modelo multi-tenant e o decorator `@TemPermissao` estão em [AGENTS.md](../../AGENTS.md).

## Funcionalidades

- CRUD de perfis contextuais.
- Atribuição de permissões aos perfis.
- Busca por nome ou código.

## Endpoints

### Criar Perfil

- **URL**: `POST /perfis`
- **Permissão**: `CREATE_PERFIL`.
- **Contexto**: exige `x-empresa-id` se a criação for vinculada a uma empresa específica.

### Listar Perfis

- **URL**: `GET /perfis`
- **Permissão**: `READ_PERFIS`.
- **Contexto**: exige `x-empresa-id` para filtrar perfis da empresa.
- **Parâmetros**: `PaginationDto` (`page`, `limit`).

### Buscar Perfil por ID

- **URL**: `GET /perfis/:id`
- **Permissão**: `READ_PERFIL_BY_ID`.
- **Contexto**: exige `x-empresa-id`.

### Buscar Perfil por Nome

- **URL**: `GET /perfis/nome/:nome`
- **Permissão**: `READ_PERFIS`.
- **Contexto**: exige `x-empresa-id` (perfis são escopados por empresa, então o mesmo nome pode existir em empresas diferentes).
- **Resposta 200**: perfil correspondente.
- **Resposta 404**: nenhum perfil com esse nome na empresa.

### Atualizar Perfil

- **URL**: `PATCH /perfis/:id`
- **Permissão**: `UPDATE_PERFIL`.
- **Contexto**: exige `x-empresa-id`.

## Conceito de Escopo

Os perfis **não são globais**. Eles pertencem a uma empresa específica (`empresaId`). Isso permite que a Empresa A tenha um perfil "Gerente" com permissões diferentes do perfil "Gerente" da Empresa B. Todas as operações de Perfis devem informar o contexto da empresa através do header `x-empresa-id`.

## Documentação relacionada

- [AGENTS.md](../../AGENTS.md) — fonte canônica: arquitetura, multi-tenancy, `@TemPermissao`.
- [src/permissoes/README.md](../permissoes/README.md) — permissões globais atribuídas aos perfis.

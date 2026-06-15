# Módulo de Empresas (`empresas`)

Responsável pelo gerenciamento das entidades de Empresa e pela vinculação de usuários a elas (multi-tenancy). O modelo multi-tenant e os decorators estão em [AGENTS.md](../../AGENTS.md).

## Funcionalidades

- CRUD de empresas.
- Soft delete de empresas.
- Vinculação de usuários a empresas com perfis específicos.
- Listagem de usuários por empresa.

## Endpoints

### Criar Empresa

- **URL**: `POST /empresas`
- **Permissão**: `CREATE_EMPRESA`.

### Listar Empresas

- **URL**: `GET /empresas`
- **Parâmetros**: `PaginationDto` (`page`, `limit`).
- **Permissão**: `READ_EMPRESAS`.

### Buscar Empresa por ID

- **URL**: `GET /empresas/:id`
- **Permissão**: `READ_EMPRESA_BY_ID`.

### Atualizar Empresa

- **URL**: `PATCH /empresas/:id`
- **Permissão**: `UPDATE_EMPRESA`.

### Remover Empresa (soft delete)

- **URL**: `DELETE /empresas/:id`
- **Permissão**: `DELETE_EMPRESA`.

### Adicionar Usuário à Empresa

- **URL**: `POST /empresas/:id/usuarios`
- **Descrição**: vincula um usuário existente à empresa e atribui perfis a ele.
- **Permissão**: `ADD_USER_TO_EMPRESA`.

### Listar Usuários da Empresa

- **URL**: `GET /empresas/:id/usuarios`
- **Permissão**: `READ_EMPRESA_USUARIOS`.

## Regras de Negócio

- Uma empresa possui um `responsavelId` (Usuário).
- Usuários podem estar vinculados a múltiplas empresas via a entidade `UsuarioEmpresa`.
- A deleção de uma empresa seta `deletedAt` e `ativo: false`.

## Documentação relacionada

- [AGENTS.md](../../AGENTS.md) — fonte canônica: arquitetura, modelo multi-tenant, decorators.
- [src/usuarios/README.md](../usuarios/README.md) — entidade `UsuarioEmpresa` (vínculo).
- [src/perfis/README.md](../perfis/README.md) — perfis atribuídos no vínculo.

# Módulo de Empresas (`empresas`)

Responsável pelo gerenciamento das entidades de Empresa e pela vinculação de usuários a elas (Multi-tenancy).

## Funcionalidades
- CRUD de empresas.
- Soft delete de empresas.
- Vinculação de usuários a empresas com perfis específicos.
- Listagem de usuários por empresa.

## Endpoints

### 1. Criar Empresa
- **URL**: `POST /empresas`
- **Permissão**: `CREATE_EMPRESA`

### 2. Listar Empresas
- **URL**: `GET /empresas`
- **Parâmetros**: `PaginationDto` (page, limit)
- **Permissão**: `READ_EMPRESAS`

### 3. Buscar Empresa por ID
- **URL**: `GET /empresas/:id`
- **Permissão**: `READ_EMPRESA_BY_ID`

### 4. Atualizar Empresa
- **URL**: `PATCH /empresas/:id`
- **Permissão**: `UPDATE_EMPRESA`

### 5. Remover Empresa (Soft Delete)
- **URL**: `DELETE /empresas/:id`
- **Permissão**: `DELETE_EMPRESA`

### 6. Adicionar Usuário à Empresa
- **URL**: `POST /empresas/:id/usuarios`
- **Descrição**: Vincula um usuário existente à empresa e atribui perfis a ele.
- **Permissão**: `ADD_USER_TO_EMPRESA`

### 7. Listar Usuários da Empresa
- **URL**: `GET /empresas/:id/usuarios`
- **Permissão**: `READ_EMPRESA_USUARIOS`

## Regras de Negócio
- Uma empresa possui um `responsavelId` (Usuário).
- Usuários podem estar vinculados a múltiplas empresas via a entidade `UsuarioEmpresa`.
- A deleção de uma empresa seta `deletedAt` e `ativo: false`.

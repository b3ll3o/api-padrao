# Módulo de Perfis (`perfis`)

Gerencia os perfis de acesso (ex: ADMIN, GESTOR, OPERADOR) vinculados às empresas.

## Funcionalidades
- CRUD de perfis contextuais.
- Atribuição de permissões aos perfis.
- Busca por nome ou código.

## Endpoints

### 1. Criar Perfil
- **URL**: `POST /perfis`
- **Permissão**: `CREATE_PERFIL`
- **Contexto**: Exige `x-empresa-id` se a criação for vinculada a uma empresa específica.

### 2. Listar Perfis
- **URL**: `GET /perfis`
- **Permissão**: `READ_PERFIS`
- **Contexto**: Exige `x-empresa-id` para filtrar perfis da empresa.
- **Parâmetros**: `PaginationDto` (page, limit).

### 3. Buscar Perfil por ID
- **URL**: `GET /perfis/:id`
- **Permissão**: `READ_PERFIL_BY_ID`
- **Contexto**: Exige `x-empresa-id`.

### 4. Atualizar Perfil
- **URL**: `PATCH /perfis/:id`
- **Permissão**: `UPDATE_PERFIL`
- **Contexto**: Exige `x-empresa-id`.

## Conceito de Escopo
Os perfis **não são globais**. Eles pertencem a uma empresa específica (`empresaId`). Isso permite que a Empresa A tenha um perfil "Gerente" com permissões diferentes do perfil "Gerente" da Empresa B. Todas as operações de Perfis devem informar o contexto da empresa através do header `x-empresa-id`.

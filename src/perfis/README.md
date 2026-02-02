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

### 2. Listar Perfis da Empresa
- **URL**: `GET /perfis`
- **Contexto**: Exige `x-empresa-id`.
- **Permissão**: `READ_PERFIS`

### 3. Buscar Perfil por ID
- **URL**: `GET /perfis/:id`
- **Permissão**: `READ_PERFIL_BY_ID`

### 4. Atualizar Perfil
- **URL**: `PATCH /perfis/:id`
- **Permissão**: `UPDATE_PERFIL`

## Conceito de Escopo
Os perfis **não são globais**. Eles pertencem a uma empresa específica (`empresaId`). Isso permite que a Empresa A tenha um perfil "Gerente" com permissões diferentes do perfil "Gerente" da Empresa B.

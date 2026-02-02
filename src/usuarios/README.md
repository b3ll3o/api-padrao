# Módulo de Usuários (`usuarios`)

Gerencia o cadastro, perfis e dados dos usuários do sistema.

## Funcionalidades
- Cadastro de novos usuários.
- Gestão de dados pessoais (e-mail, senha).
- Consulta de empresas às quais o usuário pertence.
- Soft delete e restauração de conta.

## Endpoints

### 1. Criar Usuário (Auto-cadastro)
- **URL**: `POST /usuarios`
- **Acesso**: Público.
- **Regra**: Valida se o e-mail já existe.

### 2. Listar Usuários
- **URL**: `GET /usuarios`
- **Permissão**: `READ_USUARIOS` (Geralmente restrito a admins).

### 3. Buscar Meu Perfil / Usuário por ID
- **URL**: `GET /usuarios/:id`
- **Permissão**: `READ_USUARIO_BY_ID`
- **Regra**: O usuário só pode acessar seus próprios dados, a menos que possua permissão de admin.

### 4. Atualizar Usuário
- **URL**: `PATCH /usuarios/:id`
- **Permissão**: `UPDATE_USUARIO`
- **Regra**: Suporta restauração (setar `ativo: true`) e soft delete.

### 5. Listar Empresas do Usuário
- **URL**: `GET /usuarios/:id/empresas`
- **Permissão**: `READ_USUARIO_EMPRESAS`

## Segurança
- Senhas são hasheadas usando `bcrypt` antes de salvar.
- O campo `senha` nunca é retornado nas consultas (uso de `@Exclude`).
- Deleções são lógicas.

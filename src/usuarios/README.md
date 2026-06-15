# Módulo de Usuários (`usuarios`)

Gerencia o cadastro e os dados dos usuários do sistema, incluindo o vínculo com empresas. Arquitetura, soft delete, paginação e decorators customizados estão em [AGENTS.md](../../AGENTS.md).

## Funcionalidades

- Cadastro de novos usuários.
- Gestão de dados pessoais (e-mail, senha).
- Consulta de empresas às quais o usuário pertence.
- Soft delete e restauração de conta.

## Endpoints

### Criar Usuário (auto-cadastro)

- **URL**: `POST /usuarios`
- **Acesso**: público.
- **Regra**: valida se o e-mail já existe.

### Listar Usuários

- **URL**: `GET /usuarios`
- **Permissão**: `READ_USUARIOS` (geralmente restrito a admins).
- **Parâmetros**: `PaginationDto` (`page`, `limit`).

### Buscar Usuário por ID

- **URL**: `GET /usuarios/:id`
- **Permissão**: `READ_USUARIO_BY_ID`.
- **Regra**: o usuário só pode acessar seus próprios dados, a menos que possua permissão de admin.

### Atualizar Usuário

- **URL**: `PATCH /usuarios/:id`
- **Permissão**: `UPDATE_USUARIO`.
- **Regra**: suporta restauração (`ativo: true`) e soft delete.

### Listar Empresas do Usuário

- **URL**: `GET /usuarios/:id/empresas`
- **Permissão**: `READ_USUARIO_EMPRESAS`.

## Segurança

- Senhas são hasheadas usando `bcrypt` antes de salvar.
- O campo `senha` nunca é retornado nas consultas (via `@Exclude()` na entidade + `ClassSerializerInterceptor` global).
- Deleções são lógicas (soft delete via `BaseEntity`).

## Documentação relacionada

- [AGENTS.md](../../AGENTS.md) — fonte canônica: arquitetura, comandos, soft delete, decorators.
- [src/shared/README.md](../shared/README.md) — `BaseEntity`, paginação, exception filter.
- [src/empresas/README.md](../empresas/README.md) — vínculo usuário↔empresa.

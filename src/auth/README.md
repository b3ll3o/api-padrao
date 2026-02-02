# Módulo de Autenticação (`auth`)

Este módulo é responsável pela segurança da API, gerenciando o acesso dos usuários através de Tokens JWT.

## Funcionalidades
- Autenticação de usuários via e-mail e senha.
- Geração de tokens JWT contendo informações de perfil e empresa.
- Proteção de rotas via `AuthGuard`.
- Controle de acesso granular via `PermissaoGuard`.

## Endpoints

### 1. Login
- **URL**: `POST /auth/login`
- **Descrição**: Autentica um usuário e retorna um Access Token JWT.
- **Payload**: `LoginUsuarioDto` (email, senha).
- **Acesso**: Público.

## Mecanismos de Proteção

### `AuthGuard` (Global)
Todas as rotas da API são protegidas por padrão, exigindo um token JWT válido no header `Authorization: Bearer <token>`.

### Decorador `@Public()`
Utilizado para abrir exceções na proteção global, permitindo acesso sem token (ex: login, criação de conta).

### Decorador `@TemPermissao(...permissoes)`
Utilizado para restringir o acesso a usuários que possuem permissões específicas no contexto da empresa informada.

## Fluxo de Autenticação
1. O usuário envia credenciais para `/auth/login`.
2. O sistema valida as credenciais e busca os perfis/permissões do usuário na empresa.
3. Um JWT é gerado contendo:
    - `sub`: ID do usuário.
    - `email`: E-mail do usuário.
    - `empresas`: Lista de empresas e perfis vinculados.

# Módulo de Autenticação (`auth`)

Responsável pela segurança da API: tokens JWT, validação de acesso e controle por permissões. Detalhes de decorators globais, guards e `@TemPermissao` estão em [AGENTS.md](../../AGENTS.md).

## Funcionalidades

- Autenticação de usuários via e-mail e senha.
- Geração de tokens JWT contendo perfis e empresas vinculadas.
- Proteção de rotas via `AuthGuard` (global).
- Controle de acesso granular via `PermissaoGuard` + `@TemPermissao(...)`.

## Endpoints

### Login

- **URL**: `POST /auth/login`
- **Descrição**: autentica um usuário e retorna `access_token` + `refresh_token`.
- **Payload**: `LoginUsuarioDto` (`email`, `senha`).
- **Acesso**: público (`@Public()`).

## Mecanismos de Proteção

### AuthGuard (global)

Todas as rotas da API são protegidas por padrão, exigindo `Authorization: Bearer <token>`. Veja [src/auth/application/guards/auth.guard.ts](./application/guards/auth.guard.ts).

### `@Public()`

Usado em `auth/login` e em endpoints de health para abrir exceção à proteção global.

### `@TemPermissao(...permissoes)`

Restringe o acesso a usuários que possuem as permissões listadas **no contexto da empresa** informada via `x-empresa-id`. Veja [src/auth/application/decorators/temPermissao.decorator.ts](./application/decorators/temPermissao.decorator.ts).

## Fluxo de Autenticação

1. O usuário envia credenciais para `/auth/login`.
2. O sistema valida as credenciais e busca os perfis/permissões do usuário em cada empresa onde ele atua.
3. Um JWT é gerado contendo:
   - `sub`: ID do usuário.
   - `email`: e-mail do usuário.
   - `empresas`: lista de empresas e perfis vinculados.

## Documentação relacionada

- [AGENTS.md](../../AGENTS.md) — fonte canônica: arquitetura, comandos, guards, env vars.
- [src/shared/README.md](../shared/README.md) — `EmpresaContext`, interceptors, decorators.
